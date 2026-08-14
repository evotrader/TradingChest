import { type Component, For, Show, createMemo } from 'solid-js'
import WidgetState from '../shared/WidgetState'
import {
  STATUS_TOKEN,
  formatSignedNumber,
  isReady,
  type WidgetViewState,
} from '../shared/types'

export interface ExposureStackSegment {
  /** Stable identity returned by onPointSelect. */
  id: string
  label: string
  /** Precomputed absolute contribution; widget does not re-aggregate. */
  value: number
  /** Optional discrete color token supplied by the caller. */
  color?: string
}

export interface ExposureStackProps {
  viewState: WidgetViewState
  segments: ReadonlyArray<ExposureStackSegment>
  height?: number
  class?: string
  onPointSelect?: (segment: ExposureStackSegment) => void
}

const DEFAULT_HEIGHT = 32
const STACK_PALETTE = ['#4E86F7', '#8B7CF6', '#28C781', '#E8B84E', '#EF5B5B', '#5B6A7C']

/**
 * Horizontal exposure stack. Segments are layout-only proportions of supplied values.
 *
 * @example
 * <ExposureStack viewState={{ status: 'empty', message: '暂无数据' }} segments={[]} />
 */
export const ExposureStack: Component<ExposureStackProps> = (props) => {
  const height = () => props.height ?? DEFAULT_HEIGHT
  const ready = () => isReady(props.viewState)

  const layout = createMemo(() => {
    const segs = props.segments
    const total = segs.reduce((sum, s) => sum + Math.abs(s.value), 0)
    if (total <= 0) {
      return segs.map((segment, i) => ({
        segment,
        widthPct: 0,
        color: segment.color ?? STACK_PALETTE[i % STACK_PALETTE.length],
      }))
    }
    return segs.map((segment, i) => ({
      segment,
      widthPct: (Math.abs(segment.value) / total) * 100,
      color: segment.color ?? STACK_PALETTE[i % STACK_PALETTE.length],
    }))
  })

  return (
    <div
      class={props.class}
      data-testid="exposure-stack"
      style={{
        border: `1px solid ${STATUS_TOKEN.border}`,
        'border-radius': '6px',
        background: STATUS_TOKEN.surface,
        padding: '12px',
      }}
    >
      <Show
        when={ready()}
        fallback={<WidgetState viewState={props.viewState} />}
      >
        <Show
          when={props.segments.length > 0}
          fallback={
            <div role="status" style={{ color: STATUS_TOKEN.muted, 'text-align': 'center', padding: '8px' }}>
              暂无数据
            </div>
          }
        >
          <div
            role="img"
            aria-label="exposure stack"
            style={{
              display: 'flex',
              width: '100%',
              height: `${height()}px`,
              overflow: 'hidden',
              'border-radius': '4px',
              background: '#141C26',
            }}
          >
            <For each={layout()}>
              {(item) => (
                <button
                  type="button"
                  data-testid="exposure-segment"
                  data-segment-id={item.segment.id}
                  aria-label={`${item.segment.label}: ${formatSignedNumber(item.segment.value)}`}
                  title={`${item.segment.label}: ${formatSignedNumber(item.segment.value)}`}
                  style={{
                    width: `${item.widthPct}%`,
                    'min-width': item.widthPct > 0 ? '2px' : '0',
                    height: '100%',
                    border: 'none',
                    padding: 0,
                    margin: 0,
                    background: item.color,
                    cursor: props.onPointSelect ? 'pointer' : 'default',
                  }}
                  onClick={() => props.onPointSelect?.(item.segment)}
                />
              )}
            </For>
          </div>
          <ul
            style={{
              display: 'flex',
              'flex-wrap': 'wrap',
              gap: '8px 16px',
              margin: '8px 0 0',
              padding: 0,
              'list-style': 'none',
              color: STATUS_TOKEN.muted,
              'font-size': '12px',
            }}
          >
            <For each={layout()}>
              {(item) => (
                <li data-testid="exposure-legend-item">
                  <span
                    style={{
                      display: 'inline-block',
                      width: '8px',
                      height: '8px',
                      'border-radius': '2px',
                      background: item.color,
                      'margin-right': '6px',
                    }}
                  />
                  {item.segment.label}
                  {' '}
                  {formatSignedNumber(item.segment.value)}
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>
    </div>
  )
}

export default ExposureStack
