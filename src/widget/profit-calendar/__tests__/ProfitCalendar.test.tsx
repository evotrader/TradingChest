/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@solidjs/testing-library'
import { ProfitCalendar } from '../ProfitCalendar'
import { DEFAULT_STATE_COPY, PNL_TOKEN, STATUS_TOKEN } from '../../shared/types'
import type { ProfitCalendarCell } from '../types'

const STATE_COPY = DEFAULT_STATE_COPY

function makeCell (partial: Partial<ProfitCalendarCell> & Pick<ProfitCalendarCell, 'id' | 'sessionDate'>): ProfitCalendarCell {
  return {
    sessionStatus: 'final',
    calculationStatus: 'ready',
    intensity: 2,
    ...partial,
  }
}

describe('ProfitCalendar honest states', () => {
  it.each(['loading', 'empty', 'not_running', 'unavailable', 'error'] as const)(
    'renders %s without fabricating calendar marks',
    (status) => {
      const { getByRole, queryAllByTestId } = render(() => (
        <ProfitCalendar viewState={{ status, message: STATE_COPY[status] }} cells={[]} />
      ))
      expect(queryAllByTestId('calendar-cell')).toHaveLength(0)
      expect(getByRole('status').textContent).toBe(STATE_COPY[status])
    },
  )
})

