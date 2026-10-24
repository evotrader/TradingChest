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

import { registerOverlay, registerIndicator, registerFigure } from 'klinecharts'

import overlays from './extension'
import chartTypes from './chartType'

import DefaultDatafeed from './DefaultDatafeed'
import KLineChartPro from './KLineChartPro'

import { load } from './i18n'

import { Datafeed, SymbolInfo, Period, DatafeedSubscribeCallback, ChartProOptions, ChartPro } from './types'

import './index.less'

import tradeVisualization from './indicator/trade/tradeVisualization'
import rectText from './extension/rectText'

registerFigure(rectText)
overlays.forEach(o => { registerOverlay(o) })
chartTypes.forEach(ct => { registerIndicator(ct) })
registerIndicator(tradeVisualization)

// 新模块导出
import { themePresets, getThemeByName } from './theme'
import { exportToCSV, exportAllToCSV, exportScreenshot } from './export'
import KeyboardShortcutManager from './shortcut'
import { indicatorCategories, indicatorRegistry } from './indicator'

export {
  DefaultDatafeed,
  KLineChartPro,
  load as loadLocales,
  // 主题
  themePresets,
  getThemeByName,
  // 数据导出
  exportToCSV,
  exportAllToCSV,
  exportScreenshot,
  // 布局持久化
  // 快捷键
  KeyboardShortcutManager,
  // 指标分类
  indicatorCategories,
  // 懒加载注册表
  indicatorRegistry
}

export type {
  Datafeed, SymbolInfo, Period, DatafeedSubscribeCallback, ChartProOptions, ChartPro
}

export type { ThemePreset } from './theme'
export type { ShortcutBinding } from './shortcut'
export type { IndicatorClickEvent } from './types'
export { AlertManager } from './alert'
export type { AlertConfig, AlertEvent } from './alert/types'
export type * from './alert/drawingTypes'
export { normalizeToPercent } from './compare'
export { ReplayEngine } from './replay/ReplayEngine'
export type { ReplayState, ReplaySpeed } from './replay/types'
export { getTradeVisHitTargets, cleanupTradeVisInstance } from './indicator/trade/tradeVisualization'
export type { TradeRecord, TradeVisExtendData } from './indicator/trade/tradeVisualization'
export type { ConnectionState } from './DefaultDatafeed'

export type { DatafeedRequestContext, ChartSnapshot, HistoryQuery, HistoryMetadata, HistorySnapshot, HistoryResult, DatafeedStatus, ChartDataState } from './types'

export { calculateSessionVwap } from './indicator/volume/sessionVwap'
export type { BarSession, SessionKLineData, SessionVwapMethod, SessionVwapPoint } from './indicator/volume/sessionVwap'

export { loadLayoutV2, migrateLayoutV1, isChartLayoutV2 } from './persistence/v2'
export type { ChartLayoutV2, LayoutIndicator, LayoutPane, LayoutOverlay, LayoutJson } from './persistence/v2'
export { createSessionDatafeed, seriesIdentityKey } from './datafeed/session'
export type { SeriesIdentity, HistoryBatch, SessionUpdate, DataSession, SessionProvider, DataSessionStatus } from './datafeed/session'

export type { TimestampLocation } from './core/locateTimestamp'

export {loadLayoutV3,migrateLayoutToV3,isChartLayoutV3} from './persistence/v3'
export {saveLayoutV4,loadLayoutV4,deleteLayoutV4,listLayoutsV4,migrateLayoutToV4,isChartLayoutV4,captureLayout,restoreLayout} from './persistence/v4'
export type {ChartLayoutV4} from './persistence/v4'
export {builtinDrawingCatalog} from './drawing/catalog'
export type {DrawingToolDescriptor,DrawingParameter,DrawingCategory,DrawingStyleControl} from './drawing/catalog'
export type {DrawingAnchor,DrawingCommand,DrawingCommandResult,DrawingState,DrawingPresentation,DrawingScope,DrawingIntervalFilter} from './drawing/types'
export type {DrawingAnalyticsState,DrawingAnalyticsMethod,VwapPriceSource,VwapBandMode,VwapBandBoundary,VwapBandsSummary} from './drawing/analytics'
export type {ChartLayoutV3,LayoutResult,LayoutIndicatorV3} from './persistence/v3'
export {ChartWorkspace,isWorkspaceDocument} from './workspace/ChartWorkspace'
export type {ChartWorkspaceOptions,WorkspaceDocument,WorkspaceCell,WorkspaceBinding,WorkspaceLayout,WorkspaceSync} from './workspace/types'
export type {DrawingOwner,DrawingSource,DrawingSnapshot,DrawingChange,DrawingCommitResult,DrawingHistoryState} from './drawing/types'

export {resolveDrawingPane} from './drawing/pane'
export type {DrawingPaneIndicator} from './drawing/pane'

export type {ComparisonDatafeed,ComparisonHandle,ComparisonState} from './compare/types'

export {builtinIndicatorCatalog,registerIndicatorDefinition} from './indicator'
export type {IndicatorDescriptor,IndicatorParameter,IndicatorParameterSchema,IndicatorParameterValue,IndicatorPlacement,IndicatorHandle,IndicatorInstance,AddIndicatorOptions} from './indicator/catalog'
export type {IndicatorLoader} from './indicator/registry'

export type {AnalysisContext,AnalysisPoint,AnalysisBandPoint,AnalysisLabelPoint,AnalysisEvent,AnalysisLayerSpec,AnalysisLayerState,AnalysisLayerHandle,AnalysisOptions} from './analysis/types'

export {WorkspaceStoreError} from './workspace/store'
export type {WorkspaceSummary,StoredWorkspace,WorkspaceWrite,WorkspaceStore,WorkspaceStoreErrorCode} from './workspace/store'
export {createIndexedDBWorkspaceStore} from './workspace/indexedDBStore'
export {readLegacyWorkspace} from './workspace/legacy'

export {createIndexedDBDrawingPreferencesStore,defaultDrawingPreferences} from './drawing/preferences'
export type {DrawingPreferences,DrawingPreferencesState,DrawingPreferencesStore,DrawingTemplate,DrawingStylePreset} from './drawing/preferences'

export {DrawingSession,DrawingSessionRegistry} from './drawing/session'
export type {DrawingShareResolver,DrawingShareResolution,DrawingSharedReference,DrawingSessionState} from './drawing/session'
export type {DrawingShareIdentity,SharedDrawingDocument,DrawingTransferRecovery} from './drawing/document'
export {drawingShareKey} from './drawing/document'
export {DrawingStoreError,createIndexedDBDrawingDocumentStore} from './drawing/documentStore'
export type {DrawingDocumentStore,DrawingDocumentWrite,StoredDrawingDocument,DrawingStoreErrorCode} from './drawing/documentStore'
