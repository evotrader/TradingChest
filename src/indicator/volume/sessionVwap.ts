import type { IndicatorTemplate, KLineData } from 'klinecharts'

/** Supplied by the provider's exchange calendar and data-quality checks, never inferred from UTC dates. */
export interface BarSession {
  /** Includes instrument, period, adjustment, currency and session-filter identity. */
  seriesId: string
  /** Stable trading session identity; lunch breaks and overnight dates may share it. */
  id: string
  /** True only on the first eligible bar of the entire session, not the loaded window. */
  start: boolean
  /** False when data coverage or volume/turnover units are unreliable. */
  complete: boolean
}
export interface SessionKLineData extends KLineData { session?: BarSession }
export type SessionVwapMethod = 'turnover' | 'typical-price'
export interface SessionVwapPoint {
  vwap: number | undefined
  quality: 'turnover' | 'approximate' | 'unavailable'
}

/** No forward fill or fallback between exact turnover and OHLCV approximation. */
export function calculateSessionVwap(data: SessionKLineData[], method: SessionVwapMethod = 'turnover'): SessionVwapPoint[] {
  let key: string | undefined
  let previousTime = -Infinity
  let valid = false
  let amount = 0
  let volume = 0
  return data.map(bar => {
    const session = bar.session
    const nextKey = session && session.seriesId && session.id
      ? JSON.stringify([session.seriesId, session.id]) : undefined
    if (nextKey !== key) {
      key = nextKey
      amount = 0
      volume = 0
      valid = Boolean(nextKey && session?.start === true)
    }
    if (!nextKey || session?.complete !== true || !Number.isFinite(bar.timestamp) || bar.timestamp <= previousTime) valid = false
    previousTime = bar.timestamp
    const size = bar.volume
    if (typeof size !== 'number' || !Number.isFinite(size) || size < 0) valid = false
    if (valid && size! > 0) {
      let contribution: number
      if (method === 'turnover') {
        contribution = bar.turnover ?? NaN
      } else {
        const { high, low, close } = bar
        contribution = [high, low, close].every(Number.isFinite) && high >= low && close >= low && close <= high
          ? ((high + low + close) / 3) * size! : NaN
      }
      if (!Number.isFinite(contribution)) valid = false
      else { amount += contribution; volume += size! }
    } else if (valid && method === 'turnover' && size === 0 && bar.turnover !== undefined && bar.turnover !== 0) {
      valid = false
    }
    if (!valid || volume === 0 || !Number.isFinite(amount) || !Number.isFinite(volume)) {
      if (!Number.isFinite(amount) || !Number.isFinite(volume)) valid = false
      return { vwap: undefined, quality: 'unavailable' }
    }
    const value = amount / volume
    if (!Number.isFinite(value)) { valid = false; return { vwap: undefined, quality: 'unavailable' } }
    return { vwap: value, quality: method === 'turnover' ? 'turnover' : 'approximate' }
  })
}

export const sessionVwap: IndicatorTemplate = {
  name: 'SESSION_VWAP', shortName: 'Session VWAP (turnover)', calcParams: [],
  figures: [{ key: 'vwap', title: 'Session VWAP (turnover): ', type: 'line' }],
  calc: data => calculateSessionVwap(data, 'turnover')
}
export const sessionVwapApprox: IndicatorTemplate = {
  name: 'SESSION_VWAP_APPROX', shortName: 'Session VWAP (OHLCV approx)', calcParams: [],
  figures: [{ key: 'vwap', title: 'Session VWAP (OHLCV approx): ', type: 'line' }],
  calc: data => calculateSessionVwap(data, 'typical-price')
}