describe('ProfitCalendar P&L semantics and accessibility', () => {
  const cells: ProfitCalendarCell[] = [
    makeCell({
      id: 'd1',
      sessionDate: '2026-01-05',
      value: 12.5,
      displayValue: '+12.50',
      sessionStatus: 'final',
      calculationStatus: 'ready',
      intensity: 3,
    }),
    makeCell({
      id: 'd2',
      sessionDate: '2026-01-06',
      value: -3.25,
      displayValue: '-3.25',
      sessionStatus: 'final',
      calculationStatus: 'ready',
      intensity: 2,
    }),
    makeCell({
      id: 'd3',
      sessionDate: '2026-01-07',
      value: null,
      sessionStatus: 'provisional',
      calculationStatus: 'ready',
    }),
    makeCell({
      id: 'd4',
      sessionDate: '2026-01-08',
      sessionStatus: 'holiday',
      calculationStatus: 'ready',
      value: null,
    }),
    makeCell({
      id: 'd5',
      sessionDate: '2026-01-09',
      sessionStatus: 'future',
      calculationStatus: 'ready',
      value: null,
    }),
    makeCell({
      id: 'd6',
      sessionDate: '2026-01-12',
      sessionStatus: 'closed_no_snapshot',
      calculationStatus: 'unavailable',
      value: null,
      unavailableReason: '缺少日终权益快照',
      resolvingHref: '/config',
      resolvingLabel: '配置估值日历',
    }),
    makeCell({
      id: 'd7',
      sessionDate: '2026-01-13',
      sessionStatus: 'final',
      calculationStatus: 'unavailable',
      value: null,
      unavailableReason: '跨 RESET 边界',
    }),
  ]

  it('shows explicit +/- text for gain and loss', () => {
    const { getAllByTestId } = render(() => (
      <ProfitCalendar viewState={{ status: 'ready' }} cells={cells} columns={5} />
    ))
    const values = getAllByTestId('calendar-cell-value').map(n => n.textContent)
    expect(values).toContain('+12.50')
    expect(values).toContain('-3.25')
  })

  it('inverts P&L tokens for cn_market vs global without changing status colors', () => {
    const cn = render(() => (
      <ProfitCalendar
        viewState={{ status: 'ready' }}
        cells={cells}
        columns={5}
        pnlColorConvention="cn_market"
      />
    ))
    const cnGain = cn.getByTestId('legend-gain').getAttribute('data-color')
    const cnLoss = cn.getByTestId('legend-loss').getAttribute('data-color')
    const cnStatus = cn.getByTestId('legend-status-provisional').getAttribute('data-color')
    expect(cnGain).toBe(PNL_TOKEN.cn_market.gain)
    expect(cnLoss).toBe(PNL_TOKEN.cn_market.loss)
    expect(cnStatus).toBe(STATUS_TOKEN.provisional)
    cn.unmount()

    const global = render(() => (
      <ProfitCalendar
        viewState={{ status: 'ready' }}
        cells={cells}
        columns={5}
        pnlColorConvention="global"
      />
    ))
    const gGain = global.getByTestId('legend-gain').getAttribute('data-color')
    const gLoss = global.getByTestId('legend-loss').getAttribute('data-color')
    const gStatus = global.getByTestId('legend-status-provisional').getAttribute('data-color')
    expect(gGain).toBe(PNL_TOKEN.global.gain)
    expect(gLoss).toBe(PNL_TOKEN.global.loss)
    expect(gStatus).toBe(STATUS_TOKEN.provisional)
    expect(gStatus).toBe(cnStatus)
    expect(gGain).not.toBe(cnGain)
    expect(gLoss).not.toBe(cnLoss)

    // Provisional badge color attribute stays fixed under both conventions
    const provisional = global.getByTestId('calendar-cell-provisional')
    expect(provisional.getAttribute('data-status-color')).toBe(STATUS_TOKEN.provisional)
  })

  it('renders provisional/final/holiday/future/closed-no-snapshot and unavailable calculations', () => {
    const { getAllByTestId, getByText, getByTestId } = render(() => (
      <ProfitCalendar viewState={{ status: 'ready' }} cells={cells} columns={5} />
    ))
    const statuses = getAllByTestId('calendar-cell').map(el => el.getAttribute('data-session-status'))
    expect(statuses).toEqual(expect.arrayContaining([
      'provisional',
      'final',
      'holiday',
      'future',
      'closed_no_snapshot',
    ]))
    expect(getByText('休市')).toBeTruthy()
    expect(getByText('无快照')).toBeTruthy()
    expect(getByText('缺少日终权益快照')).toBeTruthy()
    expect(getByText('跨 RESET 边界')).toBeTruthy()
    expect(getByTestId('calendar-resolving-link').getAttribute('href')).toBe('/config')
    expect(getByTestId('calendar-cell-provisional').textContent).toBe('进行中')
  })

  it('moves focus with arrow keys and selects with Enter using payload identity', () => {
    const onCellSelect = vi.fn()
    const { getByRole, getAllByTestId } = render(() => (
      <ProfitCalendar
        viewState={{ status: 'ready' }}
        cells={cells}
        columns={5}
        focusedCellId="d1"
        onCellSelect={onCellSelect}
      />
    ))
    const grid = getByRole('grid')
    grid.focus()
    fireEvent.keyDown(grid, { key: 'ArrowRight' })
    fireEvent.keyDown(grid, { key: 'Enter' })
    expect(onCellSelect).toHaveBeenCalledTimes(1)
    expect(onCellSelect.mock.calls[0][0]).toBe(cells[1])
    expect(onCellSelect.mock.calls[0][0].id).toBe('d2')

    // Click path also preserves identity
    const holiday = getAllByTestId('calendar-cell').find(
      el => el.getAttribute('data-session-status') === 'holiday'
    )!
    fireEvent.click(holiday)
    expect(onCellSelect.mock.calls.at(-1)?.[0]).toBe(cells[3])
  })

  it('exposes screen-reader labels including date, value and status', () => {
    const { getAllByTestId } = render(() => (
      <ProfitCalendar viewState={{ status: 'ready' }} cells={cells} columns={5} />
    ))
    const labels = getAllByTestId('calendar-cell').map(el => el.getAttribute('aria-label') ?? '')
    expect(labels.some(l => l.includes('2026-01-05') && l.includes('+12.50'))).toBe(true)
    expect(labels.some(l => l.includes('休市'))).toBe(true)
    expect(labels.some(l => l.includes('进行中') || l.includes('provisional'))).toBe(true)
    expect(labels.some(l => l.includes('不可用') || l.includes('缺少'))).toBe(true)
  })

  it('renders month summary without recomputing when unavailable', () => {
    const { getByTestId } = render(() => (
      <ProfitCalendar
        viewState={{ status: 'ready' }}
        cells={cells}
        columns={5}
        monthSummary={{
          yearMonth: '2026-01',
          calculationStatus: 'unavailable',
          unavailableReason: '缺最终交易日',
        }}
      />
    ))
    expect(getByTestId('month-summary-unavailable').textContent).toBe('缺最终交易日')
  })
})

it('renders a real weekend capture error before the missing-snapshot chrome and retains its reason', () => {
  const onCellSelect = vi.fn()
  const cell = makeCell({ id: 'weekend-error', sessionDate: '2026-10-11',
    sessionStatus: 'closed_no_snapshot', calculationStatus: 'error', value: null,
    unavailableReason: 'SESSION_CAPTURE_FAILED · 检查原估值任务后刷新' })
  const { getByTestId, getByRole } = render(() => (
    <ProfitCalendar viewState={{ status: 'ready' }} cells={[cell]} columns={7} onCellSelect={onCellSelect} />
  ))
  expect(getByTestId('calendar-cell-value').textContent).toBe('错误')
  expect(getByTestId('calendar-cell-unavailable').textContent).toContain('SESSION_CAPTURE_FAILED')
  fireEvent.click(getByTestId('calendar-cell'))
  expect(onCellSelect).toHaveBeenCalledWith(cell)
})
