import type { Chart, DataLoader, DataLoaderGetBarsParams, KLineData, Period as EnginePeriod } from 'klinecharts'
import type { Datafeed, Period, SymbolInfo, ChartProOptions } from '../types'
import { adjustFromTo } from './adjustFromTo'

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
interface Hooks {
  loading: (loading: boolean) => void
  ready: NonNullable<ChartProOptions['onDataReady']>
  error: NonNullable<ChartProOptions['onError']>
  price: (bar: KLineData) => void
}
/** One writer and one subscription per chart; all asynchronous work belongs to its generation. */
export class EngineDataLoader implements DataLoader {
  private generation = 0
  private pageSequence = 0
  private requests = new Set<AbortController>()
  private current?: {symbol: SymbolInfo; period: Period}
  private subscription?: {symbol: SymbolInfo; period: Period}
  private stream?: (bar: KLineData) => void
  private prepared?: KLineData[]
  private replay?: KLineData[]
  private confirmed = false
  private disposed = false
  constructor(private chart: Chart, private feed: Datafeed, private hooks: Hooks) { chart.setDataLoader(this) }
  private invalidate(): void {
    ++this.generation
    for (const request of this.requests) request.abort()
    this.requests.clear()
    this.stopSubscription()
    this.stream = undefined
  }
  private stopSubscription(): void {
    if (this.subscription) this.feed.unsubscribe(this.subscription.symbol, this.subscription.period)
    this.subscription = undefined
  }
  activate(symbol: SymbolInfo, period: Period): void {
    if (this.disposed) return
    this.invalidate()
    this.confirmed = false
    this.prepared = undefined
    this.replay = undefined
    this.current = {symbol: {...symbol}, period: {...period}}
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
      if (request.type === 'init') { this.confirmed = true; request.callback(this.replay, {forward:false, backward:false}) }
      else request.callback([], {forward:false, backward:false})
      return
    }
    if (request.type !== 'init' && request.type !== 'forward') {request.callback([], {backward:false});return}
    const controller = new AbortController()
    this.requests.add(controller)
    this.hooks.loading(true)
    try {
      let bars: KLineData[]
      if (request.type === 'init' && this.prepared) {bars=this.prepared;this.prepared=undefined}
      else {
        const end = request.type === 'init' ? Date.now() : (request.timestamp ?? 0) - 1
        const [from, to] = adjustFromTo(identity.period, end, 500)
        bars = await this.feed.getHistoryKLineData(identity.symbol, identity.period, from, to, {signal:controller.signal, reason:request.type === 'init' ? 'initial' : 'load-more'})
        if (request.type === 'forward') bars = bars.filter(bar => bar.timestamp < (request.timestamp ?? Infinity))
      }
      validateBars(bars)
      if (!active() || controller.signal.aborted) return
      if (request.type === 'init') this.confirmed = true
      request.callback(bars, {forward:bars.length > 0, backward:false})
      if (request.type === 'init') this.hooks.ready(identity)
    } catch (error) {
      if (!active() || controller.signal.aborted) return
      if (request.type === 'init') this.confirmed = false
      this.hooks.error({type:request.type === 'init' ? 'data-fetch' : 'load-more',message:error instanceof Error ? error.message : '行情读取失败',raw:error})
      // An init callback clears the data; only first/new identities use this failure path.
      request.callback([], {forward:false, backward:false})
    } finally {
      this.requests.delete(controller)
      if (active()) this.hooks.loading(false)
    }
  }
  subscribeBar: NonNullable<DataLoader['subscribeBar']> = ({callback}) => {
    if (this.disposed || !this.confirmed || !this.current) return
    this.stopSubscription()
    this.stream = callback
    if (this.replay) return
    const identity = this.current, generation = this.generation
    this.subscription = identity
    this.feed.subscribe(identity.symbol, identity.period, bar => {
      if (this.disposed || generation !== this.generation || this.replay) return
      this.push(bar)
    })
  }
  unsubscribeBar = (): void => {this.stopSubscription();this.stream=undefined}
  push(bar: KLineData): void {
    if (this.disposed || !this.stream || this.replay) return
    try { validateBars([bar]) } catch (error) {this.hooks.error({type:'invalid-bar',message:String(error),raw:bar});return}
    const latest = this.chart.getDataList().at(-1)
    if (latest && bar.timestamp < latest.timestamp) {
      this.hooks.error({type:'historical-revision',message:'历史修订需要重载，不进入实时报警',raw:bar});return
    }
    this.stream(bar)
    this.hooks.price(bar)
  }
  /** Prefetch before reset; failure leaves the confirmed data, drawings and viewport intact. */
  async reload(preserveViewport = true): Promise<void> {
    if (this.disposed || !this.current) throw new DOMException('行情恢复已取消或图表尚未就绪','AbortError')
    const generation = this.generation, identity = this.current, controller = new AbortController()
    this.requests.add(controller)
    this.hooks.loading(true)
    let completionGeneration = generation
    const data = this.chart.getDataList(), range = this.chart.getVisibleRange(), space = this.chart.getBarSpace().bar
    const anchor = data[Math.min(data.length-1, Math.max(0,range.to-1))]?.timestamp
    const [defaultFrom, to] = adjustFromTo(identity.period, Date.now(), 500)
    try {
      const bars = await this.feed.getHistoryKLineData(identity.symbol,identity.period,Math.min(data[0]?.timestamp ?? defaultFrom,defaultFrom),to,{signal:controller.signal,reason:'resume'})
      validateBars(bars)
      if (this.disposed || generation !== this.generation || controller.signal.aborted) throw new DOMException('行情恢复已取消','AbortError')
      this.invalidate()
      completionGeneration = this.generation
      this.replay = undefined
      this.prepared = bars
      this.chart.resetData()
      if (preserveViewport && anchor !== undefined) {
        this.chart.setBarSpace(space)
        const index = bars.findIndex(bar => bar.timestamp === anchor)
        if (index >= 0) this.chart.scrollToDataIndex(index, 0)
      }
    } catch (error) {
      if (!this.disposed && generation === this.generation && !controller.signal.aborted) {
        this.hooks.error({type:'data-reload',message:error instanceof Error ? error.message : '行情恢复失败',raw:error})
      }
      throw error
    } finally {this.requests.delete(controller);if(!this.disposed && completionGeneration===this.generation)this.hooks.loading(false)}
  }
  setReplay(bars: KLineData[]): void {
    this.invalidate()
    this.replay = bars
    this.hooks.loading(false)
    this.chart.resetData()
  }
  pushReplay(bar: KLineData): void {if(this.replay){this.replay=[...this.replay,bar];this.stream?.(bar)}}
  dispose(): void {if(!this.disposed){this.disposed=true;this.invalidate()}}
}
