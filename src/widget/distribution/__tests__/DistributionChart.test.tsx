/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@solidjs/testing-library'
import { DistributionChart } from '../DistributionChart'
import { DEFAULT_STATE_COPY } from '../../shared/types'

const STATE_COPY = DEFAULT_STATE_COPY

describe('DistributionChart', () => {
  it.each(['loading', 'empty', 'not_running', 'unavailable', 'error'] as const)(
    'renders %s without fabricating marks',
    (status) => {
      const { getByRole, queryAllByTestId } = render(() => (
        <DistributionChart viewState={{ status, message: STATE_COPY[status] }} bins={[]} />
      ))
      expect(queryAllByTestId('distribution-bar')).toHaveLength(0)
      expect(getByRole('status').textContent).toBe(STATE_COPY[status])
    },
  )

  it('renders bars when ready and preserves selection identity', () => {
    const onPointSelect = vi.fn()
    const bins = [
      { id: 'b1', label: '-1%', value: -2 },
      { id: 'b2', label: '0%', value: 5 },
    ]
    const { getAllByTestId } = render(() => (
      <DistributionChart
        viewState={{ status: 'ready' }}
        bins={bins}
        onPointSelect={onPointSelect}
      />
    ))
    expect(getAllByTestId('distribution-bar')).toHaveLength(2)
    fireEvent.click(getAllByTestId('distribution-bar')[1])
    expect(onPointSelect.mock.calls[0][0]).toBe(bins[1])
  })
})
