// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@solidjs/testing-library'
import ChartProComponent from '../../ChartProComponent'
import type { ChartPro } from '../../types'

const mock = vi.hoisted(() => ({ chart: null as any, loadMore: null as any }))
vi.mock('klinecharts', async importOriginal => {
  const actual = await importOriginal<any>()
  return { ...actual, init: () => mock.chart, dispose: vi.fn() }
})
vi.mock('../../widget', () => Object.fromEntries([
  'PeriodBar', 'DrawingBar', 'IndicatorModal', 'TimezoneModal', 'SettingModal',
  'ScreenshotModal', 'IndicatorSettingModal', 'SymbolSearchModal', 'OverlayPropertyBar', 'ReplayControlBar',
].map(name => [name, () => null])))
const bars = Array.from({ length: 4 }, (_, i) => ({ timestamp: (i + 1) * 60000, open: 10, high: 12, low: 9, close: 11, volume: 2 }))
const tick = async () => { for (let i = 0; i < 5; i++) await Promise.resolve() }
function deferred() {
  let resolve!: (value: typeof bars) => void
  const promise = new Promise<typeof bars>(r => { resolve = r })
  return { promise, resolve }
}
function mount(history = vi.fn().mockResolvedValue(bars)) {
  mock.chart = new Proxy({
    getStyles: () => ({}), getDataList: () => bars, getDom: () => null,
    loadMore: (fn: any) => { mock.loadMore = fn },
  } as any, { get(target, key) { return target[key] ?? (target[key] = vi.fn()) } })
  let api!: ChartPro
  const feed = { getHistoryKLineData: history, subscribe: vi.fn(), unsubscribe: vi.fn(), searchSymbols: vi.fn() }
  const price = vi.fn()
  const result = render(() => <ChartProComponent {...{
    ref: (value: ChartPro) => { api = value }, symbol: { ticker: 'TEST' },
    period: { multiplier: 1, timespan: 'minute', text: '1m' }, periods: [],
    theme: 'light', locale: 'en-US', timezone: 'Etc/UTC', styles: {}, watermark: '',
    drawingBarVisible: false, mainIndicators: [], subIndicators: [], datafeed: feed,
    onPriceUpdate: price,
  } as any} />)
  return { ...result, api, feed, price, chart: mock.chart }
}
afterEach(cleanup)
describe('chart lifecycle isolation', () => {
  it('does not subscribe after a pending initial history resolves following unmount', async () => {
    const pending = deferred()
    const host = mount(vi.fn().mockReturnValue(pending.promise))
    host.unmount(); pending.resolve(bars); await tick()
    expect(host.feed.subscribe).not.toHaveBeenCalled()
    expect(host.chart.applyNewData).not.toHaveBeenCalled()
  })
  it('ignores queued live ticks after unmount', async () => {
    const host = mount(); await tick()
    const callback = host.feed.subscribe.mock.calls[0][2]
    host.unmount(); callback(bars[0])
    expect(host.chart.updateData).not.toHaveBeenCalled()
    expect(host.price).not.toHaveBeenCalled()
  })
  it('ignores queued live ticks and pending load-more while replaying', async () => {
    const pending = deferred()
    const host = mount(vi.fn().mockResolvedValueOnce(bars).mockReturnValueOnce(pending.promise)); await tick()
    const callback = host.feed.subscribe.mock.calls[0][2]
    mock.loadMore(bars[0].timestamp)
    host.api.startReplay(2); host.chart.updateData.mockClear()
    callback(bars[3]); pending.resolve(bars); await tick()
    expect(host.chart.updateData).not.toHaveBeenCalled()
    expect(host.chart.applyMoreData).not.toHaveBeenCalled()
    expect(host.price).not.toHaveBeenCalled()
  })
  it('keeps current live ticks valid during ordinary load-more', async () => {
    const host = mount(); await tick()
    const callback = host.feed.subscribe.mock.calls[0][2]
    mock.loadMore(bars[0].timestamp); await tick(); callback(bars[0])
    expect(host.chart.updateData).toHaveBeenCalledWith(bars[0])
  })
  it('ignores old symbol callbacks after switching symbols', async () => {
    const host = mount(); await tick()
    const callback = host.feed.subscribe.mock.calls[0][2]
    host.api.setSymbol({ ticker: 'OTHER' } as any); await tick()
    callback(bars[0])
    expect(host.price).not.toHaveBeenCalled()
    host.feed.subscribe.mock.calls.at(-1)![2](bars[1])
    expect(host.price).toHaveBeenCalledWith(bars[1].close)
  })
  it('does not resume subscriptions after unmount during replay reload', async () => {
    const pending = deferred()
    const host = mount(vi.fn().mockResolvedValueOnce(bars).mockReturnValueOnce(pending.promise)); await tick()
    host.api.startReplay(2); host.api.stopReplay(); host.unmount()
    pending.resolve(bars); await tick()
    expect(host.feed.subscribe).toHaveBeenCalledTimes(1)
  })

})
