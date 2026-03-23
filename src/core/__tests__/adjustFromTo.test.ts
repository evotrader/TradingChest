import { describe, it, expect } from 'vitest'
import { adjustFromTo } from '../adjustFromTo'

describe('adjustFromTo', () => {
  it('minute 周期对齐到分钟边界', () => {
    const period = { multiplier: 5, timespan: 'minute', text: '5m' }
    const to = 1705312407000 // 2024-01-15 10:03:27 UTC
    const [from, alignedTo] = adjustFromTo(period, to, 100)
    expect(alignedTo % (60 * 1000)).toBe(0)
    expect(alignedTo - from).toBe(100 * 5 * 60 * 1000)
  })

  it('hour 周期对齐到小时边界', () => {
    const period = { multiplier: 1, timespan: 'hour', text: '1H' }
    const to = 1705312407000
    const [from, alignedTo] = adjustFromTo(period, to, 500)
    expect(alignedTo % (3600 * 1000)).toBe(0)
    expect(alignedTo - from).toBe(500 * 3600 * 1000)
  })

  it('day 周期对齐到小时边界', () => {
    const period = { multiplier: 1, timespan: 'day', text: 'D' }
    const to = 1705312407000
    const [from, alignedTo] = adjustFromTo(period, to, 500)
    expect(alignedTo % (3600 * 1000)).toBe(0)
    expect(alignedTo - from).toBe(500 * 24 * 3600 * 1000)
  })

  it('count=0 时 from===to', () => {
    const period = { multiplier: 1, timespan: 'minute', text: '1m' }
    const to = 1705312407000
    const [from, alignedTo] = adjustFromTo(period, to, 0)
    expect(from).toBe(alignedTo)
  })
})
