/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { render } from '@solidjs/testing-library'
import { WidgetState } from '../WidgetState'
import { DEFAULT_STATE_COPY } from '../types'

describe('WidgetState', () => {
  it.each(['loading', 'empty', 'not_running', 'unavailable', 'error'] as const)(
    'renders honest %s status without marks',
    (status) => {
      const { getByRole, queryAllByTestId } = render(() => (
        <WidgetState viewState={{ status, message: DEFAULT_STATE_COPY[status] }} />
      ))
      expect(queryAllByTestId('series-point')).toHaveLength(0)
      expect(getByRole('status').textContent).toBe(DEFAULT_STATE_COPY[status])
    },
  )

  it('renders nothing for ready', () => {
    const { queryByRole } = render(() => (
      <WidgetState viewState={{ status: 'ready' }} />
    ))
    expect(queryByRole('status')).toBeNull()
  })
})
