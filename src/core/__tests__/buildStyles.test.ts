import { describe, it, expect } from 'vitest'
import { buildStyles } from '../buildStyles'

describe('buildStyles', () => {
  it('无填充时只返回 line/point/arc', () => {
    const result = buildStyles({ color: '#ff0000', lineWidth: 2, lineStyle: 'solid' })
    expect(result.line.color).toBe('#ff0000')
    expect(result.line.size).toBe(2)
    expect(result.line.style).toBe('solid')
    expect(result.polygon).toBeUndefined()
  })

  it('有填充时返回完整 polygon/circle/rect', () => {
    const result = buildStyles({
      color: '#ff0000', fillColor: 'rgba(255,0,0,0.2)',
      lineWidth: 3, lineStyle: 'solid'
    })
    expect(result.polygon.color).toBe('rgba(255,0,0,0.2)')
    expect(result.polygon.borderColor).toBe('#ff0000')
    expect(result.polygon.borderSize).toBe(3)
    expect(result.circle.borderColor).toBe('#ff0000')
    expect(result.rect.borderRadius).toBe(0)
  })

  it('dashed 转换为 klinecharts dashed + dashedValue', () => {
    const result = buildStyles({ color: '#000', lineWidth: 1, lineStyle: 'dashed' })
    expect(result.line.style).toBe('dashed')
    expect(result.line.dashedValue).toEqual([6, 4])
  })

  it('dotted 转换为 dashed + [1,3] dashedValue', () => {
    const result = buildStyles({ color: '#000', lineWidth: 1, lineStyle: 'dotted' })
    expect(result.line.style).toBe('dashed')
    expect(result.line.dashedValue).toEqual([1, 3])
  })

  it('fillColor 未提供时无 polygon key', () => {
    const result = buildStyles({ color: '#000', lineWidth: 1, lineStyle: 'solid' })
    expect(result.polygon).toBeUndefined()
  })
})
