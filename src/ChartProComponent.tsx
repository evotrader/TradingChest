/**
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at

 * http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { createSignal, createEffect, onMount, Show, onCleanup, startTransition, Component, ErrorBoundary } from 'solid-js'

import {
  init, dispose, utils, Nullable, Chart, OverlayMode, Styles,
  TooltipIconPosition, ActionType, PaneOptions, Indicator, DomPosition, FormatDateType,
  type Overlay
} from 'klinecharts'

import { deepSet } from './core/deepSet'

import { SelectDataSourceItem, Loading } from './component'

import {
  PeriodBar, DrawingBar, IndicatorModal, TimezoneModal, SettingModal,
  ScreenshotModal, IndicatorSettingModal, SymbolSearchModal, OverlayPropertyBar,
  ReplayControlBar
} from './widget'
import { ReplayEngine } from './replay/ReplayEngine'
import type { ReplayState, ReplaySpeed } from './replay/types'

import { translateTimezone } from './widget/timezone-modal/data'

import { SymbolInfo, Period, ChartProOptions, ChartPro } from './types'
import { indicatorRegistry } from './indicator'
import { adjustFromTo } from './core/adjustFromTo'
import { buildStyles } from './core/buildStyles'
import type { OverlayLifecycleEvent, OverlayLifecycleSource } from './types'

export interface ChartProComponentProps extends Required<Omit<ChartProOptions, 'container' | 'onAlertTrigger' | 'onError'>> {
  ref: (chart: ChartPro) => void
  /** 内部回调：实时数据到达时通知外层（用于报警检测） */
  onPriceUpdate?: (price: number) => void
  /** 内部回调：品种/周期切换时通知外层（用于重置报警状态等） */
  onDataReset?: () => void
  /** 内部错误回调 */
  onError?: (error: { type: string, message: string, raw?: unknown }) => void
}

interface PrevSymbolPeriod {
  symbol: SymbolInfo
  period: Period
}

async function createIndicator (widget: Nullable<Chart>, indicatorName: string, isStack?: boolean, paneOptions?: PaneOptions): Promise<Nullable<string>> {
  await indicatorRegistry.ensureRegistered(indicatorName)
  if (indicatorName === 'VOL') {
    paneOptions = { gap: { bottom: 2 }, ...paneOptions }
  }
  return widget?.createIndicator({
    name: indicatorName,
    createTooltipDataSource: ({ indicator, defaultStyles }: any) => {
      const icons = []
      if (indicator.visible) {
        icons.push(defaultStyles.tooltip.icons[1])
        icons.push(defaultStyles.tooltip.icons[2])
        icons.push(defaultStyles.tooltip.icons[3])
      } else {
        icons.push(defaultStyles.tooltip.icons[0])
        icons.push(defaultStyles.tooltip.icons[2])
        icons.push(defaultStyles.tooltip.icons[3])
      }
      return { icons }
    }
  } as any, isStack, paneOptions) ?? null
}

function snapshotOverlay (overlay: Overlay): OverlayLifecycleEvent['overlay'] {
  return {
    id: overlay.id,
    groupId: overlay.groupId,
    name: overlay.name,
    points: (overlay.points ?? []).map(point => ({ ...point })),
    extendData: overlay.extendData,
    styles: overlay.styles,
    lock: overlay.lock,
    visible: overlay.visible
  }
}

