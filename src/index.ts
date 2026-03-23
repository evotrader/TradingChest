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

import { registerOverlay, registerIndicator } from 'klinecharts'

import overlays from './extension'
import chartTypes from './chartType'

import DefaultDatafeed from './DefaultDatafeed'
import KLineChartPro from './KLineChartPro'

import { load } from './i18n'

import { Datafeed, SymbolInfo, Period, DatafeedSubscribeCallback, ChartProOptions, ChartPro } from './types'

import './index.less'

import tradeVisualization from './indicator/trade/tradeVisualization'

overlays.forEach(o => { registerOverlay(o) })
chartTypes.forEach(ct => { registerIndicator(ct) })
registerIndicator(tradeVisualization)

// 新模块导出
import { themePresets, getThemeByName } from './theme'
import { exportToCSV, exportAllToCSV, exportScreenshot } from './export'
import { saveLayout, loadLayout, deleteLayout, listLayouts } from './persistence'
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
  saveLayout,
  loadLayout,
  deleteLayout,
  listLayouts,
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
export type { ChartLayout } from './persistence'
export type { ShortcutBinding } from './shortcut'
export type { IndicatorClickEvent } from './types'
export { AlertManager } from './alert'
export type { AlertConfig, AlertEvent } from './alert/types'
export { normalizeToPercent } from './compare'
export { ReplayEngine } from './replay/ReplayEngine'
export type { ReplayState, ReplaySpeed } from './replay/types'
