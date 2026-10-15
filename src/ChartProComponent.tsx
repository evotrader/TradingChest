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
  PaneOptions, Indicator,
  type Overlay, type OverlayCreate, type KLineData
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
import { EngineDataLoader } from './core/engineDataLoader'
import { buildStyles } from './core/buildStyles'
import type { OverlayLifecycleEvent, OverlayLifecycleSource } from './types'

export interface ChartComponentApi extends ChartPro {
  cancelDrawing: () => void
  deleteSelectedDrawing: () => void
  createDrawing: (overlay: OverlayCreate) => void
}

export interface ChartProComponentProps extends Required<Omit<ChartProOptions, 'container' | 'onAlertTrigger' | 'onReplayAlertTrigger' | 'onError' | 'onDataReady'>> {
  onDataReady?: ChartProOptions['onDataReady']
  ref: (chart: ChartComponentApi) => void
  /** 内部回调：实时数据到达时通知外层（用于报警检测） */
  onPriceUpdate?: (price: number, timestamp: number) => void
  onReplayPriceUpdate?: (price: number, timestamp: number) => void
  onReplayReset?: (price: number | undefined, timestamp: number | undefined) => void
  onReplayActiveChange?: (active: boolean) => void
  /** 内部回调：品种/周期切换时通知外层（用于重置报警状态等） */
  onDataReset?: (symbol: SymbolInfo) => void
  /** 内部错误回调 */
  onError?: (error: { type: string, message: string, raw?: unknown }) => void
}

interface PrevSymbolPeriod {
  symbol: SymbolInfo
  period: Period
}

