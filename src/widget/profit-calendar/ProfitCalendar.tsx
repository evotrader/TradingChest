import {
  type Component,
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
} from 'solid-js'
import WidgetState from '../shared/WidgetState'
import {
  STATUS_TOKEN,
  formatSignedNumber,
  isReady,
  pnlColor,
  signOf,
} from '../shared/types'
import {
  dayOfMonthLabel,
  defaultWeekdayLabels,
  intensityOpacity,
  layoutCalendarGrid,
  moveFocus,
} from './calendar-math'
import type {
  ProfitCalendarCell,
  ProfitCalendarProps,
  SessionStatus,
} from './types'

const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
  provisional: '进行中',
  final: '已结算',
  holiday: '休市',
  future: '未来',
  closed_no_snapshot: '无日终快照',
}

function cellDisplayText (cell: ProfitCalendarCell): string {
  if (cell.calculationStatus === 'error') return '错误'
  if (cell.sessionStatus === 'holiday') return '休市'
  if (cell.sessionStatus === 'future') return '—'
  if (cell.sessionStatus === 'closed_no_snapshot') return '无快照'
  if (cell.calculationStatus === 'unavailable') return '不可用'
  if (cell.displayValue != null && cell.displayValue !== '') return cell.displayValue
  if (cell.value !== null && cell.value !== undefined && Number.isFinite(cell.value)) {
    return formatSignedNumber(cell.value)
  }
  if (cell.sessionStatus === 'provisional') return '进行中'
  return '—'
}

function cellAccessibleName (cell: ProfitCalendarCell): string {
  if (cell.accessibleLabel) return cell.accessibleLabel
  const status = SESSION_STATUS_LABEL[cell.sessionStatus]
  const calc =
    cell.calculationStatus === 'ready'
      ? cellDisplayText(cell)
      : cell.calculationStatus === 'unavailable'
        ? (cell.unavailableReason ?? '不可用')
        : '错误'
  return `${cell.sessionDate} ${status} ${calc}`
}

function sessionStatusColor (status: SessionStatus): string {
  switch (status) {
    case 'provisional':
      return STATUS_TOKEN.provisional
    case 'holiday':
      return STATUS_TOKEN.holiday
    case 'future':
      return STATUS_TOKEN.future
    case 'closed_no_snapshot':
      return STATUS_TOKEN.closed_no_snapshot
    default:
      return STATUS_TOKEN.neutral
  }
}

