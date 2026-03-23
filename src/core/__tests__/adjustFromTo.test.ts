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

  it('week 周期：to 对齐到周一，from 正确偏移', () => {
    const period = { multiplier: 1, timespan: 'week', text: 'W' }
    // 2024-01-17 Wednesday 12:00 UTC
    const to = new Date('2024-01-17T12:00:00Z').getTime()
    const [from, alignedTo] = adjustFromTo(period, to, 10)

    // to should be aligned to Monday 2024-01-15
    const alignedDate = new Date(alignedTo)
    expect(alignedDate.getUTCDay()).toBe(1) // Monday
    // from should be 10 weeks before alignedTo
    expect(from).toBeLessThan(alignedTo)
    expect(alignedTo - from).toBe(10 * 7 * 24 * 60 * 60 * 1000)
  })

  it('month 周期：to 对齐到月初，from 用日历减法', () => {
    const period = { multiplier: 1, timespan: 'month', text: 'M' }
    // 2024-03-15 UTC
    const to = new Date('2024-03-15T12:00:00Z').getTime()
    const [from, alignedTo] = adjustFromTo(period, to, 6)

    // to should be 2024-03-01
    const alignedDate = new Date(alignedTo)
    expect(alignedDate.getUTCDate()).toBe(1)
    expect(alignedDate.getUTCMonth()).toBe(2) // March (0-indexed)

    // from should be 6 months before: 2023-09-01
    const fromDate = new Date(from)
    expect(fromDate.getUTCFullYear()).toBe(2023)
    expect(fromDate.getUTCMonth()).toBe(8) // September
    expect(fromDate.getUTCDate()).toBe(1)
  })

  it('year 周期：to 对齐到年初，from 用日历减法', () => {
    const period = { multiplier: 1, timespan: 'year', text: 'Y' }
    // 2024-06-15 UTC
    const to = new Date('2024-06-15T12:00:00Z').getTime()
    const [from, alignedTo] = adjustFromTo(period, to, 5)

    // to should be 2024-01-01
    const alignedDate = new Date(alignedTo)
    expect(alignedDate.getUTCFullYear()).toBe(2024)
    expect(alignedDate.getUTCMonth()).toBe(0)
    expect(alignedDate.getUTCDate()).toBe(1)

    // from should be 5 years before: 2019-01-01
    const fromDate = new Date(from)
    expect(fromDate.getUTCFullYear()).toBe(2019)
    expect(fromDate.getUTCMonth()).toBe(0)
    expect(fromDate.getUTCDate()).toBe(1)
  })

  it('week 周期 multiplier > 1', () => {
    const period = { multiplier: 2, timespan: 'week', text: '2W' }
    const to = new Date('2024-01-17T12:00:00Z').getTime()
    const [from, alignedTo] = adjustFromTo(period, to, 5)
    // 5 bars * 2 weeks = 10 weeks
    expect(alignedTo - from).toBe(10 * 7 * 24 * 60 * 60 * 1000)
  })
})
