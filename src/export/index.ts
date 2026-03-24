import { Chart, Nullable } from 'klinecharts'

/**
 * 数据导出工具
 */

/**
 * 导出可见区间数据为 CSV
 */
export function exportToCSV(chart: Nullable<Chart>, filename?: string): boolean {
  try {
    if (!chart) return false

    const dataList = chart.getDataList()
    const visibleRange = chart.getVisibleRange()

    if (!dataList || dataList.length === 0) return false

    const startIdx = Math.max(0, visibleRange.from)
    const endIdx = Math.min(dataList.length - 1, visibleRange.to)

    const headers = ['Date', 'Open', 'High', 'Low', 'Close', 'Volume']
    const rows = [headers.join(',')]

    for (let i = startIdx; i <= endIdx; i++) {
      const d = dataList[i]
      const date = new Date(d.timestamp).toISOString()
      rows.push([date, d.open, d.high, d.low, d.close, d.volume ?? 0].join(','))
    }

    const csvContent = rows.join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = filename ?? `chart-data-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()

    URL.revokeObjectURL(url)
    return true
  } catch {
    return false
  }
}

/**
 * 导出全部数据为 CSV
 */
export function exportAllToCSV(chart: Nullable<Chart>, filename?: string): boolean {
  try {
    if (!chart) return false

    const dataList = chart.getDataList()
    if (!dataList || dataList.length === 0) return false

    const headers = ['Date', 'Open', 'High', 'Low', 'Close', 'Volume']
    const rows = [headers.join(',')]

    for (const d of dataList) {
      const date = new Date(d.timestamp).toISOString()
      rows.push([date, d.open, d.high, d.low, d.close, d.volume ?? 0].join(','))
    }

    const csvContent = rows.join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = filename ?? `chart-data-full-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()

    URL.revokeObjectURL(url)
    return true
  } catch {
    return false
  }
}

/**
 * 导出图表截图
 */
export function exportScreenshot(chart: Nullable<Chart>, options?: {
  includeOverlay?: boolean
  format?: 'png' | 'jpeg'
  backgroundColor?: string
  filename?: string
}): boolean {
  try {
    if (!chart) return false

    const { includeOverlay = true, format = 'png', backgroundColor, filename } = options ?? {}

    const url = chart.getConvertPictureUrl(includeOverlay, format, backgroundColor)

    const link = document.createElement('a')
    link.href = url
    link.download = filename ?? `chart-screenshot-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.${format}`
    link.click()
    return true
  } catch {
    return false
  }
}