function cellBackground (
  cell: ProfitCalendarCell,
  convention: 'cn_market' | 'global'
): string {
  if (cell.calculationStatus === 'error') return `${STATUS_TOKEN.error}22`
  // Status chrome never follows P&L convention.
  if (
    cell.sessionStatus === 'holiday'
    || cell.sessionStatus === 'future'
    || cell.sessionStatus === 'closed_no_snapshot'
  ) {
    return `${sessionStatusColor(cell.sessionStatus)}22`
  }
  if (cell.calculationStatus !== 'ready') {
    return `${STATUS_TOKEN.unavailable}22`
  }
  const sign = signOf(cell.value)
  if (sign === null || sign === 'zero') return '#141C26'
  const base = pnlColor(convention, sign)
  const alpha = intensityOpacity(cell.intensity ?? 2)
  const hex = base.replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function cellTextColor (
  cell: ProfitCalendarCell,
  convention: 'cn_market' | 'global'
): string {
  if (cell.calculationStatus === 'error') return STATUS_TOKEN.error
  if (
    cell.sessionStatus === 'holiday'
    || cell.sessionStatus === 'future'
    || cell.sessionStatus === 'closed_no_snapshot'
  ) {
    return sessionStatusColor(cell.sessionStatus)
  }
  if (cell.calculationStatus === 'unavailable') return STATUS_TOKEN.unavailable
  if (cell.sessionStatus === 'provisional' && (cell.value === null || cell.value === undefined)) {
    return STATUS_TOKEN.provisional
  }
  return pnlColor(convention, signOf(cell.value))
}

/**
 * Profit calendar grid. Lays out supplied cells/month summary only —
 * never recomputes returns, eras, or missing days.
 *
 * @example
 * <ProfitCalendar viewState={{ status: 'not_running', message: '未运行' }} cells={[]} />
 */
export const ProfitCalendar: Component<ProfitCalendarProps> = (props) => {
  const columns = () => props.columns ?? 5
  const convention = () => props.pnlColorConvention ?? 'cn_market'
  const ready = () => isReady(props.viewState)
  const weekdayLabels = () =>
    props.weekdayLabels && props.weekdayLabels.length === columns()
      ? props.weekdayLabels
      : defaultWeekdayLabels(columns())

  const rows = createMemo(() => layoutCalendarGrid(props.cells, columns()))

  const [focusedId, setFocusedId] = createSignal<string | null>(
    props.focusedCellId ?? props.cells[0]?.id ?? null
  )

  createEffect(() => {
    if (props.focusedCellId) setFocusedId(props.focusedCellId)
  })

  createEffect(() => {
    const ids = new Set(props.cells.map(c => c.id))
    const cur = focusedId()
    if (cur && !ids.has(cur)) {
      setFocusedId(props.cells[0]?.id ?? null)
    } else if (!cur && props.cells[0]) {
      setFocusedId(props.cells[0].id)
    }
  })

  const selectCell = (cell: ProfitCalendarCell) => {
    setFocusedId(cell.id)
    props.onFocusCellChange?.(cell)
    props.onCellSelect?.(cell)
  }

  const onGridKeyDown = (e: KeyboardEvent) => {
    if (!ready()) return
    const key = e.key
    if (
      key === 'ArrowLeft'
      || key === 'ArrowRight'
      || key === 'ArrowUp'
      || key === 'ArrowDown'
    ) {
      e.preventDefault()
      const next = moveFocus(rows(), focusedId(), key, columns())
      if (next) {
        setFocusedId(next.id)
        props.onFocusCellChange?.(next)
        // Move DOM focus to the cell button for visible focus.
        const el = document.querySelector<HTMLElement>(
          `[data-testid="calendar-cell"][data-cell-id="${CSS.escape(next.id)}"]`
        )
        el?.focus()
      }
      return
    }
    if (key === 'Enter' || key === ' ') {
      const id = focusedId()
      const cell = props.cells.find(c => c.id === id)
      if (cell) {
        e.preventDefault()
        selectCell(cell)
      }
    }
  }

  return (
    <div
      class={props.class}
      data-testid="profit-calendar"
      data-pnl-convention={convention()}
      style={{
        border: `1px solid ${STATUS_TOKEN.border}`,
        'border-radius': '6px',
        background: STATUS_TOKEN.surface,
        padding: '12px',
        color: STATUS_TOKEN.text,
      }}
    >
      <Show
        when={ready()}
        fallback={<WidgetState viewState={props.viewState} />}
      >
        <Show
          when={props.cells.length > 0}
          fallback={
            <div role="status" style={{ color: STATUS_TOKEN.muted, 'text-align': 'center', padding: '16px' }}>
              暂无数据
            </div>
          }
        >
          <div
            role="grid"
            aria-label="盈亏日历"
            tabindex="0"
            onKeyDown={onGridKeyDown}
            style={{ outline: 'none' }}
          >
            <div role="row" style={{ display: 'grid', 'grid-template-columns': `repeat(${columns()}, 1fr)`, gap: '4px', 'margin-bottom': '4px' }}>
              <For each={[...weekdayLabels()]}>
                {(label) => (
                  <div
                    role="columnheader"
                    style={{
                      'text-align': 'center',
                      color: STATUS_TOKEN.muted,
                      'font-size': '12px',
                      padding: '4px',
                    }}
                  >
                    {label}
                  </div>
                )}
              </For>
            </div>
            <For each={rows()}>
              {(row) => (
                <div
                  role="row"
                  data-testid="calendar-row"
                  style={{ display: 'grid', 'grid-template-columns': `repeat(${columns()}, 1fr)`, gap: '4px', 'margin-bottom': '4px' }}
                >
                  <For each={row.cells.map((cell, col) => ({ cell, col }))}>
                    {(slot) => {
                      const cell = slot.cell
                      if (!cell) {
                        return (
                          <div
                            role="gridcell"
                            aria-hidden="true"
                            data-testid="calendar-cell-empty"
                            style={{ 'min-height': '64px' }}
                          />
                        )
                      }
                      return (
                        <button
                          type="button"
                          role="gridcell"
                          data-testid="calendar-cell"
                          data-cell-id={cell.id}
                          data-session-status={cell.sessionStatus}
                          data-calculation-status={cell.calculationStatus}
                          data-pnl-sign={signOf(cell.value) ?? 'none'}
                          aria-label={cellAccessibleName(cell)}
                          aria-selected={focusedId() === cell.id ? 'true' : 'false'}
                          tabindex={focusedId() === cell.id ? 0 : -1}
                          style={{
                            'min-height': '64px',
                            'min-width': '44px',
                            padding: '6px',
                            border: focusedId() === cell.id
                              ? `2px solid ${STATUS_TOKEN.focus}`
                              : `1px solid ${STATUS_TOKEN.border}`,
                            'border-radius': '4px',
                            background: cellBackground(cell, convention()),
                            color: cellTextColor(cell, convention()),
                            cursor: 'pointer',
                            'text-align': 'left',
                            'font-family': 'inherit',
                            display: 'flex',
                            'flex-direction': 'column',
                            gap: '2px',
                          }}
                          onClick={() => selectCell(cell)}
                          onFocus={() => {
                            setFocusedId(cell.id)
                            props.onFocusCellChange?.(cell)
                          }}
                        >
                          <span
                            data-testid="calendar-cell-date"
                            style={{ 'font-size': '12px', color: STATUS_TOKEN.muted }}
                          >
                            {dayOfMonthLabel(cell.sessionDate)}
                          </span>
                          <span
                            data-testid="calendar-cell-value"
                            style={{
                              'font-size': '13px',
                              'font-variant-numeric': 'tabular-nums',
                              'font-weight': 600,
                            }}
                          >
                            {cellDisplayText(cell)}
                          </span>
                          <Show when={cell.sessionStatus === 'provisional'}>
                            <span
                              data-testid="calendar-cell-provisional"
                              data-status-color={STATUS_TOKEN.provisional}
                              style={{ 'font-size': '11px', color: STATUS_TOKEN.provisional }}
                            >
                              进行中
                            </span>
                          </Show>
                          <Show when={cell.calculationStatus === 'unavailable' || cell.calculationStatus === 'error'}>
                            <span data-testid="calendar-cell-unavailable" style={{ 'font-size': '11px' }}>
                              {cell.unavailableReason ?? '不可用'}
                              <Show when={!!cell.resolvingHref}>
                                <a
                                  href={cell.resolvingHref!}
                                  data-testid="calendar-resolving-link"
                                  style={{ 'margin-left': '4px', color: STATUS_TOKEN.focus }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {cell.resolvingLabel ?? '去处理'}
                                </a>
                              </Show>
                            </span>
                          </Show>
                        </button>
                      )
                    }}
                  </For>
                </div>
              )}
            </For>
          </div>

          <Show when={props.monthSummary}>
            <div
              data-testid="calendar-month-summary"
              data-calculation-status={props.monthSummary!.calculationStatus}
              style={{
                'margin-top': '12px',
                padding: '8px',
                'border-top': `1px solid ${STATUS_TOKEN.border}`,
                'font-size': '13px',
                color: STATUS_TOKEN.text,
              }}
            >
              <span style={{ color: STATUS_TOKEN.muted }}>{props.monthSummary!.yearMonth} 月汇总</span>
              {': '}
              <Show
                when={props.monthSummary!.calculationStatus === 'ready'}
                fallback={
                  <span data-testid="month-summary-unavailable">
                    {props.monthSummary!.unavailableReason
                      ?? (props.monthSummary!.calculationStatus === 'error' ? '错误' : '不可用')}
                  </span>
                }
              >
                <span
                  data-testid="month-summary-value"
                  style={{
                    color: pnlColor(convention(), signOf(props.monthSummary!.value)),
                    'font-variant-numeric': 'tabular-nums',
                    'font-weight': 600,
                  }}
                >
                  {props.monthSummary!.displayValue
                    ?? (props.monthSummary!.value !== null && props.monthSummary!.value !== undefined
                      ? formatSignedNumber(props.monthSummary!.value)
                      : '—')}
                </span>
              </Show>
            </div>
          </Show>

          <div
            data-testid="pnl-legend"
            data-pnl-convention={convention()}
            style={{
              display: 'flex',
              gap: '12px',
              'margin-top': '8px',
              'font-size': '11px',
              color: STATUS_TOKEN.muted,
            }}
          >
            <span>
              <span
                data-testid="legend-gain"
                data-color={pnlColor(convention(), 'positive')}
                style={{
                  display: 'inline-block',
                  width: '10px',
                  height: '10px',
                  background: pnlColor(convention(), 'positive'),
                  'margin-right': '4px',
                  'vertical-align': 'middle',
                }}
              />
              正收益
            </span>
            <span>
              <span
                data-testid="legend-loss"
                data-color={pnlColor(convention(), 'negative')}
                style={{
                  display: 'inline-block',
                  width: '10px',
                  height: '10px',
                  background: pnlColor(convention(), 'negative'),
                  'margin-right': '4px',
                  'vertical-align': 'middle',
                }}
              />
              负收益
            </span>
            <span>
              <span
                data-testid="legend-status-provisional"
                data-color={STATUS_TOKEN.provisional}
                style={{
                  display: 'inline-block',
                  width: '10px',
                  height: '10px',
                  background: STATUS_TOKEN.provisional,
                  'margin-right': '4px',
                  'vertical-align': 'middle',
                }}
              />
              状态色（不随约定变化）
            </span>
          </div>
        </Show>
      </Show>
    </div>
  )
}

export default ProfitCalendar
