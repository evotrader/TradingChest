import { type Component, For, Show, createMemo } from 'solid-js'
import WidgetState from '../shared/WidgetState'
import {
  STATUS_TOKEN,
  formatSignedNumber,
  isReady,
  pnlColor,
  signOf,
  type PnlColorConvention,
  type WidgetViewState,
} from '../shared/types'

export interface DistributionBin {
  /** Stable identity returned by onPointSelect. */
  id: string
  /** Bucket label already formatted by the caller. */
  label: string
  /** Pre-bucketed count or mass; widget does not re-bin. */
  value: number
}

export interface DistributionChartProps {
  viewState: WidgetViewState
  bins: ReadonlyArray<DistributionBin>
  height?: number
  class?: string
  pnlColorConvention?: PnlColorConvention
  onPointSelect?: (bin: DistributionBin) => void
}

const WIDTH = 720
const DEFAULT_HEIGHT = 200
const PAD_X = 40
const PAD_Y = 28

/**
 * State-first distribution bars. Caller supplies pre-bucketed bins only.
 *
 * @example
 * <DistributionChart viewState={{ status: 'not_running', message: '未运行' }} bins={[]} />
 */
export const DistributionChart: Component<DistributionChartProps> = (props) => {
  const height = () => props.height ?? DEFAULT_HEIGHT
  const convention = () => props.pnlColorConvention ?? 'cn_market'
  const ready = () => isReady(props.viewState)

  const layout = createMemo(() => {
    const bins = props.bins
    const h = height()
    const usableW = WIDTH - PAD_X * 2
    const usableH = h - PAD_Y * 2
    const maxAbs = Math.max(...bins.map(b => Math.abs(b.value)), 1e-9)
    const gap = 4
    const barW = bins.length === 0 ? 0 : Math.max(4, (usableW - gap * (bins.length - 1)) / bins.length)
    return bins.map((bin, i) => {
      const mag = Math.abs(bin.value) / maxAbs
      const barH = mag * usableH
      const x = PAD_X + i * (barW + gap)
      const y = PAD_Y + (usableH - barH)
      return { bin, x, y, width: barW, height: barH }
    })
  })

  return (
    <div
      class={props.class}
      data-testid="distribution-chart"
      style={{
        border: `1px solid ${STATUS_TOKEN.border}`,
        'border-radius': '6px',
        background: STATUS_TOKEN.surface,
        padding: '12px',
        'min-height': `${height() + 24}px`,
      }}
    >
      <Show
        when={ready()}
        fallback={<WidgetState viewState={props.viewState} />}
      >
        <Show
          when={props.bins.length > 0}
          fallback={
            <div role="status" style={{ color: STATUS_TOKEN.muted, 'text-align': 'center', padding: '16px' }}>
              暂无数据
            </div>
          }
        >
          <svg
            role="img"
            aria-label="distribution chart"
            viewBox={`0 0 ${WIDTH} ${height()}`}
            width="100%"
            height={height()}
            preserveAspectRatio="none"
          >
            <For each={layout()}>
              {(bar) => (
                <g>
                  <rect
                    data-testid="distribution-bar"
                    data-bin-id={bar.bin.id}
                    x={bar.x}
                    y={bar.y}
                    width={bar.width}
                    height={bar.height}
                    fill={pnlColor(convention(), signOf(bar.bin.value))}
                    tabindex="0"
                    role="button"
                    aria-label={`${bar.bin.label}: ${formatSignedNumber(bar.bin.value)}`}
                    style={{ cursor: props.onPointSelect ? 'pointer' : 'default' }}
                    onClick={() => props.onPointSelect?.(bar.bin)}
                    onKeyDown={(e: KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        props.onPointSelect?.(bar.bin)
                      }
                    }}
                  />
                </g>
              )}
            </For>
          </svg>
        </Show>
      </Show>
    </div>
  )
}

export default DistributionChart
