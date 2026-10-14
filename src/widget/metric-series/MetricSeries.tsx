import { type Component, For, Show, createMemo } from 'solid-js'
import WidgetState from '../shared/WidgetState'
import {
  STATUS_TOKEN,
  isReady,
  type PnlColorConvention,
  type WidgetViewState,
  formatSignedNumber,
  pnlColor,
  signOf,
} from '../shared/types'

export interface MetricSeriesPoint {
  /** Stable identity returned by onPointSelect. */
  id: string
  /** Domain x key (ISO timestamp or ordered label) — layout only. */
  x: string
  /** Precomputed series value; widget does not derive it. */
  y: number
  label?: string
}

export interface MetricSeriesProps {
  viewState: WidgetViewState
  points: ReadonlyArray<MetricSeriesPoint>
  height?: number
  class?: string
  pnlColorConvention?: PnlColorConvention
  onPointSelect?: (point: MetricSeriesPoint) => void
}

const WIDTH = 720
const DEFAULT_HEIGHT = 200
const PAD_X = 40
const PAD_Y = 24

/**
 * State-first metric line chart. No marks before viewState.status === 'ready'.
 *
 * @example
 * <MetricSeries viewState={{ status: 'empty', message: '暂无数据' }} points={[]} />
 */
export const MetricSeries: Component<MetricSeriesProps> = (props) => {
  const height = () => props.height ?? DEFAULT_HEIGHT
  const convention = () => props.pnlColorConvention ?? 'cn_market'
  const ready = () => isReady(props.viewState)

  const layout = createMemo(() => {
    const pts = props.points
    const h = height()
    const usableW = WIDTH - PAD_X * 2
    const usableH = h - PAD_Y * 2
    if (pts.length === 0) {
      return { coords: [] as Array<{ point: MetricSeriesPoint, x: number, y: number }>, path: '' }
    }
    const ys = pts.map(p => p.y).filter(Number.isFinite)
    const minY = Math.min(...ys, 0)
    const maxY = Math.max(...ys, 0)
    const range = Math.max(maxY - minY, 1e-9)
    const xFor = (i: number) =>
      pts.length <= 1 ? PAD_X + usableW / 2 : PAD_X + (i / (pts.length - 1)) * usableW
    const yFor = (v: number) => PAD_Y + ((maxY - v) / range) * usableH
    const coords: Array<{ point: MetricSeriesPoint, x: number, y: number }> = []
    const commands: string[] = []
    let connected = false
    pts.forEach((point, i) => {
      if (!Number.isFinite(point.y)) {
        connected = false
        return
      }
      const x = xFor(i)
      const y = yFor(point.y)
      coords.push({ point, x, y })
      commands.push(`${connected ? 'L' : 'M'} ${x.toFixed(2)} ${y.toFixed(2)}`)
      connected = true
    })
    const path = commands.join(' ')
    return { coords, path }
  })

  return (
    <div
      class={props.class}
      data-testid="metric-series"
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
          when={layout().coords.length > 0}
          fallback={
            <div role="status" style={{ color: STATUS_TOKEN.muted, 'text-align': 'center', padding: '16px' }}>
              暂无数据
            </div>
          }
        >
          <svg
            role="img"
            aria-label="metric series"
            viewBox={`0 0 ${WIDTH} ${height()}`}
            width="100%"
            height={height()}
            preserveAspectRatio="none"
          >
            <rect
              x={PAD_X}
              y={PAD_Y}
              width={WIDTH - PAD_X * 2}
              height={height() - PAD_Y * 2}
              fill="#141C26"
              stroke={STATUS_TOKEN.border}
            />
            <path
              d={layout().path}
              fill="none"
              stroke={STATUS_TOKEN.focus}
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <For each={layout().coords}>
              {(c) => (
                <g>
                  <circle
                    data-testid="series-point"
                    data-point-id={c.point.id}
                    cx={c.x}
                    cy={c.y}
                    r="4"
                    fill={pnlColor(convention(), signOf(c.point.y))}
                    stroke={STATUS_TOKEN.focus}
                    stroke-width="1"
                    tabindex="0"
                    role="button"
                    aria-label={
                      c.point.label
                      ?? `${c.point.x}: ${formatSignedNumber(c.point.y)}`
                    }
                    style={{ cursor: props.onPointSelect ? 'pointer' : 'default' }}
                    onClick={() => props.onPointSelect?.(c.point)}
                    onKeyDown={(e: KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        props.onPointSelect?.(c.point)
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

export default MetricSeries
