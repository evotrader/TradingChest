/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@solidjs/testing-library'
import { ExposureStack } from '../ExposureStack'
import { DEFAULT_STATE_COPY } from '../../shared/types'

const STATE_COPY = DEFAULT_STATE_COPY

describe('ExposureStack', () => {
  it.each(['loading', 'empty', 'not_running', 'unavailable', 'error'] as const)(
    'renders %s without fabricating marks',
    (status) => {
      const { getByRole, queryAllByTestId } = render(() => (
        <ExposureStack viewState={{ status, message: STATE_COPY[status] }} segments={[]} />
      ))
      expect(queryAllByTestId('exposure-segment')).toHaveLength(0)
      expect(getByRole('status').textContent).toBe(STATE_COPY[status])
    },
  )

  it('renders segments when ready and preserves selection identity', () => {
    const onPointSelect = vi.fn()
    const segments = [
      { id: 's1', label: 'A', value: 40 },
      { id: 's2', label: 'B', value: 60 },
    ]
    const { getAllByTestId } = render(() => (
      <ExposureStack
        viewState={{ status: 'ready' }}
        segments={segments}
        onPointSelect={onPointSelect}
      />
    ))
    expect(getAllByTestId('exposure-segment')).toHaveLength(2)
    fireEvent.click(getAllByTestId('exposure-segment')[0])
    expect(onPointSelect.mock.calls[0][0]).toBe(segments[0])
  })
})
