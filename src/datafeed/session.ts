import type { KLineData } from 'klinecharts'
import type { Datafeed, DatafeedRequestContext, Period, SymbolInfo } from '../types'

export interface SeriesIdentity {
  source: string
  ticker: string
  market: string
  exchange: string
  currency: string
  multiplier: number
  timespan: string
  adjustment: string
  sessionFilter: string
  timezone: string
}
export interface HistoryBatch {
  identity: SeriesIdentity
  bars: KLineData[]
  state: 'ready' | 'empty' | 'partial'
  /** Provider observation time, Unix milliseconds. Not a promise of tradable freshness. */
  sourceTimestamp: number
  delayMs?: number
}
export interface SessionUpdate { identity: SeriesIdentity; bar: KLineData; kind: 'update' | 'revision' }
export interface DataSession {
  identity: SeriesIdentity
  getHistory(from: number, to: number, context?: DatafeedRequestContext): Promise<HistoryBatch>
  subscribe(callback: (update: SessionUpdate) => void): () => void
  dispose?(): void
}
export interface SessionProvider {
  searchSymbols(search?: string): Promise<SymbolInfo[]>
  /** A new independently owned session per invocation; never return a global singleton. */
  openSession(symbol: SymbolInfo, period: Period): DataSession
}
export interface DataSessionStatus {
  state: 'loading' | 'ready' | 'empty' | 'partial' | 'error' | 'revision-required' | 'closed'
  identity: SeriesIdentity
  sourceTimestamp?: number
  delayMs?: number
  error?: unknown
}
const fields = ['source','ticker','market','exchange','currency','timespan','adjustment','sessionFilter','timezone'] as const
export function seriesIdentityKey(identity: SeriesIdentity): string {
  if (!identity || !fields.every(k => typeof identity[k] === 'string' && identity[k].length > 0) ||
    !Number.isInteger(identity.multiplier) || identity.multiplier <= 0) throw new Error('Invalid series identity')
  return JSON.stringify([...fields.map(k => identity[k]), identity.multiplier])
}
function barValid(bar: KLineData): boolean {
  return !!bar && ['timestamp','open','high','low','close'].every(k => Number.isFinite(bar[k])) &&
    bar.high >= Math.max(bar.open,bar.close,bar.low) && bar.low <= Math.min(bar.open,bar.close) &&
    (bar.volume === undefined || Number.isFinite(bar.volume) && bar.volume >= 0)
}
const requestKey = (s: SymbolInfo,p: Period) => JSON.stringify([s.ticker,s.market,s.exchange,s.priceCurrency,p.multiplier,p.timespan])

/** Opt-in compatibility adapter. Construct one per chart; history and stream share one validated identity. */
export function createSessionDatafeed(provider: SessionProvider, options: {
  onStatus?: (status: DataSessionStatus) => void
  /** Host must reload/reconcile revisions explicitly; they are never appended as new bars. */
  onRevisionRequired?: (update: SessionUpdate) => void
} = {}): Datafeed {
  let active: { session: DataSession; identity: SeriesIdentity; key: string; request: string; stop?: () => void; latest: number; subscription: number } | undefined
  let disposed = false
  const close = () => {
    const old = active
    active = undefined
    if (old) {
      try { old.stop?.() } finally { old.session.dispose?.() }
      options.onStatus?.({state:'closed',identity:old.identity})
    }
  }
  const ensure = (symbol: SymbolInfo, period: Period) => {
    if (disposed) throw new Error('Datafeed disposed')
    const request = requestKey(symbol,period)
    if (active?.request === request) return active
    close()
    const session = provider.openSession(symbol,period)
    const identity = Object.freeze({ ...session.identity })
    try {
      const key = seriesIdentityKey(identity)
      if (identity.ticker !== symbol.ticker || identity.multiplier !== period.multiplier || identity.timespan !== period.timespan ||
        symbol.market && identity.market !== symbol.market || symbol.exchange && identity.exchange !== symbol.exchange ||
        symbol.priceCurrency && identity.currency !== symbol.priceCurrency) throw new Error('Session identity does not match chart request')
      active = {session,identity,key,request,latest:-Infinity,subscription:0}
      return active
    } catch (error) { session.dispose?.(); throw error }
  }
  return {
    searchSymbols: search => provider.searchSymbols(search),
    async getHistoryKLineData(symbol,period,from,to,context) {
      context?.signal.throwIfAborted()
      const owner = ensure(symbol,period)
      options.onStatus?.({state:'loading',identity:owner.identity})
      try {
        const batch = await owner.session.getHistory(from,to,context)
        context?.signal.throwIfAborted()
        if (active !== owner) throw new DOMException('Session replaced','AbortError')
        if (seriesIdentityKey(batch.identity) !== owner.key) throw new Error('Historical series identity mismatch')
        if (!['ready','empty','partial'].includes(batch.state) || !Array.isArray(batch.bars) || !batch.bars.every(barValid) ||
          !Number.isFinite(batch.sourceTimestamp) || batch.sourceTimestamp < 0 ||
          batch.delayMs !== undefined && (!Number.isFinite(batch.delayMs) || batch.delayMs < 0) ||
          batch.state === 'empty' && batch.bars.length !== 0 || batch.state === 'ready' && batch.bars.length === 0) throw new Error('Invalid history batch')
        // Last supplied revision wins within this identity; sort without filling missing timestamps.
        const byTime = new Map(batch.bars.map(bar => [bar.timestamp,{...bar}]))
        const bars = [...byTime.values()].sort((a,b)=>a.timestamp-b.timestamp)
        if (context?.reason === 'initial' || context?.reason === 'resume') owner.latest = -Infinity
        owner.latest = Math.max(owner.latest,bars.at(-1)?.timestamp ?? -Infinity)
        options.onStatus?.({state:batch.state,identity:owner.identity,sourceTimestamp:batch.sourceTimestamp,delayMs:batch.delayMs})
        return bars
      } catch (error) {
        if (active === owner && !context?.signal.aborted) options.onStatus?.({state:'error',identity:owner.identity,error})
        throw error
      }
    },
    subscribe(symbol,period,callback) {
      const owner = ensure(symbol,period)
      const generation = ++owner.subscription
      owner.stop?.()
      const stop = owner.session.subscribe(update => {
        if (active !== owner || generation !== owner.subscription) return
        try {
          if (seriesIdentityKey(update.identity) !== owner.key || !barValid(update.bar) || !['update','revision'].includes(update.kind)) throw new Error('Invalid live series update')
          if (update.kind === 'revision' || update.bar.timestamp < owner.latest) {
            options.onStatus?.({state:'revision-required',identity:owner.identity})
            options.onRevisionRequired?.(update)
            return
          }
          owner.latest = update.bar.timestamp
          callback({...update.bar})
        } catch (error) { options.onStatus?.({state:'error',identity:owner.identity,error}) }
      })
      if (active !== owner || generation !== owner.subscription) stop()
      else owner.stop = stop
    },
    unsubscribe(symbol,period) { if (active?.request === requestKey(symbol,period)) close() },
    dispose() { disposed=true; close() }
  }
}
