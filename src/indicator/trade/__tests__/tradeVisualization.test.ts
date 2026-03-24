import { describe, it, expect } from 'vitest'
import { findClosestBar } from '../tradeVisualization'
import type { TradeRecord } from '../tradeVisualization'
import tradeVisualization from '../tradeVisualization'

// Helper: make KLineData-like objects with just the fields calc needs
function makeBar(timestamp: number, close = 100) {
  return { timestamp, open: close, high: close, low: close, close, volume: 0 }
}

describe('findClosestBar (binary search)', () => {
  it('returns -1 for empty dataList', () => {
    expect(findClosestBar([], 1000)).toBe(-1)
  })

  it('finds exact match', () => {
    const bars = [10, 20, 30, 40, 50].map(ts => ({ timestamp: ts }))
    expect(findClosestBar(bars, 30)).toBe(2)
  })

  it('finds closest when target is between bars', () => {
    const bars = [10, 20, 30, 40, 50].map(ts => ({ timestamp: ts }))
    // 24 is closer to 20 (idx 1) than 30 (idx 2)
    expect(findClosestBar(bars, 24)).toBe(1)
    // 26 is closer to 30 (idx 2) than 20 (idx 1)
    expect(findClosestBar(bars, 26)).toBe(2)
    // 25 is equidistant, should return lo-1 (idx 1) due to <= comparison
    expect(findClosestBar(bars, 25)).toBe(1)
  })

  it('handles target before all bars', () => {
    const bars = [100, 200, 300].map(ts => ({ timestamp: ts }))
    expect(findClosestBar(bars, 5)).toBe(0)
  })

  it('handles target after all bars', () => {
    const bars = [100, 200, 300].map(ts => ({ timestamp: ts }))
    expect(findClosestBar(bars, 999)).toBe(2)
  })

  it('works with single bar', () => {
    const bars = [{ timestamp: 50 }]
    expect(findClosestBar(bars, 50)).toBe(0)
    expect(findClosestBar(bars, 1)).toBe(0)
    expect(findClosestBar(bars, 999)).toBe(0)
  })

  it('handles large dataset efficiently', () => {
    const n = 100_000
    const bars = Array.from({ length: n }, (_, i) => ({ timestamp: i * 60000 }))
    const start = performance.now()
    for (let i = 0; i < 1000; i++) {
      findClosestBar(bars, Math.random() * n * 60000)
    }
    const elapsed = performance.now() - start
    // 1000 binary searches on 100k items should be well under 50ms
    expect(elapsed).toBeLessThan(50)
  })
})

describe('tradeVisualization.calc', () => {
  const calc = tradeVisualization.calc!

  function makeTrades(...entries: Array<{ entryTs: number; exitTs: number; entryPrice: number; exitPrice: number; pnl: number; direction: 'long' | 'short' }>): TradeRecord[] {
    return entries
  }

  it('returns empty info for empty trades', () => {
    const bars = [makeBar(100), makeBar(200), makeBar(300)]
    const indicator = { extendData: { trades: [] } } as any
    const result = calc(bars, indicator)
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({})
    expect(result[1]).toEqual({})
    expect(result[2]).toEqual({})
  })

  it('returns empty info when no extendData', () => {
    const bars = [makeBar(100)]
    const indicator = { extendData: undefined } as any
    const result = calc(bars, indicator)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({})
  })

  it('maps a single trade to correct bars', () => {
    const bars = [makeBar(100), makeBar(200), makeBar(300), makeBar(400), makeBar(500)]
    const trades = makeTrades({
      entryTs: 200, exitTs: 400, entryPrice: 50, exitPrice: 60, pnl: 10, direction: 'long'
    })
    const indicator = { extendData: { trades } } as any
    const result = calc(bars, indicator)

    // Bar 1 (ts=200) should have entry
    expect(result[1].entry).toBeDefined()
    expect(result[1].entry!.price).toBe(50)
    expect(result[1].entry!.direction).toBe('long')
    expect(result[1].entry!.trade).toBe(trades[0])

    // Bar 3 (ts=400) should have exit
    expect(result[3].exit).toBeDefined()
    expect(result[3].exit!.price).toBe(60)
    expect(result[3].exit!.trade).toBe(trades[0])

    // Bars 1-3 should have ranges
    expect(result[1].ranges).toHaveLength(1)
    expect(result[2].ranges).toHaveLength(1)
    expect(result[3].ranges).toHaveLength(1)
    expect(result[1].ranges![0].entryPrice).toBe(50)

    // Bars 0 and 4 should have no data
    expect(result[0]).toEqual({})
    expect(result[4]).toEqual({})
  })

  it('handles same-bar entry and exit', () => {
    const bars = [makeBar(100), makeBar(200), makeBar(300)]
    const trades = makeTrades({
      entryTs: 200, exitTs: 200, entryPrice: 50, exitPrice: 55, pnl: 5, direction: 'short'
    })
    const indicator = { extendData: { trades } } as any
    const result = calc(bars, indicator)

    expect(result[1].entry).toBeDefined()
    expect(result[1].exit).toBeDefined()
    expect(result[1].ranges).toHaveLength(1)
    expect(result[1].ranges![0].isStart).toBe(true)
    expect(result[1].ranges![0].isEnd).toBe(true)
  })

  it('handles overlapping trades', () => {
    const bars = [makeBar(100), makeBar(200), makeBar(300), makeBar(400)]
    const trades = makeTrades(
      { entryTs: 100, exitTs: 300, entryPrice: 50, exitPrice: 60, pnl: 10, direction: 'long' },
      { entryTs: 200, exitTs: 400, entryPrice: 55, exitPrice: 45, pnl: -10, direction: 'short' }
    )
    const indicator = { extendData: { trades } } as any
    const result = calc(bars, indicator)

    // Bar 2 (ts=300) has ranges from both trades
    expect(result[2].ranges).toHaveLength(2)
  })

  it('supports raw TradeRecord[] as extendData (backwards compat)', () => {
    const bars = [makeBar(100), makeBar(200)]
    const trades: TradeRecord[] = [
      { entryTs: 100, exitTs: 200, entryPrice: 10, exitPrice: 20, pnl: 10, direction: 'long' }
    ]
    const indicator = { extendData: trades } as any
    const result = calc(bars, indicator)

    expect(result[0].entry).toBeDefined()
    expect(result[1].exit).toBeDefined()
  })

  it('finds closest bar by timestamp (not exact match)', () => {
    // Bars at 100, 200, 300 — trade entry at 190 should map to bar at 200
    const bars = [makeBar(100), makeBar(200), makeBar(300)]
    const trades = makeTrades({
      entryTs: 190, exitTs: 310, entryPrice: 50, exitPrice: 60, pnl: 10, direction: 'long'
    })
    const indicator = { extendData: { trades } } as any
    const result = calc(bars, indicator)

    expect(result[1].entry).toBeDefined() // 190 → bar[1] (200)
    expect(result[2].exit).toBeDefined()  // 310 → bar[2] (300)
  })
})