const ChartProComponent: Component<ChartProComponentProps> = props => {
  let widgetRef: HTMLDivElement | undefined = undefined
  let widget: Nullable<Chart> = null

  let priceUnitDom: HTMLElement

  const [loading, setLoading] = createSignal(false)
  let fetchSeq = 0  // 单调递增的请求序号，用于丢弃过期响应

  const [theme, setTheme] = createSignal(props.theme)
  const [styles, setStyles] = createSignal(props.styles)
  const [locale, setLocale] = createSignal(props.locale)

  const [symbol, setSymbol] = createSignal(props.symbol)
  const [period, setPeriod] = createSignal(props.period)
  const [indicatorModalVisible, setIndicatorModalVisible] = createSignal(false)
  const [mainIndicators, setMainIndicators] = createSignal([...(props.mainIndicators!)])
  const [subIndicators, setSubIndicators] = createSignal({})

  const [timezoneModalVisible, setTimezoneModalVisible] = createSignal(false)
  const [timezone, setTimezone] = createSignal<SelectDataSourceItem>({ key: props.timezone, text: translateTimezone(props.timezone, props.locale) })

  const [settingModalVisible, setSettingModalVisible] = createSignal(false)
  const [widgetDefaultStyles, setWidgetDefaultStyles] = createSignal<Styles>()

  const [screenshotUrl, setScreenshotUrl] = createSignal('')

  const [drawingBarVisible, setDrawingBarVisible] = createSignal(props.drawingBarVisible)

  const [symbolSearchModalVisible, setSymbolSearchModalVisible] = createSignal(false)

  const [loadingVisible, setLoadingVisible] = createSignal(false)

  const [indicatorSettingModalParams, setIndicatorSettingModalParams] = createSignal({
    visible: false, indicatorName: '', paneId: '', calcParams: [] as Array<any>
  })

  // 绘图 overlay 选中状态（浮动属性工具栏）
  const [selectedOverlay, setSelectedOverlay] = createSignal<{
    id: string, x: number, y: number,
    color: string, fillColor?: string, lineWidth: number, lineStyle: string, locked: boolean
  } | null>(null)

  const notifyOverlay = (source: OverlayLifecycleSource, overlay: Overlay, kind: 'create' | 'update' | 'delete') => {
    const event = { overlay: snapshotOverlay(overlay), source }
    if (kind === 'create') {
      props.onOverlayCreate?.(event)
    } else if (kind === 'update') {
      props.onOverlayUpdate?.(event)
    } else {
      props.onOverlayDelete?.(event)
    }
  }

  const promptTextOverlay = (overlay: Overlay) => {
    if (overlay.name !== 'textAnnotation' && overlay.name !== 'note') return
    const fallback = overlay.name === 'note' ? 'Note' : 'Text'
    const current = typeof overlay.extendData === 'string' && overlay.extendData.trim().length > 0
      ? overlay.extendData
      : fallback
    const label = overlay.name === 'note'
      ? '输入便签内容 / Enter note:'
      : '输入标注文字 / Enter text:'
    const input = window.prompt(label, current)
    if (input !== null && input.trim() !== '') {
      overlay.extendData = input.trim()
    }
  }

  const markSelectedOverlay = (overlay: Overlay) => {
    if (overlay.id) {
      const points = overlay.points ?? []
      let x = 0, y = 0
      if (points.length > 0 && widget) {
        const pixel = widget.convertToPixel(
          { timestamp: points[0].timestamp, value: points[0].value },
          { paneId: 'candle_pane' }
        ) as any
        x = (pixel?.x ?? 200) + 52
        y = (pixel?.y ?? 100) - 50
      }
      const fillOverlays = [
        'rect', 'circle', 'triangle', 'parallelogram',
        'gannBox', 'regressionChannel', 'xabcd',
        'positionRange', 'longPosition', 'shortPosition',
        'dateAndPriceRange', 'dateRange', 'priceRange',
        'fibonacciCircle',
      ]
      const hasFill = fillOverlays.includes(overlay.name ?? '')
      setSelectedOverlay({
        id: overlay.id,
        x: Math.max(100, x),
        y: Math.max(10, y),
        color: '#1677ff',
        fillColor: hasFill ? 'rgba(22, 119, 255, 0.15)' : undefined,
        lineWidth: 1,
        lineStyle: 'solid',
        locked: overlay.lock ?? false
      })
    }
  }

  const notifySelectedOverlayUpdate = (source: OverlayLifecycleSource, overlayId: string) => {
    const overlay = widget?.getOverlayById(overlayId)
    if (overlay) {
      notifyOverlay(source, overlay, 'update')
    }
  }

  // 回放状态
  const defaultReplayState: ReplayState = { active: false, playing: false, speed: 1, position: 0, totalBars: 0 }
  const [replayState, setReplayState] = createSignal<ReplayState>(defaultReplayState)
  let replayEngine: ReplayEngine | null = null

  const startReplay = (startPosition?: number) => {
    if (replayEngine || !widget) return
    const dataList = widget.getDataList()
    if (dataList.length === 0) return
    // 暂停实时数据订阅，防止实时数据污染回放时间线
    props.datafeed.unsubscribe(symbol(), period())
    const pos = startPosition ?? Math.floor(dataList.length * 0.5)
    replayEngine = new ReplayEngine({
      onDataChange: (data) => { widget?.applyNewData(data, data.length > 0) },
      onBarUpdate: (bar) => { widget?.updateData(bar) },
      onStateChange: (state) => { setReplayState(state) },
    })
    replayEngine.start(dataList, pos)
  }

  const stopReplay = () => {
    if (replayEngine) {
      replayEngine.stop()
      replayEngine.dispose()
      replayEngine = null
      setReplayState(defaultReplayState)
      // 重新加载原始数据并恢复实时订阅（受 fetchSeq 保护，防止与品种切换竞态）
      const s = symbol()
      const p = period()
      const seq = ++fetchSeq
      const get = async () => {
        const [from, to] = adjustFromTo(p, new Date().getTime(), 500)
        const kLineDataList = await props.datafeed.getHistoryKLineData(s, p, from, to)
        if (seq !== fetchSeq) return  // 品种/周期已切换，丢弃过期响应
        widget?.applyNewData(kLineDataList, kLineDataList.length > 0)
        // 恢复实时数据订阅
        props.datafeed.subscribe(s, p, data => {
          widget?.updateData(data)
          props.onPriceUpdate?.(data.close)
        })
      }
      get().catch(e => { props.onError?.({ type: 'replay-reload', message: 'replay data reload failed', raw: e }) })
    }
  }

  props.ref({
    setTheme,
    getTheme: () => theme(),
    setStyles,
    getStyles: () => widget?.getStyles() ?? {} as Styles,
    setLocale,
    getLocale: () => locale(),
    setTimezone: (tz: string) => { setTimezone({ key: tz, text: translateTimezone(tz, locale()) }) },
    getTimezone: () => timezone().key,
    setSymbol: (s: SymbolInfo) => { if (!replayEngine) setSymbol(s) },
    getSymbol: () => symbol(),
    setPeriod: (p: Period) => { if (!replayEngine) setPeriod(p) },
    getPeriod: () => period(),
    getChart: () => widget,
    // 以下方法由 KLineChartPro 直接实现，不经过 _chartApi 代理
    // 如果有人绕过 KLineChartPro 直接调用组件 ref，给出明确错误
    exportCSV: () => { throw new Error('[TradingChest] exportCSV must be called on KLineChartPro instance') },
    exportAllCSV: () => { throw new Error('[TradingChest] exportAllCSV must be called on KLineChartPro instance') },
    exportScreenshot: () => { throw new Error('[TradingChest] exportScreenshot must be called on KLineChartPro instance') },
    getShortcutManager: () => { throw new Error('[TradingChest] getShortcutManager must be called on KLineChartPro instance') },
    addAlert: () => { throw new Error('[TradingChest] addAlert must be called on KLineChartPro instance') },
    updateAlert: () => { throw new Error('[TradingChest] updateAlert must be called on KLineChartPro instance') },
    removeAlert: () => { throw new Error('[TradingChest] removeAlert must be called on KLineChartPro instance') },
    getAlerts: () => { throw new Error('[TradingChest] getAlerts must be called on KLineChartPro instance') },
    addComparison: async () => { throw new Error('[TradingChest] addComparison must be called on KLineChartPro instance') },
    removeComparison: () => { throw new Error('[TradingChest] removeComparison must be called on KLineChartPro instance') },
    startReplay: (pos?: number) => { startReplay(pos) },
    stopReplay: () => { stopReplay() },
    getReplayEngine: () => replayEngine,
    createTradeVisualization: () => { throw new Error('[TradingChest] createTradeVisualization must be called on KLineChartPro instance') },
    feedPrice: () => { throw new Error('[TradingChest] feedPrice must be called on KLineChartPro instance') },
    dispose: () => { throw new Error('[TradingChest] dispose must be called on KLineChartPro instance') },
  })

  const documentResize = () => {
    widget?.resize()
  }

  // Backspace/Delete 删除选中的绘图
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Backspace' || e.key === 'Delete') {
      const info = selectedOverlay()
      if (info && widget) {
        widget.removeOverlay({ id: info.id })
        setSelectedOverlay(null)
        e.preventDefault()
      }
    }
    if (e.key === 'Escape') {
      setSelectedOverlay(null)
    }
  }

  onMount(() => {
    window.addEventListener('resize', documentResize)
    // 绑定到 container 而非 window，避免图表外的按键误触发
    widgetRef!.addEventListener('keydown', handleKeyDown)
    widget = init(widgetRef!, {
      customApi: {
        formatDate: (dateTimeFormat: Intl.DateTimeFormat, timestamp, format: string, type: FormatDateType) => {
          const p = period()
          switch (p.timespan) {
            case 'minute': {
              if (type === FormatDateType.XAxis) {
                return utils.formatDate(dateTimeFormat, timestamp, 'HH:mm')
              }
              return utils.formatDate(dateTimeFormat, timestamp, 'YYYY-MM-DD HH:mm')
            }
            case 'hour': {
              if (type === FormatDateType.XAxis) {
                return utils.formatDate(dateTimeFormat, timestamp, 'MM-DD HH:mm')
              }
              return utils.formatDate(dateTimeFormat, timestamp, 'YYYY-MM-DD HH:mm')
            }
            case 'day':
            case 'week': return utils.formatDate(dateTimeFormat, timestamp, 'YYYY-MM-DD')
            case 'month': {
              if (type === FormatDateType.XAxis) {
                return utils.formatDate(dateTimeFormat, timestamp, 'YYYY-MM')
              }
              return utils.formatDate(dateTimeFormat, timestamp, 'YYYY-MM-DD')
            }
            case 'year': {
              if (type === FormatDateType.XAxis) {
                return utils.formatDate(dateTimeFormat, timestamp, 'YYYY')
              }
              return utils.formatDate(dateTimeFormat, timestamp, 'YYYY-MM-DD')
            }
          }
          return utils.formatDate(dateTimeFormat, timestamp, 'YYYY-MM-DD HH:mm')
        }
      }
    })

    if (widget) {
      const watermarkContainer = widget.getDom('candle_pane', DomPosition.Main)
      if (watermarkContainer) {
        let watermark = document.createElement('div')
        watermark.className = 'klinecharts-pro-watermark'
        if (utils.isString(props.watermark)) {
          const str = (props.watermark as string).replace(/(^\s*)|(\s*$)/g, '')
          watermark.textContent = str
        } else {
          watermark.appendChild(props.watermark as Node)
        }
        watermarkContainer.appendChild(watermark)
      }

      const priceUnitContainer = widget.getDom('candle_pane', DomPosition.YAxis)
      priceUnitDom = document.createElement('span')
      priceUnitDom.className = 'klinecharts-pro-price-unit'
      priceUnitContainer?.appendChild(priceUnitDom)
    }

    // Capture default styles once for "restore defaults" in settings modal
    setWidgetDefaultStyles(structuredClone(widget!.getStyles()))

    ;(async () => {
      for (const indicator of mainIndicators()) {
        await createIndicator(widget, indicator, true, { id: 'candle_pane' })
      }
      const subIndicatorMap: Record<string, string> = {}
      for (const indicator of props.subIndicators!) {
        const paneId = await createIndicator(widget, indicator, true)
        if (paneId) {
          subIndicatorMap[indicator] = paneId
        }
      }
      setSubIndicators(subIndicatorMap)
    })().catch(e => { props.onError?.({ type: 'indicator-init', message: 'indicator init failed', raw: e }) })
    widget?.loadMore(timestamp => {
      if (replayEngine) return  // 回放模式下不从 datafeed 拉取数据
      const seq = ++fetchSeq  // 复用 fetchSeq 防止 loadMore 与主加载/品种切换竞态
      setLoading(true)
      const get = async () => {
        const p = period()
        const [to] = adjustFromTo(p, timestamp!, 1)
        const [from] = adjustFromTo(p, to, 500)
        const kLineDataList = await props.datafeed.getHistoryKLineData(symbol(), p, from, to)
        if (seq !== fetchSeq) return
        widget?.applyMoreData(kLineDataList, kLineDataList.length > 0)
      }
      get().catch(e => { props.onError?.({ type: 'load-more', message: 'loadMore failed', raw: e }) }).finally(() => { if (seq === fetchSeq) setLoading(false) })
    })
    widget?.subscribeAction(ActionType.OnTooltipIconClick, (data) => {
      if (data.indicatorName) {
        switch (data.iconId) {
          case 'visible': {
            widget?.overrideIndicator({ name: data.indicatorName, visible: true }, data.paneId)
            break
          }
          case 'invisible': {
            widget?.overrideIndicator({ name: data.indicatorName, visible: false }, data.paneId)
            break
          }
          case 'setting': {
            const indicator = widget?.getIndicatorByPaneId(data.paneId, data.indicatorName) as Indicator
            setIndicatorSettingModalParams({
              visible: true, indicatorName: data.indicatorName, paneId: data.paneId, calcParams: indicator.calcParams
            })
            break
          }
          case 'close': {
            if (data.paneId === 'candle_pane') {
              const newMainIndicators = [...mainIndicators()]
              widget?.removeIndicator('candle_pane', data.indicatorName)
              newMainIndicators.splice(newMainIndicators.indexOf(data.indicatorName), 1)
              setMainIndicators(newMainIndicators)
            } else {
              const newIndicators: Record<string, string> = { ...subIndicators() }
              widget?.removeIndicator(data.paneId, data.indicatorName)
              delete newIndicators[data.indicatorName]
              setSubIndicators(newIndicators)
            }
          }
        }
      }
    })
    // 点击蜡烛区域时清除 overlay 选中状态
    widget?.subscribeAction(ActionType.OnCandleBarClick, () => {
      setSelectedOverlay(null)
    })

  })

  onCleanup(() => {
    window.removeEventListener('resize', documentResize)
    widgetRef!.removeEventListener('keydown', handleKeyDown)
    // 取消实时数据订阅，防止组件卸载后幽灵回调
    props.datafeed.unsubscribe(symbol(), period())
    if (replayEngine) {
      replayEngine.stop()
      replayEngine.dispose()
      replayEngine = null
    }
    dispose(widgetRef!)
  })

  createEffect(() => {
    const s = symbol()
    if (priceUnitDom) {
      if (s?.priceCurrency) {
        priceUnitDom.textContent = s?.priceCurrency.toLocaleUpperCase()
        priceUnitDom.style.display = 'flex'
      } else {
        priceUnitDom.style.display = 'none'
      }
    }
    widget?.setPriceVolumePrecision(s?.pricePrecision ?? 2, s?.volumePrecision ?? 0)
  })

  createEffect((prev?: PrevSymbolPeriod) => {
    if (prev) {
      props.datafeed.unsubscribe(prev.symbol, prev.period)
    }
    const s = symbol()
    const p = period()
    // 品种/周期切换，通知外层重置状态（如报警 prevPrice）
    if (prev) {
      props.onDataReset?.()
    }
    const seq = ++fetchSeq  // 捕获当前序号
    setLoading(true)
    setLoadingVisible(true)
    const get = async () => {
      const [from, to] = adjustFromTo(p, new Date().getTime(), 500)
      const kLineDataList = await props.datafeed.getHistoryKLineData(s, p, from, to)
      // 如果在等待期间又发起了新请求，丢弃当前过期响应
      if (seq !== fetchSeq) return
      widget?.applyNewData(kLineDataList, kLineDataList.length > 0)
      props.datafeed.subscribe(s, p, data => {
        widget?.updateData(data)
        props.onPriceUpdate?.(data.close)
      })
    }
    get()
      .catch(e => { props.onError?.({ type: 'data-fetch', message: 'data fetch failed', raw: e }) })
      .finally(() => { if (seq === fetchSeq) { setLoading(false); setLoadingVisible(false) } })
    return { symbol: s, period: p }
  })

  createEffect(() => {
    const t = theme()
    widget?.setStyles(t)
    const color = t === 'dark' ? '#929AA5' : '#76808F'
    widget?.setStyles({
      indicator: {
        tooltip: {
          icons: [
            {
              id: 'visible',
              position: TooltipIconPosition.Middle,
              marginLeft: 8,
              marginTop: 7,
              marginRight: 0,
              marginBottom: 0,
              paddingLeft: 0,
              paddingTop: 0,
              paddingRight: 0,
              paddingBottom: 0,
              icon: '\ue903',
              fontFamily: 'icomoon',
              size: 14,
              color: color,
              activeColor: color,
              backgroundColor: 'transparent',
              activeBackgroundColor: 'rgba(22, 119, 255, 0.15)'
            },
            {
              id: 'invisible',
              position: TooltipIconPosition.Middle,
              marginLeft: 8,
              marginTop: 7,
              marginRight: 0,
              marginBottom: 0,
              paddingLeft: 0,
              paddingTop: 0,
              paddingRight: 0,
              paddingBottom: 0,
              icon: '\ue901',
              fontFamily: 'icomoon',
              size: 14,
              color: color,
              activeColor: color,
              backgroundColor: 'transparent',
              activeBackgroundColor: 'rgba(22, 119, 255, 0.15)'
            },
            {
              id: 'setting',
              position: TooltipIconPosition.Middle,
              marginLeft: 6,
              marginTop: 7,
              marginBottom: 0,
              marginRight: 0,
              paddingLeft: 0,
              paddingTop: 0,
              paddingRight: 0,
              paddingBottom: 0,
              icon: '\ue902',
              fontFamily: 'icomoon',
              size: 14,
              color: color,
              activeColor: color,
              backgroundColor: 'transparent',
              activeBackgroundColor: 'rgba(22, 119, 255, 0.15)'
            },
            {
              id: 'close',
              position: TooltipIconPosition.Middle,
              marginLeft: 6,
              marginTop: 7,
              marginRight: 0,
              marginBottom: 0,
              paddingLeft: 0,
              paddingTop: 0,
              paddingRight: 0,
              paddingBottom: 0,
              icon: '\ue900',
              fontFamily: 'icomoon',
              size: 14,
              color: color,
              activeColor: color,
              backgroundColor: 'transparent',
              activeBackgroundColor: 'rgba(22, 119, 255, 0.15)'
            }
          ]
        }
      }
    })
  })

  createEffect(() => {
    widget?.setLocale(locale())
  })

  createEffect(() => {
    widget?.setTimezone(timezone().key)
  })

  createEffect(() => {
    if (styles()) {
      widget?.setStyles(styles())
    }
  })

  return (
    <ErrorBoundary fallback={(err) => (
      <div style={{ padding: '20px', color: 'red', 'font-family': 'monospace' }}>
        [TradingChest] Render error: {err?.message ?? String(err)}
      </div>
    )}>
      <i class="icon-close klinecharts-pro-load-icon"/>
      <Show when={symbolSearchModalVisible()}>
        <SymbolSearchModal
          locale={props.locale}
          datafeed={props.datafeed}
          onSymbolSelected={symbol => { setSymbol(symbol) }}
          onClose={() => { setSymbolSearchModalVisible(false) }}/>
      </Show>
      <Show when={indicatorModalVisible()}>
        <IndicatorModal
          locale={props.locale}
          mainIndicators={mainIndicators()}
          subIndicators={subIndicators()}
          onClose={() => { setIndicatorModalVisible(false) }}
          onMainIndicatorChange={async data => {
            const newMainIndicators = [...mainIndicators()]
            if (data.added) {
              await createIndicator(widget, data.name, true, { id: 'candle_pane' })
              newMainIndicators.push(data.name)
            } else {
              widget?.removeIndicator('candle_pane', data.name)
              newMainIndicators.splice(newMainIndicators.indexOf(data.name), 1)
            }
            setMainIndicators(newMainIndicators)
          }}
          onSubIndicatorChange={async data => {
            const newSubIndicators: Record<string, string> = { ...subIndicators() }
            if (data.added) {
              const paneId = await createIndicator(widget, data.name)
              if (paneId) {
                newSubIndicators[data.name] = paneId
              }
            } else {
              if (data.paneId) {
                widget?.removeIndicator(data.paneId, data.name)
                delete newSubIndicators[data.name]
              }
            }
            setSubIndicators(newSubIndicators)
          }}/>
      </Show>
      <Show when={timezoneModalVisible()}>
        <TimezoneModal
          locale={props.locale}
          timezone={timezone()}
          onClose={() => { setTimezoneModalVisible(false) }}
          onConfirm={setTimezone}
        />
      </Show>
      <Show when={settingModalVisible()}>
        <SettingModal
          locale={props.locale}
          currentStyles={utils.clone(widget!.getStyles())}
          onClose={() => { setSettingModalVisible(false) }}
          onChange={style => {
            widget?.setStyles(style)
          }}
          onRestoreDefault={(options: SelectDataSourceItem[]) => {
            const style = {}
            options.forEach(option => {
              const key = option.key
              deepSet(style, key, utils.formatValue(widgetDefaultStyles(), key))
            })
            widget?.setStyles(style)
          }}
        />
      </Show>
      <Show when={screenshotUrl().length > 0}>
        <ScreenshotModal
          locale={props.locale}
          url={screenshotUrl()}
          onClose={() => { setScreenshotUrl('') }}
        />
      </Show>
      <Show when={indicatorSettingModalParams().visible}>
        <IndicatorSettingModal
          locale={props.locale}
          params={indicatorSettingModalParams()}
          onClose={() => { setIndicatorSettingModalParams({ visible: false, indicatorName: '', paneId: '', calcParams: [] }) }}
          onConfirm={(params)=> {
            const modalParams = indicatorSettingModalParams()
            widget?.overrideIndicator({ name: modalParams.indicatorName, calcParams: params }, modalParams.paneId)
          }}
        />
      </Show>
      <PeriodBar
        locale={props.locale}
        symbol={symbol()}
        spread={drawingBarVisible()}
        period={period()}
        periods={props.periods}
        onMenuClick={async () => {
          try {
            await startTransition(() => setDrawingBarVisible(!drawingBarVisible()))
            widget?.resize()
          } catch (e) { console.warn('[TradingChest] toggle drawing bar failed:', e) }
        }}
        onSymbolClick={() => { setSymbolSearchModalVisible(!symbolSearchModalVisible()) }}
        onPeriodChange={setPeriod}
        onIndicatorClick={() => { setIndicatorModalVisible((visible => !visible)) }}
        onTimezoneClick={() => { setTimezoneModalVisible((visible => !visible)) }}
        onSettingClick={() => { setSettingModalVisible((visible => !visible)) }}
        onScreenshotClick={() => {
          if (widget) {
            const url = widget.getConvertPictureUrl(true, 'jpeg', props.theme === 'dark' ? '#151517' : '#ffffff')
            setScreenshotUrl(url)
          }
        }}
        replayActive={replayState().active}
        onReplayClick={() => {
          if (replayState().active) {
            stopReplay()
          } else {
            startReplay()
          }
        }}
      />
      <div
        class="klinecharts-pro-content">
        <Show when={loadingVisible()}>
          <Loading/>
        </Show>
        <Show when={drawingBarVisible()}>
          <DrawingBar
            locale={props.locale}
            onDrawingItemClick={overlay => {
              widget?.createOverlay({
                ...overlay,
                onDrawEnd: (event) => {
                  promptTextOverlay(event.overlay)
                  notifyOverlay('drawing-bar', event.overlay, 'create')
                  return true
                },
                onPressedMoveEnd: (event) => {
                  notifyOverlay('drawing-bar', event.overlay, 'update')
                  return true
                },
                onSelected: (event) => {
                  markSelectedOverlay(event.overlay)
                  return true
                },
                onDeselected: () => {
                  setSelectedOverlay(null)
                  return true
                },
                onRemoved: (event) => {
                  notifyOverlay('drawing-bar', event.overlay, 'delete')
                  setSelectedOverlay(null)
                  return true
                }
              })
            }}
            onModeChange={mode => { widget?.overrideOverlay({ mode: mode as OverlayMode }) }}
            onLockChange={lock => { widget?.overrideOverlay({ lock }) }}
            onVisibleChange={visible => { widget?.overrideOverlay({ visible }) }}
            onRemoveClick={(groupId) => { widget?.removeOverlay({ groupId }) }}/>
        </Show>
        <div
          ref={widgetRef}
          class='klinecharts-pro-widget'
          data-drawing-bar-visible={drawingBarVisible()}/>
        {/* 绘图 overlay 浮动属性工具栏 */}
        <OverlayPropertyBar
          locale={props.locale}
          visible={selectedOverlay() !== null}
          position={{ x: selectedOverlay()?.x ?? 0, y: selectedOverlay()?.y ?? 0 }}
          overlayId={selectedOverlay()?.id ?? ''}
          currentColor={selectedOverlay()?.color ?? '#1677ff'}
          currentFillColor={selectedOverlay()?.fillColor}
          currentLineWidth={selectedOverlay()?.lineWidth ?? 1}
          currentLineStyle={selectedOverlay()?.lineStyle ?? 'solid'}
          locked={selectedOverlay()?.locked ?? false}
          onColorChange={(color) => {
            const info = selectedOverlay()
            if (info && widget) {
              const next = { ...info, color }
              widget.overrideOverlay({ id: info.id, styles: buildStyles(next) })
              setSelectedOverlay(next)
              notifySelectedOverlayUpdate('property-bar', info.id)
            }
          }}
          onFillColorChange={(fillColor) => {
            const info = selectedOverlay()
            if (info && widget) {
              const next = { ...info, fillColor: fillColor === 'transparent' ? 'rgba(0,0,0,0)' : fillColor }
              widget.overrideOverlay({ id: info.id, styles: buildStyles(next) })
              setSelectedOverlay(next)
              notifySelectedOverlayUpdate('property-bar', info.id)
            }
          }}
          onLineWidthChange={(width) => {
            const info = selectedOverlay()
            if (info && widget) {
              const next = { ...info, lineWidth: width }
              widget.overrideOverlay({ id: info.id, styles: buildStyles(next) })
              setSelectedOverlay(next)
              notifySelectedOverlayUpdate('property-bar', info.id)
            }
          }}
          onLineStyleChange={(style) => {
            const info = selectedOverlay()
            if (info && widget) {
              const next = { ...info, lineStyle: style }
              widget.overrideOverlay({ id: info.id, styles: buildStyles(next) })
              setSelectedOverlay(next)
              notifySelectedOverlayUpdate('property-bar', info.id)
            }
          }}
          onLockChange={(locked) => {
            const info = selectedOverlay()
            if (info && widget) {
              widget.overrideOverlay({ id: info.id, lock: locked })
              setSelectedOverlay({ ...info, locked })
              notifySelectedOverlayUpdate('property-bar', info.id)
            }
          }}
          onDelete={() => {
            const info = selectedOverlay()
            if (info && widget) {
              widget.removeOverlay({ id: info.id })
              setSelectedOverlay(null)
            }
          }}
          onClose={() => setSelectedOverlay(null)}
        />
        <ReplayControlBar
          locale={props.locale}
          state={replayState()}
          onPlay={() => { replayEngine?.play() }}
          onPause={() => { replayEngine?.pause() }}
          onStepForward={() => { replayEngine?.stepForward() }}
          onStepBackward={() => { replayEngine?.stepBackward() }}
          onSpeedChange={(speed: ReplaySpeed) => { replayEngine?.setSpeed(speed) }}
          onPositionChange={(pos: number) => { replayEngine?.goToPosition(pos) }}
          onStop={() => { stopReplay() }}
        />
      </div>
    </ErrorBoundary>
  )
}

export default ChartProComponent
