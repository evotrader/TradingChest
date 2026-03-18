import { Styles, DeepPartial } from 'klinecharts'

/**
 * 图表布局持久化
 * 将指标、绘图、设置保存到 localStorage
 */

export interface ChartLayout {
  version: number
  timestamp: number
  theme: string
  locale: string
  timezone: string
  mainIndicators: string[]
  subIndicators: string[]
  styles: DeepPartial<Styles> | null
  overlayData: OverlaySerializedData[]
}

export interface OverlaySerializedData {
  name: string
  groupId: string
  points: Array<{ timestamp: number, value: number }>
  lock: boolean
  visible: boolean
  extendData?: any
}

const STORAGE_KEY_PREFIX = 'trading-chest-layout-'

/**
 * 保存布局
 */
export function saveLayout(
  key: string,
  layout: Omit<ChartLayout, 'version' | 'timestamp'>
): void {
  const data: ChartLayout = {
    version: 1,
    timestamp: Date.now(),
    ...layout
  }
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + key, JSON.stringify(data))
  } catch (e) {
    console.warn('[TradingChest] 布局保存失败:', e)
  }
}

/**
 * 加载布局
 */
export function loadLayout(key: string): ChartLayout | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + key)
    if (!raw) return null
    const data = JSON.parse(raw) as ChartLayout
    if (data.version !== 1) return null
    return data
  } catch (e) {
    console.warn('[TradingChest] 布局加载失败:', e)
    return null
  }
}

/**
 * 删除布局
 */
export function deleteLayout(key: string): void {
  localStorage.removeItem(STORAGE_KEY_PREFIX + key)
}

/**
 * 列出所有已保存的布局
 */
export function listLayouts(): Array<{ key: string, timestamp: number }> {
  const result: Array<{ key: string, timestamp: number }> = []
  for (let i = 0; i < localStorage.length; i++) {
    const storageKey = localStorage.key(i)
    if (storageKey?.startsWith(STORAGE_KEY_PREFIX)) {
      try {
        const data = JSON.parse(localStorage.getItem(storageKey)!) as ChartLayout
        result.push({
          key: storageKey.replace(STORAGE_KEY_PREFIX, ''),
          timestamp: data.timestamp
        })
      } catch { /* 忽略损坏的数据 */ }
    }
  }
  return result.sort((a, b) => b.timestamp - a.timestamp)
}
