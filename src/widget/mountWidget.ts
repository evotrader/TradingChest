import { createComponent, createSignal, type Component } from 'solid-js'
import { render } from 'solid-js/web'
import { MetricSeries, type MetricSeriesProps } from './metric-series/MetricSeries'
import { DistributionChart, type DistributionChartProps } from './distribution/DistributionChart'
import { ExposureStack, type ExposureStackProps } from './exposure-stack/ExposureStack'
import { ProfitCalendar } from './profit-calendar/ProfitCalendar'
import type { ProfitCalendarProps } from './profit-calendar/types'

export interface AnalyticalWidgetProps {
  MetricSeries: MetricSeriesProps
  DistributionChart: DistributionChartProps
  ExposureStack: ExposureStackProps
  ProfitCalendar: ProfitCalendarProps
}
export interface MountedWidget<P> {
  /** Replace the props snapshot, including callbacks, without remounting. */
  update: (props: P) => void
  /** Idempotent. Further updates are ignored. */
  dispose: () => void
}
const widgets = { MetricSeries, DistributionChart, ExposureStack, ProfitCalendar }

/** Mount with the widget bundle's own Solid runtime; safe for React/vanilla hosts. */
export function mountAnalyticalWidget<K extends keyof AnalyticalWidgetProps>(
  name: K,
  container: HTMLElement,
  initialProps: AnalyticalWidgetProps[K],
): MountedWidget<AnalyticalWidgetProps[K]> {
  let disposed = false
  let update: (props: AnalyticalWidgetProps[K]) => void = () => {}
  const unmount = render(() => {
    const [current, setCurrent] = createSignal(initialProps, { equals: false })
    update = props => { if (!disposed) setCurrent(() => props) }
    // Reads happen inside widget computations, so changed values AND handlers stay current.
    const reactiveProps = new Proxy({} as AnalyticalWidgetProps[K], {
      get: (_target, key) => Reflect.get(current(), key),
      has: (_target, key) => Reflect.has(current(), key),
      ownKeys: () => Reflect.ownKeys(current()),
      getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
    })
    return createComponent(widgets[name] as Component<AnalyticalWidgetProps[K]>, reactiveProps)
  }, container)
  return {
    update: props => update(props),
    dispose: () => { if (!disposed) { disposed = true; unmount() } },
  }
}
