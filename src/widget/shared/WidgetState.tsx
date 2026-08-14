import { type Component, Show } from 'solid-js'
import {
  DEFAULT_STATE_COPY,
  STATUS_TOKEN,
  type WidgetViewState,
} from './types'

export interface WidgetStateProps {
  viewState: WidgetViewState
  class?: string
  'data-testid'?: string
}

/**
 * Honest non-ready envelope. Renders role="status" text only — never fabricates marks.
 *
 * @example
 * <WidgetState viewState={{ status: 'not_running', message: '未运行' }} />
 */
const WidgetState: Component<WidgetStateProps> = (props) => {
  const message = () =>
    props.viewState.message
    ?? (props.viewState.status === 'ready'
      ? ''
      : DEFAULT_STATE_COPY[props.viewState.status])

  return (
    <Show when={props.viewState.status !== 'ready'}>
      <div
        role="status"
        class={props.class}
        data-testid={props['data-testid'] ?? 'widget-state'}
        data-widget-status={props.viewState.status}
        style={{
          color: STATUS_TOKEN.muted,
          'font-size': '13px',
          padding: '16px',
          'text-align': 'center',
          'min-height': '48px',
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
        }}
      >
        {message()}
      </div>
    </Show>
  )
}

export default WidgetState
export { WidgetState }
