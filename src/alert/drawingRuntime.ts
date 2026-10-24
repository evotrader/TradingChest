import {createOpaqueId} from '../ids'
import type {ChartDataState,Period,SymbolInfo} from '../types'
import type {ConfirmedSeries} from '../core/engineDataLoader'
import type {DrawingSnapshot} from '../drawing/types'
import {evaluateDrawingAlert} from './drawingEvaluator'
import {drawingAlertTools,sameDrawingAlertIdentity,sameDrawingAlertPeriod,validateDrawingAlertDocument,validateDrawingAlertRule} from './drawingDocument'
import type {DrawingAlertCommand,DrawingAlertCommandResult,DrawingAlertDocumentV1,DrawingAlertEvent,DrawingAlertGeometry,DrawingAlertIdentity,DrawingAlertMarkers,DrawingAlertRule,DrawingAlertSample,DrawingAlertState,DrawingAlertStatus} from './drawingTypes'

type Mode='live'|'replay'
type Track=DrawingAlertMarkers&{status:DrawingAlertStatus;reason?:string;records:DrawingAlertEvent[];previous?:DrawingAlertSample}
type Entry={rule:DrawingAlertRule;enabled:boolean;live:Track;replay:Track;replayTriggeredBars:Set<number>;geometryKey?:string}
interface Context {series:ConfirmedSeries;state:ChartDataState;bars:readonly DrawingAlertSample[];axis:'linear'|'percentage'|'log';axisId?:string}
interface Options {
  scope?:string
  source:(id:string)=>DrawingSnapshot|undefined
  uncertain:(id:string)=>boolean
  restoring:()=>boolean
  changed?:(state:DrawingAlertState[])=>void
  invalidated?:(read:()=>DrawingAlertState[])=>void
  trigger?:(event:DrawingAlertEvent)=>void
  replayTrigger?:(event:DrawingAlertEvent)=>void
  error?:(error:unknown)=>void
}
const clone=<T>(value:T):T=>structuredClone(value)
const track=():Track=>({hasTriggered:false,status:'waiting',records:[]})
const identity=(symbol:SymbolInfo,basis?:string):DrawingAlertIdentity=>({ticker:symbol.ticker,...Object.fromEntries(['market','exchange','priceCurrency'].filter(key=>symbol[key as keyof SymbolInfo]!==undefined).map(key=>[key,symbol[key as keyof SymbolInfo]])),...(basis!==undefined?{basis}:{})})
const period=(value:Period)=>({multiplier:value.multiplier,timespan:value.timespan})
/** Consumes the loader's paired commit/state seam, never unconfirmed engine previews. */
export class DrawingAlertRuntime {
  readonly scope:string
  private entries=new Map<string,Entry>()
  private context?:Context
  private consumed?:string
  private currentMode:Mode='live'
  private disposed=false
  constructor(private options:Options){this.scope=options.scope??createOpaqueId();if(typeof this.scope!=='string'||!this.scope)throw Error('画线提醒 scope 不能为空')}
  private safely(callback:(()=>void)|undefined):void{try{callback?.()}catch(error){try{this.options.error?.(error)}catch{}}}
  private emit():void{if(this.disposed)return;if(this.options.changed)this.safely(()=>this.options.changed!(this.getState()));if(this.options.invalidated)this.safely(()=>this.options.invalidated!(()=>this.getState()))}
  private clear(entry:Entry):void{entry.live.previous=undefined;entry.replay.previous=undefined}
  private getSource(rule:DrawingAlertRule):DrawingSnapshot {
    const source=this.options.source(rule.drawingLogicalId)
    if(!source||source.owner!==rule.sourceOwner||source.backendId!==rule.backendId)throw Error('提醒来源已删除或身份已改变，请重新选择来源')
    if(source.overlay.name!==rule.toolId)throw Error('提醒来源工具已改变')
    return source
  }
  private geometry(source:DrawingSnapshot):DrawingAlertGeometry {
    if(!drawingAlertTools.includes(source.overlay.name as any))throw Error('此工具暂不支持画线提醒')
    if(source.presentation?.scope&&source.presentation.scope!=='chart'||source.migration)throw Error('画线提醒仅支持本图作用域的已确认来源')
    if((source.overlay.paneId??'candle_pane')!=='candle_pane'||source.yAxisId&&source.yAxisId!==this.context?.axisId)throw Error('画线提醒只支持主价格窗格的默认价格轴')
    const anchors=source.anchors
    if(!anchors||anchors.some(anchor=>anchor.kind!=='market')||anchors.length!==(source.overlay.name==='horizontalStraightLine'?1:2))throw Error('画线提醒需要完整的市场时间锚点；后续根数／视口锚点暂不支持')
    return {toolId:source.overlay.name as DrawingAlertGeometry['toolId'],anchors:clone(anchors) as DrawingAlertGeometry['anchors']}
  }
  getState():DrawingAlertState[]{
    return [...this.entries.values()].map(entry=>{
      const {previous:ignored,...live}=entry.live,{previous:ignoredReplay,...replay}=entry.replay
      return clone({rule:entry.rule,enabled:entry.enabled,...live,replay})
    })
  }
  capture():DrawingAlertDocumentV1 {
    return clone({version:1,scope:this.scope,rules:[...this.entries.values()].map(({rule,live})=>({rule,hasTriggered:live.hasTriggered,...(live.lastBarTimestamp!==undefined?{lastBarTimestamp:live.lastBarTimestamp}:{})}))})
  }
  sourceReason(id:string):string|undefined {
    try{
      if(!this.context?.series.confirmed||this.context.state.dataStatus!=='ready')throw Error('请先加载已确认行情')
      const source=this.options.source(id)
      if(!source||this.options.uncertain(id)||this.options.restoring())throw Error('绘图来源尚未确认，请等待或刷新原来源')
      if(source.owner==='backend'&&!source.backendId)throw Error('后端来源缺少已确认身份，请刷新原来源')
      this.geometry(source)
    }catch(error){return error instanceof Error?error.message:String(error)}
  }
  restore(value:DrawingAlertDocumentV1):void {
    if(this.disposed)throw Error('图表已关闭')
    validateDrawingAlertDocument(value,this.scope)
    const next=new Map<string,Entry>()
    for(const item of value.rules){
      // Rules for another series remain paused; only current-context rules can bind here.
      const matches=this.context&&sameDrawingAlertIdentity(item.rule.identity,identity(this.context.series.symbol,this.context.series.basis))&&sameDrawingAlertPeriod(item.rule.period,this.context.series.period)
      if(matches)this.geometry(this.getSource(item.rule))
      next.set(item.rule.id,{rule:clone(item.rule),enabled:false,live:{...track(),hasTriggered:item.hasTriggered,lastBarTimestamp:item.lastBarTimestamp,status:'paused',reason:'已恢复为暂停；继续监控保留去重，重置并启用会清除去重'},replay:{...track(),status:'paused'},replayTriggeredBars:new Set()})
    }
    this.entries=next;this.emit()
  }
  execute(command:DrawingAlertCommand):DrawingAlertCommandResult {
    if(this.disposed)return {status:'rejected',message:'图表已关闭'}
    try {
      if(command.type==='create'){
        const context=this.context
        if(!context||!context.series.confirmed||context.state.dataStatus!=='ready')throw Error('请先加载已确认行情再添加提醒')
        const source=this.options.source(command.drawingLogicalId)
        if(!source||this.options.uncertain(command.drawingLogicalId)||this.options.restoring())throw Error('绘图来源尚未确认，请等待或刷新原来源')
        const geometry=this.geometry(source),id=command.id??createOpaqueId()
        const rule:DrawingAlertRule={id,drawingLogicalId:source.logicalId,sourceOwner:source.owner,...(source.owner==='backend'?{backendId:source.backendId}:{}),toolId:geometry.toolId,identity:identity(context.series.symbol,context.series.basis),period:period(context.series.period),condition:command.condition??'crossing',frequency:command.frequency??'once',...(command.message!==undefined?{message:command.message}:{})}
        validateDrawingAlertRule(rule)
        if(this.entries.has(id))throw Error('画线提醒 ID 已存在')
        this.entries.set(id,{rule,enabled:true,live:track(),replay:track(),replayTriggeredBars:new Set(),geometryKey:JSON.stringify([geometry,context.axis])});this.emit()
        return {status:'completed',id}
      }
      const entry=this.entries.get(command.id)
      if(!entry)throw Error('画线提醒不存在')
      if(command.type==='delete')this.entries.delete(command.id)
      else if(command.type==='update'){
        if(!command.patch||Object.keys(command.patch).some(key=>!['condition','frequency','message'].includes(key)))throw Error('不能通过更新更换提醒来源或身份')
        const next={...entry.rule,...clone(command.patch)};validateDrawingAlertRule(next)
        this.geometry(this.getSource(next))
        const comparisonChanged=next.condition!==entry.rule.condition||next.frequency!==entry.rule.frequency
        if(comparisonChanged)this.clear(entry)
        entry.rule=next
        if(entry.enabled&&comparisonChanged){const current=entry[this.currentMode];if(['monitoring','waiting','triggered'].includes(current.status))current.status=next.frequency==='once'&&current.hasTriggered?'triggered':'waiting'}
      }else if(command.type==='pause'){
        entry.enabled=false;this.clear(entry);for(const mode of ['live','replay'] as const){entry[mode].status='paused';entry[mode].reason='已暂停'}
      }else if(command.type==='resume'||command.type==='rearm'){
        const context=this.context
        if(!context||!sameDrawingAlertIdentity(entry.rule.identity,identity(context.series.symbol,context.series.basis))||!sameDrawingAlertPeriod(entry.rule.period,context.series.period))throw Error('请先切回提醒创建时的标的、行情口径和周期')
        if(this.options.uncertain(entry.rule.drawingLogicalId)||this.options.restoring())throw Error('绘图来源尚未确认，请刷新原来源')
        const geometry=this.geometry(this.getSource(entry.rule)),current=entry[this.currentMode]
        if(command.type==='resume'&&entry.rule.frequency==='once'&&current.hasTriggered)throw Error('此提醒已触发，请使用“重置并启用”')
        if(command.type==='rearm'){current.hasTriggered=false;delete current.lastBarTimestamp;if(this.currentMode==='replay')entry.replayTriggeredBars.clear()}
        this.clear(entry);entry.enabled=true;entry.geometryKey=JSON.stringify([geometry,context.axis]);current.status='waiting';current.reason='等待下一个有效样本建立比较点'
      }else throw Error('画线提醒命令无效')
      this.emit();return {status:'completed',id:command.id}
    }catch(error){return {status:'rejected',message:error instanceof Error?error.message:String(error)}}
  }
  /** Source confirmation is independent of price content revisions. */
  refreshSources():void {
    if(this.disposed||!this.entries.size||!this.context?.series.confirmed)return
    if(this.options.restoring()){
      for(const entry of this.entries.values())this.clear(entry)
      return
    }
    let changed=false
    for(const entry of this.entries.values()){
      if(!sameDrawingAlertIdentity(entry.rule.identity,identity(this.context.series.symbol,this.context.series.basis))||!sameDrawingAlertPeriod(entry.rule.period,this.context.series.period))continue
      try{
        const source=this.getSource(entry.rule),geometry=this.geometry(source),key=JSON.stringify([geometry,this.context?.axis])
        if(key!==entry.geometryKey){entry.geometryKey=key;this.clear(entry);changed=true}
        if(this.options.uncertain(entry.rule.drawingLogicalId)){this.clear(entry);for(const mode of ['live','replay'] as const){entry[mode].status='data-unavailable';entry[mode].reason='来源提交结果待确认，请刷新原绘图'}changed=true}
      }catch(error){
        const source=this.options.source(entry.rule.drawingLogicalId),status=source?'unsupported':'source-missing',reason=error instanceof Error?error.message:String(error)
        if(entry.enabled||entry.live.status!==status||entry.live.reason!==reason){entry.enabled=false;this.clear(entry);for(const mode of ['live','replay'] as const){entry[mode].status=status;entry[mode].reason=reason}changed=true}
      }
    }
    if(changed)this.emit()
  }
  contextChanging():void {
    this.context=undefined;this.consumed=undefined
    for(const entry of this.entries.values())this.clear(entry)
  }
  consume(series:ConfirmedSeries,state:ChartDataState,bars:readonly DrawingAlertSample[],axis:'linear'|'percentage'|'log',axisId?:string):void {
    if(this.disposed)return
    const previousContext=this.context,mode=series.replay?'replay':'live'
    const contextChanged=!previousContext||previousContext.series.epoch!==series.epoch||previousContext.series.revision!==series.revision||!sameDrawingAlertIdentity(identity(previousContext.series.symbol,previousContext.series.basis),identity(series.symbol,series.basis))||!sameDrawingAlertPeriod(previousContext.series.period,series.period)||previousContext.axis!==axis||this.currentMode!==mode
    this.context={series,state,bars,axis,axisId};this.currentMode=mode
    if(contextChanged){this.consumed=undefined;for(const entry of this.entries.values())this.clear(entry)}
    if(!this.entries.size)return
    this.refreshSources()
    const unavailable=!series.confirmed||state.dataStatus!=='ready'||!!state.error||state.revisionRequired||['disconnected','reconnecting','failed'].includes(state.connection)||this.options.restoring()
    const key=JSON.stringify([series.epoch,series.contentRevision,mode])
    const fresh=key!==this.consumed
    if(!state.restoring)this.consumed=key
    let changed=false
    const deliveries:DrawingAlertEvent[]=[]
    for(const entry of this.entries.values()){
      const current=entry[mode],before=JSON.stringify([current.status,current.reason,current.hasTriggered,current.lastBarTimestamp])
      if(!entry.enabled)continue
      if(!sameDrawingAlertIdentity(entry.rule.identity,identity(series.symbol,series.basis))||!sameDrawingAlertPeriod(entry.rule.period,series.period)){
        current.previous=undefined;current.status='context-mismatch';current.reason='标的、行情口径或周期不匹配，已暂停等待原上下文'
      }else if(unavailable||this.options.uncertain(entry.rule.drawingLogicalId)){
        current.previous=undefined;current.status='data-unavailable';current.reason=state.error??'行情或来源尚未确认，等待恢复'
      }else if(state.restoring){
        // A regular snapshot may briefly load. Real reloads cannot bridge observations.
        if(series.writer!=='snapshot')current.previous=undefined
        current.status='data-unavailable';current.reason='行情正在读取'
      }else if(fresh){
        try{
          const geometry=this.geometry(this.getSource(entry.rule)),sample=bars.at(-1)
          if(!sample)throw Error('暂无已确认行情')
          if(series.contentChange!=='tail'||contextChanged)current.previous=undefined
          const result=evaluateDrawingAlert({rule:entry.rule,geometry,bars,previous:current.previous,current:sample,state:current,axis,mode,triggeredBarTimestamps:mode==='replay'?entry.replayTriggeredBars:undefined})
          current.previous=result.comparison;current.hasTriggered=result.state.hasTriggered;current.lastBarTimestamp=result.state.lastBarTimestamp;current.status=result.status;current.reason=result.reason
          if(!result.reason&&state.connection==='unknown')current.reason='连接状态未声明；按已确认输入监控'
          if(!result.reason&&series.basis===undefined)current.reason=[current.reason,'行情口径未声明；恢复后需手动继续'].filter(Boolean).join('；')
          if(result.event){if(mode==='replay')entry.replayTriggeredBars.add(result.event.barTimestamp);current.records.push(result.event);if(current.records.length>100)current.records.shift();deliveries.push(result.event);changed=true}
        }catch(error){current.previous=undefined;current.status='waiting';current.reason=error instanceof Error?error.message:String(error)}
      }
      if(before!==JSON.stringify([current.status,current.reason,current.hasTriggered,current.lastBarTimestamp]))changed=true
    }
    // Commit markers and records before any host callback can reenter or throw.
    if(changed)this.emit()
    for(const event of deliveries)this.safely(()=>event.mode==='replay'?this.options.replayTrigger?.(clone(event)):this.options.trigger?.(clone(event)))
  }
  dispose():void{this.disposed=true;this.entries.clear();this.context=undefined;this.consumed=undefined}
}
