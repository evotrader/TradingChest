import { describe, it, expect } from 'vitest'
import { normalizeToPercent } from '../index'

describe('normalizeToPercent', () => {
  it('将价格序列归一化为百分比变化', () => {
    const data = [
      { timestamp: 1, open: 100, high: 110, low: 90, close: 100, volume: 1000, turnover: 0 },
      { timestamp: 2, open: 105, high: 115, low: 95, close: 110, volume: 1000, turnover: 0 },
      { timestamp: 3, open: 95, high: 105, low: 85, close: 90, volume: 1000, turnover: 0 },
    ]
    const result = normalizeToPercent(data as any)
    expect(result[0]).toBeCloseTo(0)
    expect(result[1]).toBeCloseTo(10)
    expect(result[2]).toBeCloseTo(-10)
  })

  it('空数据返回空', () => {
    expect(normalizeToPercent([])).toEqual([])
  })

  it('basePrice === 0 返回全零', () => {
    const data = [
      { timestamp: 1, open: 0, high: 0, low: 0, close: 0, volume: 0 },
      { timestamp: 2, open: 1, high: 1, low: 1, close: 1, volume: 0 },
    ] as any
    const result = normalizeToPercent(data)
    expect(result).toEqual([0, 0])
  })

  it('单元素数组返回 [0]', () => {
    const data = [{ timestamp: 1, open: 10, high: 10, low: 10, close: 10, volume: 0 }] as any
    const result = normalizeToPercent(data)
    expect(result).toEqual([0])
  })
})
