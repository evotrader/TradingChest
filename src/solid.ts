export type {DrawingAnalyticsState,DrawingAnalyticsMethod,VwapPriceSource,VwapBandMode,VwapBandBoundary,VwapBandsSummary} from './drawing/analytics'
export type {DrawingStyleControl,DrawingToolDescriptor} from './drawing/catalog'
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
