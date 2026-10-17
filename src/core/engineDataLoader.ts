import type { Chart, DataLoader, DataLoaderGetBarsParams, KLineData, Period as EnginePeriod } from 'klinecharts'
import type { Datafeed, Period, SymbolInfo, ChartProOptions, HistorySnapshot, HistoryResult, HistoryQuery, ChartDataState, DatafeedStatus, ChartSnapshot } from '../types'
import {readHistory,validateHistorySnapshot} from '../datafeed/history'
import {bindIdentityEpoch} from './identityEpoch'

export function toEnginePeriod(period: Period): EnginePeriod {
  if (!['second', 'minute', 'hour', 'day', 'week', 'month', 'year'].includes(period.timespan) || !Number.isInteger(period.multiplier) || period.multiplier <= 0) {
    throw new Error('图表周期无效')
  }
  return { type: period.timespan as EnginePeriod['type'], span: period.multiplier }
}
export function sameSeries(a: {symbol: SymbolInfo; period: Period}, b: {symbol: SymbolInfo; period: Period}): boolean {
  return a.symbol.ticker === b.symbol.ticker && a.period.timespan === b.period.timespan && a.period.multiplier === b.period.multiplier
}
export function validateBars(bars: KLineData[]): void {
  let previous = -Infinity
  for (const bar of bars) {
    if (![bar.timestamp, bar.open, bar.high, bar.low, bar.close].every(Number.isFinite) || bar.timestamp <= previous ||
      bar.high < Math.max(bar.open, bar.close, bar.low) || bar.low > Math.min(bar.open, bar.close, bar.high) ||
      (bar.volume !== undefined && (!Number.isFinite(bar.volume) || bar.volume < 0))) throw new Error('行情包含重复时标或无效 OHLCV')
    previous = bar.timestamp
  }
}
export function historySnapshot<T extends HistorySnapshot>(result:T):T {
  validateHistorySnapshot(result)
  return result
}
const changed = (a: KLineData, b: KLineData): boolean => ['open','high','low','close','volume'].some(key => a[key] !== b[key])
export interface ConfirmedSeries {symbol:SymbolInfo;period:Period;basis?:string;confirmed:boolean;epoch:number;revision:number;replay:boolean;cutoff?:number}
type ReadingState=Pick<ChartDataState,'lastRead'|'connection'|'revisionRequired'|'errorCode'|'operation'>&{hasMoreBefore?:boolean}
interface Hooks {
  committed?:(state:ConfirmedSeries)=>void
  state?: ChartProOptions['onDataState']
  loading: (loading: boolean) => void
  ready: NonNullable<ChartProOptions['onDataReady']>
  error: NonNullable<ChartProOptions['onError']>
  price: (bar: KLineData) => void
}
/** One writer and one subscription per chart; all asynchronous work belongs to its generation. */
export class EngineDataLoader implements DataLoader {
  private publishing=0
  private alignmentRevision=0
  private identityEpoch=0
  private resumeCheckpoint?:{reading:ReadingState;bars:KLineData[];basis?:string;confirmed:boolean;replay?:KLineData[];suspended:boolean;anchor?:number;anchorX?:number;space:number}
  private generation = 0
  private pageSequence = 0
  private requests = new Set<AbortController>()
  private current?: {symbol: SymbolInfo; period: Period}
  private subscription?: {symbol: SymbolInfo; period: Period;pending:KLineData[]}
  private stream?: (bar: KLineData) => void
  private prepared?: Omit<HistoryResult,'metadata'> & {read?:ChartDataState['lastRead'];completion?:{resolve:()=>void;reject:(error:unknown)=>void}}
  private reading:ReadingState={connection:'unknown',revisionRequired:false}
  private stopStatus?:()=>void
  private statusQueue?:DatafeedStatus[]
  private failed?:{query:HistoryQuery;operation:'initial'|'load-more'|'reload';requireComplete?:boolean;earliestTimestamp?:number}
  private retryTask?:Promise<void>
  private basis?: string
  private pendingSnapshot?: ChartSnapshot
  private snapshotTask?: Promise<void>
  private suspended = false
  private replay?: KLineData[]
  private confirmed = false
  private disposed = false
  private restoring = false
  private readError?: string
  constructor(private chart: Chart, private feed: Datafeed, private hooks: Hooks) {bindIdentityEpoch(chart,()=>this.identityEpoch);chart.setDataLoader(this)}
  private emitState():void {
    if(this.resumeCheckpoint||this.publishing)return
    if(this.current&&!this.disposed)this.hooks.committed?.({...this.current,basis:this.basis,confirmed:this.confirmed,epoch:this.identityEpoch,revision:this.alignmentRevision,replay:!!this.replay,cutoff:this.replay?.at(-1)?.timestamp})
    if(this.current && !this.disposed)this.hooks.state?.({...this.current,basis:this.basis,timestamp:this.chart.getDataList().at(-1)?.timestamp,restoring:this.restoring,replay:!!this.replay,error:this.readError,...this.reading,dataStatus:!this.confirmed?'unconfirmed':this.chart.getDataList().length?'ready':'empty'})
  }
  private setLoading(active:boolean):void {this.restoring=active;this.hooks.loading(active);this.emitState()}
  private reportError(error:Parameters<NonNullable<ChartProOptions['onError']>>[0]):void {this.readError=error.message;this.reading.errorCode=(error.raw as {code?:string})?.code;this.hooks.error(error);this.emitState()}
  private invalidate(): void {
    ++this.generation
    this.prepared?.completion?.reject(new DOMException('History cancelled','AbortError'));this.prepared=undefined
    for (const request of this.requests) request.abort()
    this.requests.clear()
    this.stopSubscription()
    this.stopStatus?.();this.stopStatus=undefined;this.statusQueue=undefined
    this.stream = undefined
  }
  private stopSubscription(): void {
    if (this.subscription) {this.subscription.pending.length=0;this.feed.unsubscribe(this.subscription.symbol, this.subscription.period)}
    this.subscription = undefined
  }
  activate(symbol: SymbolInfo, period: Period): void {
    if (this.disposed) return
    this.invalidate()
    ++this.identityEpoch
    this.resumeCheckpoint=undefined
    this.confirmed = false
    this.prepared = undefined
    this.basis = undefined
    this.pendingSnapshot = undefined
    this.snapshotTask = undefined
    this.suspended = false
    this.readError=undefined
    this.reading={connection:'unknown',revisionRequired:false};this.failed=undefined;this.retryTask=undefined
    this.replay = undefined
    this.current = {symbol: {...symbol}, period: {...period}}
    this.emitState()
    // v10 merges symbols. Explicitly clear absent decoration instead of inheriting another instrument.
    const cleared = Object.fromEntries(Object.keys(this.chart.getSymbol() ?? {}).map(key => [key, undefined]))
    const previousPeriod = this.chart.getPeriod()
    const previousSymbol = this.chart.getSymbol()
    const nextSymbol = {...cleared, ...symbol, pricePrecision: symbol.pricePrecision ?? 2, volumePrecision: symbol.volumePrecision ?? 0}
    const symbolChanged = JSON.stringify(previousSymbol) !== JSON.stringify(nextSymbol)
    const periodChanged = previousPeriod?.type !== period.timespan || previousPeriod?.span !== period.multiplier
    if (symbolChanged) this.chart.setSymbol(nextSymbol)
    if (periodChanged) this.chart.setPeriod(toEnginePeriod(period))
    if (!symbolChanged && !periodChanged) this.chart.resetData()
  }
  getBars = async (request: DataLoaderGetBarsParams): Promise<void> => {
    const identity = this.current
    if (this.disposed || !identity || request.symbol.ticker !== identity.symbol.ticker ||
      request.period.type !== identity.period.timespan || request.period.span !== identity.period.multiplier) return
    const generation = this.generation, page = ++this.pageSequence
    const active = () => !this.disposed && generation === this.generation && (request.type === 'init' || page === this.pageSequence)
    if (this.replay) {
      if (request.type === 'init') { this.confirmed = true; request.callback(this.replay, {forward:false, backward:false});++this.alignmentRevision;this.emitState() }
      else request.callback([], {forward:false, backward:false})
      return
    }
    if (request.type !== 'init' && request.type !== 'forward') {request.callback([], {backward:false});return}
    const controller = new AbortController()
    this.requests.add(controller)
    this.setLoading(true)
    let prepared:typeof this.prepared
    let attempt:typeof this.failed
    let previous:{reading:ReadingState;basis?:string;confirmed:boolean;error?:string}|undefined
    try {
      if(!active()||controller.signal.aborted)return
      const query:HistoryQuery={kind:'before',before:request.type==='init'?Date.now():(request.timestamp??0),countBack:500}
      const operation=request.type==='init'?'initial':'load-more'
      if(!(request.type==='init'&&this.prepared))this.reading.operation=operation
      let result:HistoryResult,read:ChartDataState['lastRead']
      if(request.type==='init'&&this.prepared){prepared=this.prepared;this.prepared=undefined;result=prepared;read=prepared.read}
      else {
        attempt={query,operation};this.failed=attempt
        this.startStatus()
        if(!active()||controller.signal.aborted)return
        result=await readHistory(this.feed,identity.symbol,identity.period,query,{signal:controller.signal,reason:operation})
        read={query:{...query},metadata:result.metadata&&{...result.metadata},hasMoreBefore:result.hasMoreBefore}
      }
      const {bars,basis}=historySnapshot(result)
      if (!active() || controller.signal.aborted) return
      previous={reading:structuredClone(this.reading),basis:this.basis,confirmed:this.confirmed,error:this.readError}
      if (request.type === 'init') {this.confirmed = true;this.basis=basis;this.suspended=false}
      else if (bars.length>0 && basis !== this.basis) throw new Error('历史复权口径已变化，请重试重新加载行情')
      this.reading.lastRead=read
      this.reading.hasMoreBefore=result.hasMoreBefore
      this.reading.errorCode=undefined
      this.readError=undefined
      // Engine callbacks may synchronously install subscriptions and reenter host code.
      // Publish one complete commit, and never let an old callback mutate its successor.
      ++this.publishing
      try{request.callback(bars,{forward:result.hasMoreBefore??true,backward:false})}
      finally{--this.publishing}
      if(this.disposed||generation!==this.generation||controller.signal.aborted){prepared?.completion?.reject(new DOMException('History cancelled','AbortError'));this.emitState();return}
      if(this.failed===attempt)this.failed=undefined
      ++this.alignmentRevision
      this.emitState()
      if(!active()||controller.signal.aborted){prepared?.completion?.reject(new DOMException('History cancelled','AbortError'));return}
      if (request.type === 'init'&&!this.resumeCheckpoint) this.hooks.ready(identity)
      prepared?.completion?.resolve()
    } catch (error) {
      if(prepared?.completion){prepared.completion.reject(error);return}
      if (!active() || controller.signal.aborted) return
      if(previous){this.reading=previous.reading;this.basis=previous.basis;this.confirmed=previous.confirmed;this.readError=previous.error}
      if(attempt)this.failed=attempt
      if (request.type === 'init') this.confirmed = false
      this.reportError({type:request.type === 'init' ? 'data-fetch' : 'load-more',message:error instanceof Error ? error.message : '行情读取失败',raw:error})
      // An init callback clears the data; only first/new identities use this failure path.
      request.callback([], {forward:false, backward:false})
    } finally {
      this.requests.delete(controller)
      if (active()) this.setLoading(false)
    }
  }
  subscribeBar: NonNullable<DataLoader['subscribeBar']> = ({callback}) => {
    if (this.disposed || !this.confirmed || !this.current) return
    this.stopSubscription()
    this.stream = callback
    if (this.replay||this.resumeCheckpoint) return
    this.startSubscription()
    queueMicrotask(() => {void this.drainSnapshots().catch(()=>{})})
  }
  private startSubscription():void {
    if(!this.current)return
    const identity=this.current,generation=this.generation
    this.startStatus()
    if(this.disposed||this.current!==identity||generation!==this.generation)return
    const subscription={...identity,pending:[] as KLineData[]}
    this.subscription=subscription
    try {this.feed.subscribe(identity.symbol,identity.period,bar=>{
      if(this.disposed||generation!==this.generation||this.subscription!==subscription||this.replay)return
      if(this.resumeCheckpoint){subscription.pending.push({...bar});return}
      this.push(bar)
    })} catch(error) {this.stopSubscription();throw error}
  }
  private acceptStatus(status:DatafeedStatus):void {
    if(status.type==='connection')this.reading.connection=status.state
    else if(status.type==='revision-required'){this.reading.revisionRequired=true;this.readError=status.message??'历史数据已修订，请重新加载';this.reading.errorCode='REVISION_REQUIRED'}
    else {this.readError=status.message;this.reading.errorCode=status.code}
    this.emitState()
  }
  private startStatus():void {
    if(this.stopStatus||!this.current||!this.feed.subscribeStatus)return
    const identity=this.current,generation=this.generation
    let owned=true,release:(()=>void)|undefined
    const stop=()=>{owned=false;release?.();release=undefined}
    this.stopStatus=stop
    try {
      const cleanup=this.feed.subscribeStatus(identity.symbol,identity.period,status=>{
        if(!owned||this.disposed||generation!==this.generation)return
        if(this.resumeCheckpoint){(this.statusQueue??=[]).push({...status});return}
        this.acceptStatus(status)
      })
      if(!owned||this.disposed||generation!==this.generation||this.stopStatus!==stop){cleanup();if(this.stopStatus===stop)this.stopStatus=undefined}
      else release=cleanup
    }catch(error){owned=false;if(this.stopStatus===stop)this.stopStatus=undefined;throw error}
  }

