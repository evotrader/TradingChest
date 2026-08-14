/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@solidjs/testing-library'
import { MetricSeries } from '../MetricSeries'
import { DEFAULT_STATE_COPY } from '../../shared/types'

const STATE_COPY = DEFAULT_STATE_COPY

describe('MetricSeries', () => {
  it.each(['loading', 'empty', 'not_running', 'unavailable', 'error'] as const)(
    'renders %s without fabricating marks',
    (status) => {
      const { getByRole, queryAllByTestId } = render(() => (
        <MetricSeries viewState={{ status, message: STATE_COPY[status] }} points={[]} />
      ))
      expect(queryAllByTestId('series-point')).toHaveLength(0)
      expect(getByRole('status').textContent).toBe(STATE_COPY[status])
    },
  )

  it('renders points only when ready and fires onPointSelect with identity', () => {
    const onPointSelect = vi.fn()
    const points = [
      { id: 'p1', x: '2026-01-01', y: 1.5 },
      { id: 'p2', x: '2026-01-02', y: -0.5 },
    ]
    const { getAllByTestId } = render(() => (
      <MetricSeries
        viewState={{ status: 'ready' }}
        points={points}
        onPointSelect={onPointSelect}
      />
    ))
    const marks = getAllByTestId('series-point')
    expect(marks).toHaveLength(2)
    fireEvent.click(marks[0])
    expect(onPointSelect).toHaveBeenCalledTimes(1)
    expect(onPointSelect.mock.calls[0][0]).toBe(points[0])
    expect(onPointSelect.mock.calls[0][0].id).toBe('p1')
  })
})
