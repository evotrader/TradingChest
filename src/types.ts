/**
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at

 * http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { KLineData, Styles, DeepPartial } from 'klinecharts'
import type KeyboardShortcutManager from './shortcut'

export interface SymbolInfo {
  ticker: string
  name?: string
  shortName?: string
  exchange?: string
  market?: string
  pricePrecision?: number
  volumePrecision?: number
  priceCurrency?: string
  type?: string
  logo?: string
}

export interface Period {
  multiplier: number
  timespan: string
  text: string
}

export type DatafeedSubscribeCallback = (data: KLineData) => void

export interface Datafeed {
  searchSymbols (search?: string): Promise<SymbolInfo[]>
  getHistoryKLineData (symbol: SymbolInfo, period: Period, from: number, to: number): Promise<KLineData[]>
  subscribe (symbol: SymbolInfo, period: Period, callback: DatafeedSubscribeCallback): void
  unsubscribe (symbol: SymbolInfo, period: Period): void
  /** 释放 datafeed 持有的资源（如 WebSocket 连接）。可选实现。 */
  dispose? (): void
}

/** 指标图形点击事件 */
export interface IndicatorClickEvent {
  /** 指标名称 */
  indicatorName: string
  /** 点击的图形数据（TradeRecord + type） */
  data: Record<string, unknown>
  /** 点击像素坐标（相对于 widget） */
  x: number
  y: number
}

export interface ChartProOptions {
  container: string | HTMLElement
  styles?: DeepPartial<Styles>
  watermark?: string | Node
  theme?: string
  locale?: string
  drawingBarVisible?: boolean
  symbol: SymbolInfo
  period: Period
  periods?: Period[]
  timezone?: string
  mainIndicators?: string[]
  subIndicators?: string[]
  datafeed: Datafeed
  /** 指标图形被点击时的回调 */
  onIndicatorClick?: (event: IndicatorClickEvent) => void
  /** 报警触发时的回调 */
  onAlertTrigger?: (event: import('./alert/types').AlertEvent) => void
  /** 内部错误回调（数据加载失败、指标初始化失败等） */
  onError?: (error: { type: string, message: string, raw?: unknown }) => void
}

export interface ChartPro {
  setTheme(theme: string): void
  getTheme(): string
  setStyles(styles: DeepPartial<Styles>): void
  getStyles(): Styles
  setLocale(locale: string): void
  getLocale(): string
  setTimezone(timezone: string): void
  getTimezone(): string
  setSymbol(symbol: SymbolInfo): void
  getSymbol(): SymbolInfo
  setPeriod(period: Period): void
  getPeriod(): Period
  /** 获取内部 klinecharts Chart 实例，用于自定义 overlay 操作 */
  getChart(): import('klinecharts').Nullable<import('klinecharts').Chart>
  /** 导出可见区间数据为 CSV */
  exportCSV(filename?: string): void
  /** 导出全部数据为 CSV */
  exportAllCSV(filename?: string): void
  /** 导出截图 */
  exportScreenshot(options?: { format?: 'png' | 'jpeg', backgroundColor?: string, filename?: string }): void
  /** 获取快捷键管理器 */
  getShortcutManager(): KeyboardShortcutManager | null
  /** 添加报警线 */
  addAlert(config: import('./alert/types').AlertConfig): void
  /** 更新报警配置（保留触发状态） */
  updateAlert(id: string, updates: Partial<Omit<import('./alert/types').AlertConfig, 'id'>>): boolean
  /** 移除报警线 */
  removeAlert(id: string): void
  /** 获取所有报警 */
  getAlerts(): import('./alert/types').AlertConfig[]
  /** 添加对比品种（归一化为百分比变化叠加在主图） */
  addComparison(symbol: SymbolInfo): Promise<void>
  /** 移除对比品种 */
  removeComparison(ticker: string): void
  /** 进入回放模式 */
  startReplay(startPosition?: number): void
  /** 退出回放模式 */
  stopReplay(): void
  /** 获取回放引擎 */
  getReplayEngine(): import('./replay/ReplayEngine').ReplayEngine | null
  /** 创建交易可视化指标（自动连接点击检测） */
  createTradeVisualization(trades: import('./indicator/trade/tradeVisualization').TradeRecord[], paneOptions?: Record<string, unknown>): void
  /** 向报警系统传入最新价格（实时数据到达时调用） */
  feedPrice(price: number): void
  /** 销毁图表实例，释放所有资源。调用后实例不可再使用。 */
  dispose(): void
}