  private flushSubscription():void {
    const statuses=this.statusQueue??[];this.statusQueue=undefined
    for(const status of statuses)this.acceptStatus(status)
    const subscription=this.subscription;if(!subscription)return
    const pending=subscription.pending;subscription.pending=[]
    for(const bar of pending){if(this.disposed||this.subscription!==subscription)return;this.push(bar)}
  }
  unsubscribeBar = (): void => {this.stopSubscription();this.stream=undefined}
  push(bar: KLineData): void {
    if (this.disposed || !this.stream || this.replay || this.suspended || this.resumeCheckpoint) return
    try { validateBars([bar]) } catch (error) {this.reportError({type:'invalid-bar',message:String(error),raw:bar});return}
    const latest = this.chart.getDataList().at(-1)
    if (latest && bar.timestamp < latest.timestamp) {
      this.reading.revisionRequired=true
      this.reportError({type:'historical-revision',message:'历史修订需要重载，不进入实时报警',raw:bar});return
    }
    this.stream(bar)
    this.emitState()
    this.hooks.price(bar)
  }
  applySnapshot(snapshot: ChartSnapshot): Promise<void> {
    if (!this.current || !sameSeries(snapshot,this.current) || this.disposed) return Promise.reject(new Error('行情快照与当前标的或周期不匹配'))
    try {validateHistorySnapshot(snapshot)} catch(error) {return Promise.reject(error)}
    this.pendingSnapshot = {...snapshot,bars:snapshot.bars.map(bar=>({...bar}))}
    return this.drainSnapshots()
  }
  private drainSnapshots(): Promise<void> {
    if (this.snapshotTask) return this.snapshotTask
    if (!this.confirmed || !this.stream || this.replay || this.resumeCheckpoint || !this.pendingSnapshot) return Promise.resolve()
    const generation = this.generation
    const task = (async () => {
      while (this.pendingSnapshot && !this.replay && !this.resumeCheckpoint && !this.disposed && generation === this.generation) {
        const snapshot=this.pendingSnapshot;this.pendingSnapshot=undefined
        const data=this.chart.getDataList(),last=data.at(-1)?.timestamp ?? -Infinity
        const existing=new Map(data.map(bar=>[bar.timestamp,bar]))
        const basisChanged=snapshot.basis !== this.basis
        const revision=snapshot.bars.some(bar=>bar.timestamp<last && (!existing.has(bar.timestamp) || changed(existing.get(bar.timestamp)!,bar)))
        if (this.suspended || basisChanged || revision) {await this.reload(true,basisChanged,snapshot.bars[0]?.timestamp);break}
        for(const bar of snapshot.bars) if(bar.timestamp>=last && (!existing.has(bar.timestamp)||changed(existing.get(bar.timestamp)!,bar)))this.push(bar)
      }
    })().finally(()=>{
      if(this.snapshotTask!==task)return
      this.snapshotTask=undefined
      if(this.pendingSnapshot && !this.replay && !this.resumeCheckpoint && !this.disposed)queueMicrotask(()=>{void this.drainSnapshots().catch(()=>{})})
    })
    this.snapshotTask=task
    return this.snapshotTask
  }
  retry():Promise<void> {
    if(this.retryTask)return this.retryTask
    const failed=this.failed
    if(!failed)return Promise.resolve()
    const task=this.reload(true,failed.requireComplete,failed.earliestTimestamp,failed.operation==='load-more'?failed.query:undefined)
      .finally(()=>{if(this.retryTask===task)this.retryTask=undefined})
    this.retryTask=task;return task
  }
  /** Prefetch before reset; failure leaves the confirmed data, drawings and viewport intact. */
  async reload(preserveViewport = true, requireComplete = false, earliestTimestamp = Infinity, retryQuery?:HistoryQuery): Promise<void> {
    if (this.disposed || !this.current) throw new DOMException('行情恢复已取消或图表尚未就绪','AbortError')
    const generation = this.generation, identity = this.current, controller = new AbortController()
    this.requests.add(controller)
    let completionGeneration = generation
    let transaction:ReturnType<EngineDataLoader['beginRestore']>|undefined
    const initialData = this.chart.getDataList()
    const initialBars=new Map(initialData.map(bar=>[bar.timestamp,{...bar}]))
    const query:HistoryQuery=retryQuery??(initialData.length?{kind:'range',from:Math.min(initialData[0].timestamp,earliestTimestamp),to:Math.max(Date.now(),initialData.at(-1)!.timestamp+1)}:{kind:'before',before:Date.now(),countBack:500})
    const attempt={query,operation:retryQuery?'load-more' as const:'reload' as const,requireComplete,earliestTimestamp}
    this.failed=attempt
    this.reading.operation=retryQuery?'load-more':'reload'
    this.readError=undefined
    try {
      this.setLoading(true)
      if (this.disposed || generation !== this.generation || controller.signal.aborted) throw new DOMException('行情恢复已取消','AbortError')
      const result = await readHistory(this.feed,identity.symbol,identity.period,query,{signal:controller.signal,reason:retryQuery?'load-more':'resume'})
      if(result.metadata?.state==='partial')throw Error('历史区间尚未完整，保留旧图；请重试')
      if (this.disposed || generation !== this.generation || controller.signal.aborted) throw new DOMException('行情恢复已取消','AbortError')
      // Keep confirmed pagination, stream updates and viewport changes made during prefetch.
      const data = this.chart.getDataList(), range = this.chart.getVisibleRange(), space = this.chart.getBarSpace().bar
      const anchor = data[Math.min(data.length-1, Math.max(0,range.to-1))]?.timestamp
      const anchorX=anchor===undefined?undefined:(this.chart.convertToPixel({timestamp:anchor},{paneId:'candle_pane'}) as {x?:number}|undefined)?.x
      const basisChanged = result.basis !== this.basis
      if(retryQuery&&data.length&&basisChanged)throw Error('历史复权口径已变化，请重新加载行情')
      const timestamps=new Set(result.bars.map(bar=>bar.timestamp))
      if ((requireComplete || basisChanged) && data.some(bar=>!timestamps.has(bar.timestamp))) throw new Error('新复权口径未覆盖全部已加载历史，保留旧图；请重试')
      // A delayed range response may predate a confirmed update to the current candle.
      const concurrent=data.filter(bar=>{const original=initialBars.get(bar.timestamp);return !original||Object.keys(bar).some(key=>bar[key]!==original[key])})
      const bars=(basisChanged || requireComplete) ? result.bars : [...new Map([...data,...result.bars,...concurrent].map(bar=>[bar.timestamp,bar])).values()].sort((a,b)=>a.timestamp-b.timestamp)
      if(!this.resumeCheckpoint)transaction=this.beginRestore()
      // The prefetch has finished; invalidation must not abort its completed signal.
      this.requests.delete(controller)
      this.invalidate()
      completionGeneration = this.generation
      this.replay = undefined
      const initialized=new Promise<void>((resolve,reject)=>{this.prepared={bars,basis:result.basis,hasMoreBefore:result.hasMoreBefore,read:{query:{...query},metadata:result.metadata&&{...result.metadata},hasMoreBefore:result.hasMoreBefore},completion:{resolve,reject}}})
      this.chart.resetData()
      await initialized
      if(this.disposed||this.current!==identity||completionGeneration!==this.generation)throw new DOMException('行情恢复已取消','AbortError')
      transaction?.prepare()
      if(this.disposed||this.current!==identity||completionGeneration!==this.generation)throw new DOMException('行情恢复已取消','AbortError')
      if (preserveViewport && anchor !== undefined) {
        this.chart.setBarSpace(space)
        const index = bars.findIndex(bar => bar.timestamp === anchor)
        if (index >= 0) this.restoreAnchor(anchor!,anchorX,space)
      }
      this.reading.revisionRequired=false
      transaction?.commit()
      if(this.disposed||this.current!==identity||completionGeneration!==this.generation)throw new DOMException('行情恢复已取消','AbortError')
      if(this.failed===attempt)this.failed=undefined
    } catch (error) {
      const current=!this.disposed&&this.current===identity&&completionGeneration===this.generation&&!controller.signal.aborted
      transaction?.rollback()
      if(current&&transaction&&this.current===identity)completionGeneration=this.generation
      if (current&&!this.disposed&&this.current===identity&&completionGeneration===this.generation&&!controller.signal.aborted) {
        this.failed=attempt
        this.reportError({type:'data-reload',message:error instanceof Error ? error.message : '行情恢复失败',raw:error})
      }
      throw error
    } finally {this.requests.delete(controller);if(!this.disposed && this.current===identity && completionGeneration===this.generation)this.setLoading(false)}
  }
  private restoreAnchor(timestamp:number,x:number|undefined,space:number):void {
    const index=this.chart.getDataList().findIndex(bar=>bar.timestamp===timestamp)
    if(index<0)return
    this.chart.scrollToDataIndex(index,0)
    const currentX=(this.chart.convertToPixel({timestamp},{paneId:'candle_pane'}) as {x?:number}|undefined)?.x
    if(x!==undefined&&currentX!==undefined)this.chart.scrollByDistance(x-currentX,0)
    else this.chart.scrollByDistance(space/2,0)
  }
  /** Composite restore owns both visible bars and their provenance until every member succeeds. */
  beginReplayResume():{prepare:()=>void;commit:()=>void;rollback:()=>void} {
    if(this.resumeCheckpoint||!this.replay||!this.current)throw Error('当前没有可恢复的回放')
    return this.beginRestore()
  }
  private beginRestore():{prepare:()=>void;commit:()=>void;rollback:()=>void} {
    const data=this.chart.getDataList(),range=this.chart.getVisibleRange()
    const checkpoint={reading:structuredClone(this.reading),bars:data.map(b=>({...b})),basis:this.basis,confirmed:this.confirmed,replay:this.replay?.map(b=>({...b})),suspended:this.suspended,anchor:data[Math.min(data.length-1,Math.max(0,range.to-1))]?.timestamp,anchorX:(this.chart.convertToPixel({timestamp:data[Math.min(data.length-1,Math.max(0,range.to-1))]?.timestamp},{paneId:'candle_pane'}) as {x?:number}|undefined)?.x,space:this.chart.getBarSpace().bar}
    this.resumeCheckpoint=checkpoint
    const active=()=>!this.disposed&&this.resumeCheckpoint===checkpoint
    let prepared=false
    const prepare=()=>{if(!active())throw new DOMException('回放恢复已取消','AbortError');if(!prepared){this.startSubscription();if(!active())throw new DOMException('回放恢复已取消','AbortError');prepared=true}}
    return {
      prepare,
      commit:()=>{prepare();const identity=this.current,generation=this.generation;this.resumeCheckpoint=undefined;this.flushSubscription();if(this.disposed||this.current!==identity||this.generation!==generation)return;this.emitState();if(this.disposed||this.current!==identity||this.generation!==generation)return;if(identity)this.hooks.ready(identity);if(this.disposed||this.current!==identity||this.generation!==generation)return;queueMicrotask(()=>{void this.drainSnapshots().catch(()=>{})})},
      rollback:()=>{if(!active())return;this.invalidate();if(!active())return;this.basis=checkpoint.basis;this.confirmed=checkpoint.confirmed;this.replay=checkpoint.replay;this.prepared=checkpoint.replay?undefined:{bars:checkpoint.bars,basis:checkpoint.basis,hasMoreBefore:checkpoint.reading.hasMoreBefore,read:checkpoint.reading.lastRead};this.chart.resetData();if(!active())return;this.confirmed=checkpoint.confirmed;this.suspended=checkpoint.replay?checkpoint.suspended:true;this.reading=checkpoint.reading;this.resumeCheckpoint=undefined;this.chart.setBarSpace(checkpoint.space);const index=this.chart.getDataList().findIndex(b=>b.timestamp===checkpoint.anchor);if(index>=0)this.restoreAnchor(checkpoint.anchor!,checkpoint.anchorX,checkpoint.space);this.emitState()}
    }
  }
  setReplay(bars: KLineData[]): void {
    if(this.resumeCheckpoint){this.basis=this.resumeCheckpoint.basis;this.confirmed=this.resumeCheckpoint.confirmed;this.resumeCheckpoint=undefined}
    this.invalidate()
    this.replay = bars
    this.setLoading(false)
    this.chart.resetData()
  }
  pushReplay(bar: KLineData): void {if(this.replay){this.replay=[...this.replay,bar];this.stream?.(bar);this.emitState()}}
  dispose(): void {if(!this.disposed){this.disposed=true;this.invalidate();bindIdentityEpoch(this.chart)}}
}