async function createIndicator (widget: Nullable<Chart>, indicatorName: string, isStack?: boolean, paneOptions?: Partial<PaneOptions>, isActive: () => boolean = () => true): Promise<Nullable<string>> {
  await indicatorRegistry.ensureRegistered(indicatorName)
  if (!isActive() || !widget) return null
  const id = widget.createIndicator({
    name: indicatorName, paneId: paneOptions?.id,
    createTooltipDataSource: ({ chart, indicator }: any) => {
      const defaults = chart.getStyles().indicator.tooltip.features
      const features = [defaults[indicator.visible ? 1 : 0], defaults[2], defaults[3]].filter(Boolean)
      return { features }
    }
  } as any, isStack)
  const indicator = id ? widget.getIndicators({ id })[0] : undefined
  if (indicator && paneOptions) widget.setPaneOptions({...paneOptions, id: indicator.paneId})
  if (indicatorName === 'VOL' && indicator) widget.overrideYAxis({id:indicator.yAxisId,paneId:indicator.paneId,gap:{bottom:2}})
  return indicator?.paneId ?? null
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
  let disposed = false
  let loader: EngineDataLoader | undefined
  const [engineReady, setEngineReady] = createSignal(false)
  let retryInitialization: (()=>void) | undefined
  const [loadError, setLoadError] = createSignal('')

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
    const overlay = widget?.getOverlays({id:overlayId})[0]
    if (overlay) {
      notifyOverlay(source, overlay, 'update')
    }
  }

  // 回放状态
  const defaultReplayState: ReplayState = { active: false, playing: false, speed: 1, position: 0, totalBars: 0 }
  const [replayState, setReplayState] = createSignal<ReplayState>(defaultReplayState)
  let replayEngine: ReplayEngine | null = null

  const setChartPeriod = (nextPeriod: Period) => {
    if (replayEngine) return
    setPeriod(nextPeriod)
    props.onPeriodChange?.(nextPeriod)
  }

  const startReplay = (startPosition?: number) => {
    if (disposed || replayEngine || !widget) return
    const dataList = widget.getDataList()
    if (dataList.length === 0) return
    setLoading(false)
    setLoadingVisible(false)
    // 暂停实时数据订阅，防止实时数据污染回放时间线
    const pos = startPosition ?? Math.floor(dataList.length * 0.5)
    props.onReplayActiveChange?.(true)
    replayEngine = new ReplayEngine({
      onDataChange: (data) => {
        props.onReplayReset?.(data.at(-1)?.close, data.at(-1)?.timestamp)
        loader?.setReplay(data)
      },
      onBarUpdate: (bar) => {
        loader?.pushReplay(bar)
        props.onReplayPriceUpdate?.(bar.close, bar.timestamp)
      },
      onStateChange: (state) => { setReplayState(state) },
    })
    replayEngine.start(dataList, pos)
  }

  const [resuming,setResuming] = createSignal(false)
  const stopReplay = () => {
    if (disposed || !replayEngine || resuming()) return
    replayEngine.pause()
    setResuming(true)
    loader?.reload(true).then(() => {
      if (disposed) return
      replayEngine?.dispose()
      replayEngine = null
      setReplayState(defaultReplayState)
      props.onReplayActiveChange?.(false)
      props.onDataReady?.({symbol:symbol(),period:period()})
    }).catch(error => {
      if(!disposed && error instanceof DOMException && error.name==='AbortError')setLoadError('回放恢复已取消，请重试退出回放')
    }).finally(() => {setResuming(false)})
  }

  // Only drawings created through this instance's UI belong to its shortcuts.
  const ownedDrawingIds = new Set<string>()
  const completedDrawingIds = new Set<string>()
  let activeDrawingId: string | null = null
  const cancelDrawing = () => {
    if (activeDrawingId) widget?.removeOverlay({ id: activeDrawingId })
    activeDrawingId = null
    setSelectedOverlay(null)
  }
  const deleteSelectedDrawing = () => {
    const info = selectedOverlay()
    if (info && ownedDrawingIds.has(info.id) && !info.locked) {
      widget?.removeOverlay({ id: info.id })
      setSelectedOverlay(null)
    }
  }
  const createDrawing = (overlay: OverlayCreate) => {
    if (disposed) return
    cancelDrawing()
    const id = widget?.createOverlay({
      ...overlay,
      onDrawEnd: (event) => {
        activeDrawingId = null
        completedDrawingIds.add(event.overlay.id)
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
        if (activeDrawingId === event.overlay.id) activeDrawingId = null
        ownedDrawingIds.delete(event.overlay.id)
        if (completedDrawingIds.delete(event.overlay.id)) {
          notifyOverlay('drawing-bar', event.overlay, 'delete')
        }
        setSelectedOverlay(null)
        return true
      }
    })
    if (typeof id === 'string') {
      ownedDrawingIds.add(id)
      const drawing = widget?.getOverlays({id})[0]
      if (drawing && drawing.currentStep !== -1) activeDrawingId = id
    }
  }

  props.ref({
    locateTimestamp: () => { throw new Error('[TradingChest] locateTimestamp must be called on KLineChartPro instance') },
    cancelDrawing, deleteSelectedDrawing, createDrawing,
    reloadData: options => replayEngine ? Promise.reject(new Error('回放中请先退出回放，再重新加载行情')) : loader?.reload(options?.preserveViewport ?? true) ?? Promise.resolve(),
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
    setPeriod: setChartPeriod,
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
    const target = e.target as HTMLElement
    if (target.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable=""]')) return
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key === 'Backspace' || e.key === 'Delete') {
      deleteSelectedDrawing()
      e.preventDefault()
      e.stopPropagation()
    } else if (e.key === 'Escape') {
      cancelDrawing()
      e.preventDefault()
      e.stopPropagation()
    }
  }

  onMount(() => {
    window.addEventListener('resize', documentResize)
    // 绑定到 container 而非 window，避免图表外的按键误触发
    widgetRef!.addEventListener('keydown', handleKeyDown)
    widget = init(widgetRef!, {
      locale:locale(), timezone:timezone().key, styles:theme(),
      hotkey: {enabled:false},
      formatter: {
        formatDate: ({dateTimeFormat, timestamp, type}) => {
          const p = period()
          switch (p.timespan) {
            case 'minute': {
              if (type === 'xAxis') {
                return utils.formatDate(dateTimeFormat, timestamp, 'HH:mm')
              }
              return utils.formatDate(dateTimeFormat, timestamp, 'YYYY-MM-DD HH:mm')
            }
            case 'hour': {
              if (type === 'xAxis') {
                return utils.formatDate(dateTimeFormat, timestamp, 'MM-DD HH:mm')
              }
              return utils.formatDate(dateTimeFormat, timestamp, 'YYYY-MM-DD HH:mm')
            }
            case 'day':
            case 'week': return utils.formatDate(dateTimeFormat, timestamp, 'YYYY-MM-DD')
            case 'month': {
              if (type === 'xAxis') {
                return utils.formatDate(dateTimeFormat, timestamp, 'YYYY-MM')
              }
              return utils.formatDate(dateTimeFormat, timestamp, 'YYYY-MM-DD')
            }
            case 'year': {
              if (type === 'xAxis') {
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
      const watermarkContainer = widget.getDom('candle_pane', 'main')
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

      const priceUnitContainer = widget.getDom('candle_pane', 'yAxis')
      priceUnitDom = document.createElement('span')
      priceUnitDom.className = 'klinecharts-pro-price-unit'
      priceUnitContainer?.appendChild(priceUnitDom)
    }

    if (widget) loader = new EngineDataLoader(widget, props.datafeed, {
      loading: active => {setLoading(active);setLoadingVisible(active)},
      ready: identity => {setLoadError('');if(!resuming())props.onDataReady?.(identity)},
      error: error => {setLoadError(error.message);props.onError?.(error)},
      price: bar => props.onPriceUpdate?.(bar.close,bar.timestamp)
    })

    // Capture default styles once for "restore defaults" in settings modal
    setWidgetDefaultStyles(structuredClone(widget!.getStyles()))

    let initializing = false
    retryInitialization = () => {
      if (initializing || disposed) return
      initializing = true
      setLoadingVisible(true)
      void (async () => {
        for (const indicator of mainIndicators()) {
          if(!widget?.getIndicators({name:indicator,paneId:'candle_pane'}).length) await createIndicator(widget,indicator,true,{id:'candle_pane'},()=>!disposed)
        }
        const map:Record<string,string>={}
        for(const indicator of props.subIndicators!) {
          const existing=widget?.getIndicators({name:indicator}).find(i=>i.paneId!=='candle_pane')
          const paneId=existing?.paneId ?? await createIndicator(widget,indicator,true,undefined,()=>!disposed)
          if(paneId)map[indicator]=paneId
        }
        if(!disposed){setSubIndicators(map);setEngineReady(true)}
      })().catch(error=>{if(!disposed){setLoadError('指标初始化失败，请重试');setLoadingVisible(false);props.onError?.({type:'indicator-init',message:'指标初始化失败',raw:error})}}).finally(()=>{initializing=false})
    }
    retryInitialization()
    widget?.subscribeAction('onIndicatorTooltipFeatureClick', (event) => {
      const data = event as {indicator: Indicator; feature: {id:string}; paneId:string}
      const indicator = data.indicator
      if (!indicator) return
      switch (data.feature.id) {
        case 'visible': widget?.overrideIndicator({name:indicator.name,id:indicator.id,visible:true}); break
        case 'invisible': widget?.overrideIndicator({name:indicator.name,id:indicator.id,visible:false}); break
        case 'setting': setIndicatorSettingModalParams({visible:true,indicatorName:indicator.name,paneId:indicator.paneId,calcParams:indicator.calcParams}); break
        case 'close': {
          widget?.removeIndicator({id:indicator.id})
          if(indicator.paneId==='candle_pane') setMainIndicators(mainIndicators().filter(name=>name!==indicator.name))
          else {const next:Record<string,string>={...subIndicators()};delete next[indicator.name];setSubIndicators(next)}
        }
      }
    })
    // 点击蜡烛区域时清除 overlay 选中状态
    widget?.subscribeAction('onCandleBarClick', () => {
      setSelectedOverlay(null)
    })

  })

  onCleanup(() => {
    disposed = true
    loader?.dispose()
    window.removeEventListener('resize', documentResize)
    widgetRef!.removeEventListener('keydown', handleKeyDown)
    // 取消实时数据订阅，防止组件卸载后幽灵回调
    if (replayEngine) {
      replayEngine.stop()
      replayEngine.dispose()
      replayEngine = null
    }
    dispose(widgetRef!)
    widget = null
  })

  createEffect(() => {
    const s = symbol()
    if (priceUnitDom) {
      if (s?.priceCurrency) {
        priceUnitDom.textContent = s?.priceCurrency.toLocaleUpperCase()
        priceUnitDom.style.display = 'flex'
      } else {
        priceUnitDom.textContent = '币种未知'
        priceUnitDom.style.display = 'flex'
      }
    }
  })

  createEffect((prev?: PrevSymbolPeriod) => {
    const s = symbol(), p = period()
    if(!engineReady())return undefined
    if (prev) props.onDataReset?.(s)
    setLoadError('')
    loader?.activate(s,p)
    return {symbol:s,period:p}
  })

  createEffect(() => {
    const t = theme()
    widget?.setStyles(t)
    const color = t === 'dark' ? '#929AA5' : '#76808F'
    widget?.setStyles({
      indicator: {
        tooltip: {
          features: [
            {
              id: 'visible',
              position: 'middle',
              marginLeft: 8,
              marginTop: 7,
              marginRight: 0,
              marginBottom: 0,
              paddingLeft: 0,
              paddingTop: 0,
              paddingRight: 0,
              paddingBottom: 0,
              type: 'icon_font',
              content: {code:'\ue903', family:'icomoon'},
              size: 14,
              color: color,
              activeColor: color,
              backgroundColor: 'transparent',
              activeBackgroundColor: 'rgba(22, 119, 255, 0.15)'
            },
            {
              id: 'invisible',
              position: 'middle',
              marginLeft: 8,
              marginTop: 7,
              marginRight: 0,
              marginBottom: 0,
              paddingLeft: 0,
              paddingTop: 0,
              paddingRight: 0,
              paddingBottom: 0,
              type: 'icon_font',
              content: {code:'\ue901', family:'icomoon'},
              size: 14,
              color: color,
              activeColor: color,
              backgroundColor: 'transparent',
              activeBackgroundColor: 'rgba(22, 119, 255, 0.15)'
            },
            {
              id: 'setting',
              position: 'middle',
              marginLeft: 6,
              marginTop: 7,
              marginBottom: 0,
              marginRight: 0,
              paddingLeft: 0,
              paddingTop: 0,
              paddingRight: 0,
              paddingBottom: 0,
              type: 'icon_font',
              content: {code:'\ue902', family:'icomoon'},
              size: 14,
              color: color,
              activeColor: color,
              backgroundColor: 'transparent',
              activeBackgroundColor: 'rgba(22, 119, 255, 0.15)'
            },
            {
              id: 'close',
              position: 'middle',
              marginLeft: 6,
              marginTop: 7,
              marginRight: 0,
              marginBottom: 0,
              paddingLeft: 0,
              paddingTop: 0,
              paddingRight: 0,
              paddingBottom: 0,
              type: 'icon_font',
              content: {code:'\ue900', family:'icomoon'},
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
    if(widget && widget.getLocale()!==locale())widget.setLocale(locale())
  })

  createEffect(() => {
    if(widget && widget.getTimezone()!==timezone().key)widget.setTimezone(timezone().key)
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
              widget?.removeIndicator({id:widget?.getIndicators({paneId:'candle_pane',name:data.name})[0]?.id,paneId:'candle_pane',name:data.name})
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
                widget?.removeIndicator({paneId:data.paneId,name:data.name})
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
          currentStyles={{...utils.clone(widget!.getStyles()), axis:{name:widget!.getYAxes({paneId:'candle_pane'})[0]?.name ?? 'normal',reverse:widget!.getYAxes({paneId:'candle_pane'})[0]?.reverse ?? false}}}
          onClose={() => { setSettingModalVisible(false) }}
          onChange={style => {
            const {axis,...engineStyles} = style as any
            if(axis) widget?.overrideYAxis({paneId:'candle_pane',id:widget?.getYAxes({paneId:'candle_pane'})[0]?.id,...axis})
            widget?.setStyles(engineStyles)
          }}
          onRestoreDefault={(options: SelectDataSourceItem[]) => {
            const style = {}
            options.forEach(option => {
              const key = option.key
              if(key.startsWith('axis.')) deepSet(style,key,key==='axis.name'?'normal':false)
              else deepSet(style, key, utils.formatValue(widgetDefaultStyles(), key))
            })
            const {axis,...engineStyles} = style as any
            if(axis) widget?.overrideYAxis({paneId:'candle_pane',id:widget?.getYAxes({paneId:'candle_pane'})[0]?.id,...axis})
            widget?.setStyles(engineStyles)
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
            widget?.overrideIndicator({ id:widget.getIndicators({paneId:modalParams.paneId,name:modalParams.indicatorName})[0]?.id, name: modalParams.indicatorName, calcParams: params, paneId:modalParams.paneId })
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
        onPeriodChange={setChartPeriod}
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
        <Show when={loadError()}><div role="alert" class="klinecharts-pro-data-error">{loadError()} <button onClick={() => {!engineReady() ? retryInitialization?.() : replayEngine ? stopReplay() : void loader?.reload(true).catch(()=>{})}}>重试</button></div></Show>
        <Show when={loadingVisible()}>
          <Loading/>
        </Show>
        <Show when={drawingBarVisible()}>
          <DrawingBar
            locale={props.locale}
            onDrawingItemClick={overlay => {
              createDrawing(overlay)
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
          busy={resuming()}
          onPlay={() => { if(!resuming())replayEngine?.play() }}
          onPause={() => { replayEngine?.pause() }}
          onStepForward={() => { if(!resuming())replayEngine?.stepForward() }}
          onStepBackward={() => { if(!resuming())replayEngine?.stepBackward() }}
          onSpeedChange={(speed: ReplaySpeed) => { if(!resuming())replayEngine?.setSpeed(speed) }}
          onPositionChange={(pos: number) => { if(!resuming())replayEngine?.goToPosition(pos) }}
          onStop={() => { stopReplay() }}
        />
      </div>
    </ErrorBoundary>
  )
}

export default ChartProComponent
