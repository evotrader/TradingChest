/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { exportToCSV, exportAllToCSV, exportScreenshot } from '../index'

/* ---------- helpers ---------- */
function mockChart(dataList: Record<string, unknown>[] = [], visibleRange = { from: 0, to: 0 }) {
  return {
    getDataList: () => dataList,
    getVisibleRange: () => visibleRange,
    getConvertPictureUrl: vi.fn(() => 'data:image/png;base64,FAKE'),
  } as any
}

const sampleData = [
  { timestamp: 1700000000000, open: 10, high: 12, low: 9, close: 11, volume: 100 },
  { timestamp: 1700086400000, open: 11, high: 13, low: 10, close: 12, volume: 200 },
  { timestamp: 1700172800000, open: 12, high: 14, low: 11, close: 13, volume: 300 },
]

let clickedLink: HTMLAnchorElement | null = null

// jsdom 不提供 URL.createObjectURL / revokeObjectURL，手动补充
if (typeof URL.createObjectURL !== 'function') {
  ;(URL as any).createObjectURL = () => ''
}
if (typeof URL.revokeObjectURL !== 'function') {
  ;(URL as any).revokeObjectURL = () => {}
}

beforeEach(() => {
  clickedLink = null
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const el = { tagName: tag, href: '', download: '', click: vi.fn() } as any
    if (tag === 'a') clickedLink = el
    return el
  })
})

/* ========== exportToCSV ========== */
describe('exportToCSV', () => {
  it('chart 为 null 返回 false', () => {
    expect(exportToCSV(null)).toBe(false)
  })

  it('空数据返回 false', () => {
    expect(exportToCSV(mockChart([]))).toBe(false)
  })

  it('正常导出可见区间', () => {
    const chart = mockChart(sampleData, { from: 0, to: 1 })
    const result = exportToCSV(chart, 'test.csv')
    expect(result).toBe(true)
    expect(clickedLink).not.toBeNull()
    expect(clickedLink!.download).toBe('test.csv')
    expect(clickedLink!.click).toHaveBeenCalled()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })

  it('默认文件名包含日期', () => {
    const chart = mockChart(sampleData, { from: 0, to: 0 })
    exportToCSV(chart)
    expect(clickedLink!.download).toMatch(/^chart-data-\d{4}-\d{2}-\d{2}\.csv$/)
  })

  it('visibleRange 越界时安全裁剪', () => {
    const chart = mockChart(sampleData, { from: -5, to: 100 })
    expect(exportToCSV(chart)).toBe(true)
  })
})

/* ========== exportAllToCSV ========== */
describe('exportAllToCSV', () => {
  it('chart 为 null 返回 false', () => {
    expect(exportAllToCSV(null)).toBe(false)
  })

  it('空数据返回 false', () => {
    expect(exportAllToCSV(mockChart([]))).toBe(false)
  })

  it('正常导出全部数据', () => {
    const chart = mockChart(sampleData)
    const result = exportAllToCSV(chart, 'full.csv')
    expect(result).toBe(true)
    expect(clickedLink!.download).toBe('full.csv')
    expect(clickedLink!.click).toHaveBeenCalled()
  })

  it('volume 缺失时默认 0', () => {
    const data = [{ timestamp: 1700000000000, open: 1, high: 2, low: 0, close: 1 }]
    expect(exportAllToCSV(mockChart(data))).toBe(true)
  })

  it('默认文件名包含 full', () => {
    exportAllToCSV(mockChart(sampleData))
    expect(clickedLink!.download).toMatch(/^chart-data-full-/)
  })
})

/* ========== exportScreenshot ========== */
describe('exportScreenshot', () => {
  it('chart 为 null 返回 false', () => {
    expect(exportScreenshot(null)).toBe(false)
  })

  it('正常截图', () => {
    const chart = mockChart()
    const result = exportScreenshot(chart)
    expect(result).toBe(true)
    expect(chart.getConvertPictureUrl).toHaveBeenCalledWith(true, 'png', undefined)
    expect(clickedLink!.click).toHaveBeenCalled()
  })

  it('自定义选项传递正确', () => {
    const chart = mockChart()
    exportScreenshot(chart, {
      includeOverlay: false,
      format: 'jpeg',
      backgroundColor: '#fff',
      filename: 'shot.jpeg',
    })
    expect(chart.getConvertPictureUrl).toHaveBeenCalledWith(false, 'jpeg', '#fff')
    expect(clickedLink!.download).toBe('shot.jpeg')
  })

  it('默认文件名包含 screenshot 和 png', () => {
    exportScreenshot(mockChart())
    expect(clickedLink!.download).toMatch(/^chart-screenshot-.*\.png$/)
  })

  it('getConvertPictureUrl 异常返回 false', () => {
    const chart = {
      getConvertPictureUrl: () => { throw new Error('canvas error') },
    } as any
    expect(exportScreenshot(chart)).toBe(false)
  })
})
