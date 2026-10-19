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
import type { Overlay } from 'klinecharts'
import type {AnalysisOptions} from './analysis/types'
import type KeyboardShortcutManager from './shortcut'

export interface SymbolInfo {
  ticker: string
  name?: string
  shortName?: string
  exchange?: string
  market?: string
  pricePrecision?: number
  tickSize?: number
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

export type HistoryQuery =
  | {kind:'before';before:number;countBack:number}
  | {kind:'range';from:number;to:number}
export interface HistoryMetadata {
  state:'ready'|'empty'|'partial'
  sourceTimestamp?:number
  delayMs?:number
}
/** Provenance and metadata belong to this exact response. */
export interface HistorySnapshot {bars:KLineData[];basis?:string;metadata?:HistoryMetadata}
export interface HistoryResult extends HistorySnapshot {hasMoreBefore?:boolean}
export type DatafeedStatus =
  | {type:'connection';state:'connected'|'disconnected'|'reconnecting'|'failed'}
  | {type:'revision-required';message?:string}
  | {type:'error';code?:string;message:string}
export interface ChartSnapshot extends HistorySnapshot {
  symbol: SymbolInfo
  period: Period
  bars: KLineData[]
  basis?: string
}
export interface ChartDataState {
  symbol: SymbolInfo
  period: Period
  basis?: string
  timestamp?: number
  restoring: boolean
  replay: boolean
  error?: string
  dataStatus:'unconfirmed'|'empty'|'ready'
  lastRead?:{query:HistoryQuery;metadata?:HistoryMetadata;hasMoreBefore?:boolean}
  connection:'unknown'|'connected'|'disconnected'|'reconnecting'|'failed'
  revisionRequired:boolean
  errorCode?:string
  operation?:'initial'|'load-more'|'reload'
}

/** Optional request context.
 * Each chart owns its signals; providers should pass signal to their fetch calls.
 * A legacy single-callback provider instance must not be shared between charts.
 */
export interface DatafeedRequestContext {
  signal: AbortSignal
  reason: 'initial' | 'load-more' | 'resume'
}

export interface Datafeed {
  searchSymbols (search?: string): Promise<SymbolInfo[]>
  getHistoryKLineData (symbol: SymbolInfo, period: Period, query:HistoryQuery, context?: DatafeedRequestContext): Promise<HistoryResult>
  subscribeStatus?(symbol:SymbolInfo,period:Period,accept:(status:DatafeedStatus)=>void):()=>void
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

export type OverlayLifecycleSource =
  | 'drawing-bar'
  | 'property-bar'
  | 'keyboard'
  | 'programmatic'
  | 'manual'
  | 'history'

export type OverlaySnapshot = Pick<
  Overlay,
  'id' | 'groupId' | 'name' | 'points' | 'extendData' | 'styles' | 'lock' | 'visible'
> & {paneId?:string}

export interface OverlayLifecycleEvent {
  overlay: OverlaySnapshot
  source: OverlayLifecycleSource
}

export interface ChartProOptions extends AnalysisOptions {
  resolveDrawingShareKey?:import('./drawing/session').DrawingShareResolver
  drawingWorkspaceSessions?:import('./drawing/session').DrawingSessionRegistry
  createDrawingDocumentId?:(identity:import('./drawing/document').DrawingShareIdentity)=>Promise<string>
  drawingHostSessions?:import('./drawing/session').DrawingSessionRegistry
  drawingCatalog?:import('./drawing/catalog').DrawingToolDescriptor[]
  drawingPreferences?:import('./drawing/preferences').DrawingPreferences
  drawingPreferencesStore?:import('./drawing/preferences').DrawingPreferencesStore
  drawingPreferencesScope?:string
  onDrawingStateChange?:(state:import('./drawing/types').DrawingState)=>void
  indicatorCatalog?:import('./indicator/catalog').IndicatorDescriptor[]
  comparisonSymbols?:SymbolInfo[]
  createComparisonDatafeed?:(symbol:SymbolInfo,period:Period)=>import('./compare/types').ComparisonDatafeed
  onComparisonChange?:(state:import('./compare/types').ComparisonState)=>void
  onDrawingSelect?: (logicalId:string|null)=>void
  drawingOwner?: (overlay:OverlaySnapshot)=>import('./drawing/types').DrawingOwner
  isDrawingEditable?: (overlay:OverlaySnapshot)=>boolean
  commitDrawing?: (change:import('./drawing/types').DrawingChange)=>Promise<import('./drawing/types').DrawingCommitResult>
  onDrawingHistoryChange?: (state:import('./drawing/types').DrawingHistoryState)=>void
  onDataState?: (state: ChartDataState) => void
  /** Initial history was applied for this exact symbol/period. */
  onDataReady?: (context: { symbol: SymbolInfo, period: Period }) => void
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
  /** 周期切换回调 */
  onPeriodChange?: (period: Period) => void
  /** 指标图形被点击时的回调 */
  onIndicatorClick?: (event: IndicatorClickEvent) => void
  /** 绘图 overlay 创建完成时的回调 */
  onOverlayCreate?: (event: OverlayLifecycleEvent) => void
  /** 绘图 overlay 被移动或属性变更时的回调 */
  onOverlayUpdate?: (event: OverlayLifecycleEvent) => void
  /** 绘图 overlay 被删除时的回调 */
  onOverlayDelete?: (event: OverlayLifecycleEvent) => void
  /** 报警触发时的回调 */
  onAlertTrigger?: (event: import('./alert/types').AlertEvent) => void
  /** Historical close-price alerts, isolated from the live callback and trigger state. */
  onReplayAlertTrigger?: (event: import('./alert/types').AlertEvent & { mode: 'replay' }) => void
  /** 内部错误回调（数据加载失败、指标初始化失败等） */
  onError?: (error: { type: string, message: string, raw?: unknown }) => void
}

export interface ChartPro {
  bindDrawingWorkspace(registry:import('./drawing/session').DrawingSessionRegistry|undefined,resolve?:import('./drawing/session').DrawingShareResolver):Promise<void>
  getDrawingTools():import('./drawing/catalog').DrawingToolDescriptor[]
  getDrawingState():import('./drawing/types').DrawingState
  executeDrawingCommand(command:import('./drawing/types').DrawingCommand):Promise<import('./drawing/types').DrawingCommandResult>
  getAnalysisContext():import('./analysis/types').AnalysisContext|null
  addAnalysisLayer<S extends import('./analysis/types').AnalysisLayerSpec>(context:import('./analysis/types').AnalysisContext,spec:S):import('./analysis/types').AnalysisLayerHandle<S>
  getIndicatorCatalog():import('./indicator/catalog').IndicatorDescriptor[]
  addIndicator(options:import('./indicator/catalog').AddIndicatorOptions):Promise<import('./indicator/catalog').IndicatorHandle>
  getIndicators():import('./indicator/catalog').IndicatorInstance[]
  updateIndicator(id:string,updates:{calcParams?:import('./indicator/catalog').IndicatorParameterValue[];visible?:boolean}):void
  removeIndicator(id:string):void
  commitDrawing(change:Pick<import('./drawing/types').DrawingChange,'kind'|'logicalId'|'after'|'source'>):Promise<import('./drawing/types').DrawingCommitResult>
  getDrawings():import('./drawing/types').DrawingSnapshot[]
  getDrawingHistoryState():import('./drawing/types').DrawingHistoryState
  restoreDrawings(owner:import('./drawing/types').DrawingOwner,drawings:import('./drawing/types').DrawingSnapshot[]):void
  resetDrawingHistory():void
  undoDrawing():Promise<import('./drawing/types').DrawingCommitResult|undefined>
  redoDrawing():Promise<import('./drawing/types').DrawingCommitResult|undefined>
  /** Navigate existing source time points only; never snap across missing data. */
  locateTimestamp(target: { ticker: string, period: Period, timestamp: number }): import('./core/locateTimestamp').TimestampLocation
  reloadData(options?: {preserveViewport?: boolean}): Promise<void>
  retryData():Promise<void>
  applySnapshot(snapshot: ChartSnapshot): Promise<void>
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
  getShortcutManager(): Pick<KeyboardShortcutManager,keyof KeyboardShortcutManager> | null
  /** 添加报警线 */
  addAlert(config: import('./alert/types').AlertConfig): void
  /** 更新报警配置（保留触发状态） */
  updateAlert(id: string, updates: Partial<Omit<import('./alert/types').AlertConfig, 'id'>>): boolean
  /** 移除报警线 */
  removeAlert(id: string): void
  /** 获取所有报警 */
  getAlerts(): import('./alert/types').AlertConfig[]
  /** 添加对比品种（归一化为百分比变化叠加在主图） */
  addComparison(symbol:SymbolInfo,datafeed:import('./compare/types').ComparisonDatafeed):Promise<import('./compare/types').ComparisonHandle>
  /** 移除对比品种 */
  removeComparison(handleId:string):void
  cancelComparison(handleId:string):void
  getComparisons():import('./compare/types').ComparisonState
  resetComparisonRange():Promise<void>
  refreshComparisons():Promise<void>
  /** 进入回放模式 */
  startReplay(startPosition?: number): void
  /** 退出回放模式 */
  stopReplay(): void
  /** 获取回放引擎 */
  getReplayEngine(): Pick<import('./replay/ReplayEngine').ReplayEngine,keyof import('./replay/ReplayEngine').ReplayEngine> | null
  /** 创建交易可视化指标（自动连接点击检测） */
  createTradeVisualization(trades: import('./indicator/trade/tradeVisualization').TradeRecord[], paneOptions?: Record<string, unknown>): void
  /** 向报警系统传入最新价格（实时数据到达时调用） */
  feedPrice(price: number): void
  /** 销毁图表实例，释放所有资源。调用后实例不可再使用。 */
  dispose(): void
}
