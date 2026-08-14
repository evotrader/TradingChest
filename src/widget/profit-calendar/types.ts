import type {
  IntensityLevel,
  PnlColorConvention,
  WidgetViewState,
} from '../shared/types'

export type SessionStatus =
  | 'provisional'
  | 'final'
  | 'holiday'
  | 'future'
  | 'closed_no_snapshot'

export type CalculationStatus = 'ready' | 'unavailable' | 'error'

/**
 * One supplied calendar cell. All domain values are precomputed by the API;
 * the widget only lays out, colors, and selects.
 */
export interface ProfitCalendarCell {
  /** Stable identity returned by onCellSelect (must equal payload identity). */
  id: string
  /** Session calendar date YYYY-MM-DD. */
  sessionDate: string
  sessionStatus: SessionStatus
  calculationStatus: CalculationStatus
  /**
   * Preformatted signed display (amount or return). Preferred over raw `value`
   * when the page already localized the figure.
   */
  displayValue?: string | null
  /** Optional finite numeric for presentation sign/color only. */
  value?: number | null
  /** Caller-supplied discrete intensity token; widget never recomputes buckets. */
  intensity?: IntensityLevel | null
  unavailableReason?: string | null
  /** Optional deep-link target for resolving unavailable/error (API-supplied). */
  resolvingHref?: string | null
  resolvingLabel?: string | null
  /** Optional full accessible name; otherwise derived from cell fields. */
  accessibleLabel?: string | null
}

export interface ProfitCalendarMonthSummary {
  /** YYYY-MM */
  yearMonth: string
  displayValue?: string | null
  value?: number | null
  calculationStatus: CalculationStatus
  unavailableReason?: string | null
}

export type ProfitCalendarDisplayMode = 'amount' | 'return'

export interface ProfitCalendarProps {
  viewState: WidgetViewState
  cells: ReadonlyArray<ProfitCalendarCell>
  monthSummary?: ProfitCalendarMonthSummary | null
  /**
   * Grid column count from valuation calendar (5 = Mon–Fri, 7 = 7×24).
   * Layout only — widget does not infer market sessions.
   */
  columns?: 5 | 7
  /** Weekday headers; length should match columns. Defaults to CN Mon–Sun subset. */
  weekdayLabels?: ReadonlyArray<string>
  displayMode?: ProfitCalendarDisplayMode
  pnlColorConvention?: PnlColorConvention
  class?: string
  /** Initially focused cell id (optional). */
  focusedCellId?: string | null
  onCellSelect?: (cell: ProfitCalendarCell) => void
  onFocusCellChange?: (cell: ProfitCalendarCell | null) => void
}

export type { IntensityLevel, PnlColorConvention, WidgetViewState }
