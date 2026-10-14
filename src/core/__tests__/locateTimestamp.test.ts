import { describe, expect, it } from 'vitest'
import { locateDataTimestamp } from '../locateTimestamp'
const period = { multiplier: 1, timespan: 'minute', text: '1m' }
const bars = [60_000, 120_000, 240_000].map(timestamp => ({ timestamp }))
const locate = (timestamp: number) => locateDataTimestamp(bars, 'A.X', period, timestamp)
describe('source timestamp navigation', () => {
  it('returns actual index at a source time point', () => {
    expect(locate(120_000)).toMatchObject({ status: 'exact-timestamp', dataIndex: 1, matchedTimestamp: 120_000, ticker: 'A.X' })
  })
  it('returns a reference window without claiming candle membership', () => {
    expect(locate(75_000)).toMatchObject({ status: 'reference-window', bracketStart: 60_000, bracketEnd: 120_000, dataIndex: 0 })
  })
  it.each([0, 300_000])('never snaps outside the range (%s)', timestamp => {
    expect(locate(timestamp)).toMatchObject({ status: 'unavailable', reason: 'out-of-range' })
  })
  it('does not cross a missing time point', () => {
    expect(locate(150_000)).toMatchObject({ status: 'unavailable', reason: 'gap' })
  })
  it('does not infer daily or monthly session intervals', () => {
    expect(locateDataTimestamp(bars, 'A.X', { ...period, timespan: 'day' }, 75_000).reason).toBe('unsupported-period')
  })
  it('allows an explicit source time point even for daily bars', () => {
    expect(locateDataTimestamp(bars, 'A.X', { ...period, timespan: 'day' }, 120_000).status).toBe('exact-timestamp')
  })
  it.each([{ timestamps: [120_000, 60_000] }, { timestamps: [60_000, 60_000] }, { timestamps: [60_000, NaN] }])('rejects ambiguous input $timestamps', ({ timestamps }) => {
    expect(locateDataTimestamp(timestamps.map(timestamp => ({ timestamp })), 'A.X', period, 75_000).reason).toBe('invalid-data')
  })
  it('reports missing data and invalid requests', () => {
    expect(locateDataTimestamp([], 'A.X', period, 75_000).reason).toBe('no-data')
    expect(locate(NaN).reason).toBe('invalid-target')
  })
})
