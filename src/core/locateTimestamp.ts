import type { Period } from '../types'

export interface TimestampLocation {
  status: 'exact-timestamp' | 'reference-window' | 'unavailable'
  requestedTimestamp: number
  ticker: string
  period: Period
  reason?: string
  matchedTimestamp?: number
  bracketStart?: number
  bracketEnd?: number
  dataIndex?: number
}

/** Source time points only. This does not infer which candle contains a fill. */
export function locateDataTimestamp (
  bars: ReadonlyArray<{ timestamp: number }>, ticker: string, period: Period, timestamp: number
): TimestampLocation {
  const base = { requestedTimestamp: timestamp, ticker, period: { ...period } }
  const unavailable = (reason: string): TimestampLocation => ({ ...base, status: 'unavailable', reason })
  if (!Number.isFinite(timestamp)) return unavailable('invalid-target')
  if (!bars.length) return unavailable('no-data')
  for (let i = 0; i < bars.length; i++) {
    if (!Number.isFinite(bars[i].timestamp) || (i > 0 && bars[i].timestamp <= bars[i - 1].timestamp)) {
      return unavailable('invalid-data')
    }
  }
  let low = 0; let high = bars.length
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (bars[mid].timestamp < timestamp) low = mid + 1
    else high = mid
  }
  if (low < bars.length && bars[low].timestamp === timestamp) {
    return { ...base, status: 'exact-timestamp', matchedTimestamp: timestamp, dataIndex: low }
  }
  if (low === 0 || low === bars.length) return unavailable('out-of-range')
  const unit = period.timespan === 'minute' ? 60_000 : period.timespan === 'hour' ? 3_600_000 : 0
  if (!unit || !Number.isSafeInteger(period.multiplier) || period.multiplier <= 0) return unavailable('unsupported-period')
  const bracketStart = bars[low - 1].timestamp; const bracketEnd = bars[low].timestamp
  if (bracketEnd - bracketStart > unit * period.multiplier) return unavailable('gap')
  return { ...base, status: 'reference-window', bracketStart, bracketEnd, dataIndex: low - 1 }
}
