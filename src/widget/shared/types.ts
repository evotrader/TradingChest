/**
 * Minimal view-state envelope owned by TradingChest widgets.
 * Callers unwrap application SectionState and pass only status + message.
 * Widgets never import evotrader API types or freshness contracts.
 */
export type WidgetStatus =
  | 'loading'
  | 'empty'
  | 'not_running'
  | 'unavailable'
  | 'error'
  | 'ready'

export interface WidgetViewState {
  status: WidgetStatus
  message?: string
}

/** Closed P&L color convention. Status colors must not follow this choice. */
export type PnlColorConvention = 'cn_market' | 'global'

/** Discrete intensity tokens for heat cells (caller-supplied; widget does not recompute). */
export type IntensityLevel = 0 | 1 | 2 | 3 | 4

export const DEFAULT_STATE_COPY: Record<Exclude<WidgetStatus, 'ready'>, string> = {
  loading: '加载中',
  empty: '暂无数据',
  not_running: '未运行',
  unavailable: '不可用',
  error: '加载失败',
}

export const PNL_TOKEN = {
  cn_market: { gain: '#EF5B5B', loss: '#28C781' },
  global: { gain: '#28C781', loss: '#EF5B5B' },
} as const

/** Status chrome independent of P&L convention. */
export const STATUS_TOKEN = {
  provisional: '#E8B84E',
  holiday: '#8F9BAA',
  future: '#5B6A7C',
  closed_no_snapshot: '#EF5B5B',
  unavailable: '#E8B84E',
  error: '#EF5B5B',
  neutral: '#8F9BAA',
  focus: '#4E86F7',
  border: '#27313D',
  surface: '#0F151D',
  text: '#E7EDF5',
  muted: '#8F9BAA',
} as const

export function isReady (viewState: WidgetViewState | undefined): boolean {
  return viewState?.status === 'ready'
}

export function pnlColor (
  convention: PnlColorConvention,
  sign: 'positive' | 'negative' | 'zero' | null | undefined
): string {
  if (sign === 'positive') return PNL_TOKEN[convention].gain
  if (sign === 'negative') return PNL_TOKEN[convention].loss
  return STATUS_TOKEN.muted
}

/**
 * Format a finite number with an explicit leading sign for non-zero values.
 * Presentation only — does not compute domain P&L.
 */
export function formatSignedNumber (value: number, fractionDigits = 2): string {
  if (!Number.isFinite(value)) return '—'
  if (value === 0) return (0).toFixed(fractionDigits)
  const abs = Math.abs(value).toFixed(fractionDigits)
  return value > 0 ? `+${abs}` : `-${abs}`
}

export function signOf (value: number | null | undefined): 'positive' | 'negative' | 'zero' | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null
  if (value > 0) return 'positive'
  if (value < 0) return 'negative'
  return 'zero'
}
