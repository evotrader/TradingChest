// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, fireEvent } from '@solidjs/testing-library'
import ChartProComponent from '../../ChartProComponent'
import KLineChartPro from '../../KLineChartPro'
import type { ChartComponentApi as ChartPro } from '../../ChartProComponent'

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
    expect(host.price).toHaveBeenCalledWith(bars[1].close, bars[1].timestamp)
  })
  it('does not resume subscriptions after unmount during replay reload', async () => {
    const pending = deferred()
    const host = mount(vi.fn().mockResolvedValueOnce(bars).mockReturnValueOnce(pending.promise)); await tick()
    host.api.startReplay(2); host.api.stopReplay(); host.unmount()
    pending.resolve(bars); await tick()
    expect(host.feed.subscribe).toHaveBeenCalledTimes(1)
  })

  it('targets only selected owned drawings; Escape preserves completed and system overlays', async () => {
    const host = mount(); await tick()
    const overlays = new Map<string, any>([['alert', {}], ['order', {}]])
    host.chart.createOverlay.mockImplementation((options: any) => {
      overlays.set(options.id, { ...options, currentStep: 1, points: [] })
      return options.id
    })
    host.chart.getOverlayById.mockImplementation((id: string) => overlays.get(id))
    host.chart.removeOverlay.mockImplementation(({ id }: { id: string }) => {
      const overlay = overlays.get(id)
      overlays.delete(id)
      overlay?.onRemoved?.({ overlay })
    })
    for (const id of ['a', 'b', 'c']) {
      host.api.createDrawing({ name: 'rect', id })
      const overlay = overlays.get(id)
      overlay.currentStep = -1
      overlay.onDrawEnd({ overlay })
    }
    host.api.cancelDrawing()
    expect([...overlays.keys()]).toEqual(['alert', 'order', 'a', 'b', 'c'])
    overlays.get('b').onSelected({ overlay: overlays.get('b') })
    const widget = host.container.querySelector('.klinecharts-pro-widget')!
    const input = document.createElement('input')
    widget.appendChild(input)
    fireEvent.keyDown(input, { key: 'Delete' })
    expect(overlays.has('b')).toBe(true)
    fireEvent.keyDown(widget, { key: 'Delete' })
    expect([...overlays.keys()]).toEqual(['alert', 'order', 'a', 'c'])
    host.api.createDrawing({ name: 'rect', id: 'draft' })
    host.api.cancelDrawing()
    expect([...overlays.keys()]).toEqual(['alert', 'order', 'a', 'c'])
    expect(host.chart.removeOverlay.mock.calls.every(([arg]: any[]) => typeof arg?.id === 'string')).toBe(true)
  })

  it('keeps replay alerts separate, uses bar time, and re-seeds silently on seek', async () => {
    // Reuse the same mocked engine surface, but exercise the real outer chart class.
    const seed = mount(); await tick(); seed.unmount()
    const data = bars.map((bar, i) => ({...bar, close: [10, 11, 13, 14][i]}))
    mock.chart.getDataList = () => data
    const el = document.createElement('div')
    document.body.appendChild(el)
    const live = vi.fn(), replay = vi.fn()
    const chart = new KLineChartPro({container:el, symbol:{ticker:'TEST'},
      period:{multiplier:1,timespan:'minute',text:'1m'}, mainIndicators:[], subIndicators:[],
      datafeed:{searchSymbols:async()=>[],getHistoryKLineData:async()=>data,subscribe:vi.fn(),unsubscribe:vi.fn()},
      onAlertTrigger:live,onReplayAlertTrigger:replay,
    })
    try {
      await tick()
      chart.addAlert({id:'a',price:12,condition:'above'})
      chart.startReplay(2)
      chart.feedPrice(100)
      expect(live).not.toHaveBeenCalled()
      chart.getReplayEngine()!.stepForward()
      expect(replay).toHaveBeenCalledTimes(1)
      expect(replay.mock.calls[0][0]).toMatchObject({mode:'replay',timestamp:data[2].timestamp,triggerPrice:13})
      expect(chart.getAlerts()[0].triggered).toBe(false)
      chart.getReplayEngine()!.stepBackward()
      expect(replay).toHaveBeenCalledTimes(1)
      chart.getReplayEngine()!.stepForward()
      expect(replay).toHaveBeenCalledTimes(2)
      expect(live).not.toHaveBeenCalled()
    } finally { chart.dispose(); el.remove() }
  })

  it('clears the initial loading mask when the engine immediately asks for older bars', async () => {
    const pending = deferred()
    const host = mount(vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue([]))
    host.chart.applyNewData.mockImplementationOnce(() => mock.loadMore(bars[0].timestamp))
    pending.resolve(bars); await tick(); await tick()
    expect(host.container.querySelector('.klinecharts-pro-loading')).toBeNull()
    expect(host.feed.subscribe).toHaveBeenCalledTimes(1)
  })

  it('scopes alerts by symbol and exchange and preserves state when returning', async () => {
    const seed = mount(); await tick(); seed.unmount()
    const el = document.createElement('div'); document.body.appendChild(el)
    const live = vi.fn()
    const chart = new KLineChartPro({container:el, symbol:{ticker:'SAME',exchange:'A'},
      period:{multiplier:1,timespan:'minute',text:'1m'}, mainIndicators:[],subIndicators:[],
      datafeed:{searchSymbols:async()=>[],getHistoryKLineData:async()=>bars,subscribe:vi.fn(),unsubscribe:vi.fn()},
      onAlertTrigger:live})
    try {
      await tick()
      chart.addAlert({id:'same-id',price:12,condition:'above'})
      chart.feedPrice(10); chart.feedPrice(13)
      expect(live).toHaveBeenCalledTimes(1)
      chart.setSymbol({ticker:'SAME',exchange:'B'}); await tick()
      expect(chart.getAlerts()).toEqual([])
      chart.feedPrice(10); chart.feedPrice(13)
      expect(live).toHaveBeenCalledTimes(1)
      chart.addAlert({id:'same-id',price:20,condition:'above'})
      chart.setSymbol({ticker:'SAME',exchange:'A'}); await tick()
      expect(chart.getAlerts()).toEqual([expect.objectContaining({id:'same-id',price:12,triggered:true})])
      chart.feedPrice(10); chart.feedPrice(13)
      expect(live).toHaveBeenCalledTimes(1)
      chart.setSymbol({ticker:'SAME',exchange:'B'}); await tick()
      expect(chart.getAlerts()[0].price).toBe(20)
      chart.feedPrice(19); chart.feedPrice(21)
      expect(live).toHaveBeenCalledTimes(2)
    } finally { chart.dispose(); el.remove() }
  })

})
