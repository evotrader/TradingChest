import { describe, it, expect } from 'vitest'
import { IndicatorClickDetector } from '../indicatorClickDetector'

describe('IndicatorClickDetector', () => {
  it('注册和清除 hitTarget', () => {
    const detector = new IndicatorClickDetector()
    detector.addTarget({ x: 100, y: 200, trade: { id: 1 }, type: 'entry' })
    detector.addTarget({ x: 300, y: 400, trade: { id: 2 }, type: 'exit' })
    expect(detector.getTargets()).toHaveLength(2)
    detector.clearTargets()
    expect(detector.getTargets()).toHaveLength(0)
  })

  it('findClosest 返回 40px 内最近的目标', () => {
    const detector = new IndicatorClickDetector()
    detector.addTarget({ x: 100, y: 100, trade: { id: 1 }, type: 'entry' })
    detector.addTarget({ x: 200, y: 200, trade: { id: 2 }, type: 'exit' })
    const result = detector.findClosest(105, 105, 40)
    expect(result).not.toBeNull()
    expect(result!.trade.id).toBe(1)
  })

  it('findClosest 超出半径返回 null', () => {
    const detector = new IndicatorClickDetector()
    detector.addTarget({ x: 100, y: 100, trade: { id: 1 }, type: 'entry' })
    const result = detector.findClosest(500, 500, 40)
    expect(result).toBeNull()
  })
})
