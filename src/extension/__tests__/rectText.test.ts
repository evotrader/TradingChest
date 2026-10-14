// @vitest-environment jsdom

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getFigureClass } from 'klinecharts'
import rectText from '../rectText'

// Only Canvas is replaced here; registration, drawing and bounds use real KLineCharts.
const context = {
  font: '',
  scale: vi.fn(),
  measureText: vi.fn(() => ({ width: 80 })),
  beginPath: vi.fn(),
  closePath: vi.fn(),
  rect: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  setLineDash: vi.fn(),
  fillText: vi.fn(),
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  textAlign: 'left',
  textBaseline: 'top'
}

beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(context as unknown as CanvasRenderingContext2D)
})

beforeEach(() => { vi.clearAllMocks() })
afterAll(() => { vi.restoreAllMocks() })

it('registers the figure used by annotation overlays through the package entry', async () => {
  await import('../../index')
  expect(getFigureClass('rectText')).not.toBeNull()
})

describe('rectText shared drawing and hit bounds', () => {
  const text = '收益🚀Wi'
  const canvasContext = context as unknown as CanvasRenderingContext2D

  it('draws and selects text with omitted optional styles', () => {
    const attrs = { x: 100, y: 90, text }
    rectText.draw(canvasContext, attrs, {})
    expect(context.fillText).toHaveBeenCalledWith(text, 100, 90, 80)
    expect(rectText.checkEventOn({ x: 179, y: 101 }, attrs, {})).toBe(true)
    expect(rectText.checkEventOn({ x: 181, y: 101 }, attrs, {})).toBe(false)
  })

  it.each([
    ['left', 'top', 100, 100],
    ['center', 'middle', 56, 86],
    ['right', 'bottom', 12, 72],
    ['start', 'hanging', 100, 100],
    ['end', 'alphabetic', 12, 72]
  ] as const)('uses measured text for %s/%s alignment', (align, baseline, x, y) => {
    const attrs = { x: 100, y: 100, text, align, baseline }
    const styles = {
      size: 16, family: 'serif', weight: 'bold',
      paddingLeft: 2, paddingRight: 6, paddingTop: 4, paddingBottom: 8
    }
    rectText.draw(canvasContext, attrs, styles)
    expect(context.fillText).toHaveBeenCalledWith(text, x + 2, y + 4, 80)
    expect(context.font).toBe('bold 16px serif')
    expect(rectText.checkEventOn({ x: x + 87, y: y + 27 }, attrs, styles)).toBe(true)
    expect(rectText.checkEventOn({ x: x + 89, y: y + 27 }, attrs, styles)).toBe(false)
    expect(rectText.checkEventOn({ x, y: y - 1 }, attrs, styles)).toBe(false)
  })

  it('keeps zero padding and explicit dimensions for drawing and hit testing', () => {
    const attrs = { x: 100, y: 90, text, width: 60, height: 22 }
    const styles = {
      paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0
    }
    rectText.draw(canvasContext, attrs, styles)
    expect(context.fillText).toHaveBeenCalledWith(text, 100, 90, 60)
    expect(context.measureText).not.toHaveBeenCalled()
    expect(rectText.checkEventOn({ x: 159, y: 111 }, attrs, styles)).toBe(true)
    expect(rectText.checkEventOn({ x: 161, y: 111 }, attrs, styles)).toBe(false)
  })
})
