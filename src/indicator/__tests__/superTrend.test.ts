import { describe, it, expect } from 'vitest'
import superTrend from '../trend/superTrend'
import { KLineData } from 'klinecharts'

function makeKlines(count: number): KLineData[] {
  const base = 100
  return Array.from({ length: count }, (_, i) => ({
    timestamp: 1700000000000 + i * 60000,
    open: base + i * 0.5,
    high: base + i * 0.5 + 2,
    low: base + i * 0.5 - 1,
    close: base + i * 0.5 + 1,
    volume: 1000 + i * 10,
    turnover: 0
  }))
}

describe('SuperTrend indicator', () => {
  const klines = makeKlines(30)
  const indicator = { calcParams: [10, 3] } as any

  it('返回与输入等长的数组', () => {
    const result = superTrend.calc!(klines, indicator)
    expect(result).toHaveLength(klines.length)
  })

  it('前 period 个值为 undefined', () => {
    const result = superTrend.calc!(klines, indicator)
    for (let i = 0; i < 10; i++) {
      expect(result[i].up).toBeUndefined()
      expect(result[i].down).toBeUndefined()
    }
  })

  it('period 之后每行恰好有 up 或 down 之一', () => {
    const result = superTrend.calc!(klines, indicator)
    for (let i = 10; i < result.length; i++) {
      const hasUp = result[i].up !== undefined
      const hasDown = result[i].down !== undefined
      expect(hasUp || hasDown).toBe(true)
      expect(hasUp && hasDown).toBe(false)
    }
  })

  it('上升趋势 up 值应在 close 下方', () => {
    const result = superTrend.calc!(klines, indicator)
    for (let i = 10; i < result.length; i++) {
      if (result[i].up !== undefined) {
        expect(result[i].up).toBeLessThan(klines[i].high)
      }
    }
  })

  it('空数据返回空数组', () => {
    const result = superTrend.calc!([], indicator)
    expect(result).toHaveLength(0)
  })
})
