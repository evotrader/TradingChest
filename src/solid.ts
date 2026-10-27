export type {DrawingAnalyticsState,DrawingAnalyticsMethod,VwapPriceSource,VwapBandMode,VwapBandBoundary,VwapBandsSummary} from './drawing/analytics'
export type {DrawingStyleControl,DrawingToolDescriptor} from './drawing/catalog'
export {resolveDrawingLevels,validateDrawingLevelSet,validateDrawingLevelPresetSet,isDrawingLevelSet,extractDrawingLevelPreset,instantiateDrawingLevelPreset,applyDrawingLevelPreset} from './drawing/levels'
export type {DrawingLevel,DrawingLevelSet,DrawingLevelAppearance,DrawingLevelPresetSet,DrawingLevelInput,DrawingLevelPresetInput} from './drawing/levels'
export {extractDrawingStylePreset,instantiateDrawingPresetParameters,applyDrawingPresetParameters,validateDrawingPresetParameters} from './drawing/presets'
export {migrateDrawingPreferences} from './drawing/preferences'
export type {DrawingPreferences,DrawingPreferencesV1,DrawingPreferencesInput,DrawingPreferencesPatch,DrawingPreferencesState,DrawingPreferencesStore,DrawingTemplate,DrawingStylePreset,DrawingPresetParameters,DrawingSnappingOptions} from './drawing/preferences'
export type {DrawingSnapshot,DrawingParameters,DrawingParameterPrimitive} from './drawing/types'
// Analytical widgets (state-first; no domain recomputation)
export type * from './alert/drawingTypes'
export { WidgetState } from './widget/shared/WidgetState'
export {
  DEFAULT_STATE_COPY,
  PNL_TOKEN,
  STATUS_TOKEN,
  formatSignedNumber,
  isReady,
  pnlColor,
  signOf,
} from './widget/shared/types'
export type {
  IntensityLevel,
  PnlColorConvention,
  WidgetStatus,
  WidgetViewState,
} from './widget/shared/types'

export { MetricSeries } from './widget/metric-series/MetricSeries'
export type { MetricSeriesPoint, MetricSeriesProps } from './widget/metric-series/MetricSeries'

export { DistributionChart } from './widget/distribution/DistributionChart'
export type { DistributionBin, DistributionChartProps } from './widget/distribution/DistributionChart'

export { ExposureStack } from './widget/exposure-stack/ExposureStack'
export type { ExposureStackSegment, ExposureStackProps } from './widget/exposure-stack/ExposureStack'

export { ProfitCalendar } from './widget/profit-calendar/ProfitCalendar'
export type {
  CalculationStatus,
  ProfitCalendarCell,
  ProfitCalendarDisplayMode,
  ProfitCalendarMonthSummary,
  ProfitCalendarProps,
  SessionStatus,
} from './widget/profit-calendar/types'
export {
  columnIndexForDate,
  defaultWeekdayLabels,
  flattenNavigableCells,
  layoutCalendarGrid,
  moveFocus,
  parseSessionDate,
} from './widget/profit-calendar/calendar-math'

export { mountAnalyticalWidget } from './widget/mountWidget'
export type { AnalyticalWidgetProps, MountedWidget } from './widget/mountWidget'
