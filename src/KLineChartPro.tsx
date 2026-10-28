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

import { render } from 'solid-js/web'

import { getOverlayClass, utils, Nullable, DeepPartial, Styles } from 'klinecharts'
import { locateDataTimestamp, type TimestampLocation } from './core/locateTimestamp'

import ChartProComponent, { type ChartComponentApi } from './ChartProComponent'

import { SymbolInfo, Period, ChartPro, ChartProOptions } from './types'

import KeyboardShortcutManager,{defaultBindings} from './shortcut'
import {createDrawingAlertResolverMap} from './alert/drawingLevelResolvers'
import {copyDrawingCatalog} from './drawing/catalog'
import { exportToCSV, exportAllToCSV, exportScreenshot } from './export'
import { AlertManager } from './alert'
import type { AlertConfig } from './alert/types'
import { ReplayEngine } from './replay/ReplayEngine'
import type { TradeRecord } from './indicator/trade/tradeVisualization'
import { getTradeVisHitTargets, cleanupTradeVisInstance } from './indicator/trade/tradeVisualization'

export default class KLineChartPro implements ChartPro {
  constructor (options: ChartProOptions) {
    const drawingCatalog=copyDrawingCatalog(options.drawingCatalog)
    createDrawingAlertResolverMap(options.drawingAlertLevelResolvers)
    for(const tool of drawingCatalog)if(!getOverlayClass(tool.overlayName))throw new Error(`绘图模板 ${tool.overlayName} 尚未注册，请先调用 klinecharts.registerOverlay`)

    if (utils.isString(options.container)) {
      this._container = document.getElementById(options.container as string)
      if (!this._container) {
        throw new Error('Container is null')
      }
    } else {
      this._container = options.container as HTMLElement
    }
    this._container.classList.add('klinecharts-pro')
    this._container.setAttribute('data-theme', options.theme ?? 'light')

    this._alertSymbolKey = this._symbolKey(options.symbol)
    this._symbolAlerts.set(this._alertSymbolKey, this._alertManager)

    this._solidDispose = render(
      () => (
        <ChartProComponent
          ref={(chart: ChartComponentApi) => { this._chartApi = chart }}
          indicatorCatalog={options.indicatorCatalog}
          resolveDrawingShareKey={options.resolveDrawingShareKey}
          drawingWorkspaceSessions={options.drawingWorkspaceSessions}
          drawingHostSessions={options.drawingHostSessions}
          createDrawingDocumentId={options.createDrawingDocumentId}
          drawingCatalog={drawingCatalog}
          drawingPreferences={options.drawingPreferences}
          drawingPreferencesStore={options.drawingPreferencesStore}
          drawingPreferencesScope={options.drawingPreferencesScope}
          drawingAlertScope={options.drawingAlertScope}
          onDrawingAlertStateChange={options.onDrawingAlertStateChange}
          drawingAlertLevelResolvers={options.drawingAlertLevelResolvers}
          onDrawingAlertTrigger={options.onDrawingAlertTrigger}
          onReplayDrawingAlertTrigger={options.onReplayDrawingAlertTrigger}
          onDrawingStateChange={options.onDrawingStateChange}
          onDrawingShortcutsChange={shortcuts=>{this._drawingPreferenceShortcuts=shortcuts;this._applyDrawingShortcuts()}}
          analysisLayerListVisible={options.analysisLayerListVisible}
          onAnalysisLayerChange={options.onAnalysisLayerChange}
          onAnalysisEventClick={options.onAnalysisEventClick}
          onAnalysisPointSelect={options.onAnalysisPointSelect}
          styles={options.styles ?? {}}
          watermark={options.watermark ?? ''}
          theme={options.theme ?? 'light'}
          locale={options.locale ?? 'zh-CN'}
          drawingBarVisible={options.drawingBarVisible ?? true}
          symbol={options.symbol}
          period={options.period}
          periods={
            options.periods ?? [
              { multiplier: 1, timespan: 'minute', text: '1m' },
              { multiplier: 5, timespan: 'minute', text: '5m' },
              { multiplier: 15, timespan: 'minute', text: '15m' },
              { multiplier: 1, timespan: 'hour', text: '1H' },
              { multiplier: 2, timespan: 'hour', text: '2H' },
              { multiplier: 4, timespan: 'hour', text: '4H' },
              { multiplier: 1, timespan: 'day', text: 'D' },
              { multiplier: 1, timespan: 'week', text: 'W' },
              { multiplier: 1, timespan: 'month', text: 'M' },
              { multiplier: 1, timespan: 'year', text: 'Y' }
            ]
          }
          timezone={options.timezone ?? 'Asia/Shanghai'}
          mainIndicators={options.mainIndicators ?? (options.indicatorCatalog?.some(d=>d.name==='MA'&&d.placements.includes('main'))||options.indicatorCatalog===undefined?['MA']:[])}
          subIndicators={options.subIndicators ?? (options.indicatorCatalog?.some(d=>d.name==='VOL'&&d.placements.includes('sub'))||options.indicatorCatalog===undefined?['VOL']:[])}
          datafeed={options.datafeed}
          onPeriodChange={options.onPeriodChange ?? (() => {})}
          onIndicatorClick={options.onIndicatorClick ?? (() => {})}
          onOverlayCreate={options.onOverlayCreate ?? (() => {})}
          onOverlayUpdate={options.onOverlayUpdate ?? (() => {})}
          onOverlayDelete={options.onOverlayDelete ?? (() => {})}
          comparisonSymbols={options.comparisonSymbols}
          createComparisonDatafeed={options.createComparisonDatafeed}
          onComparisonChange={options.onComparisonChange}
          onDrawingSelect={options.onDrawingSelect}
          drawingOwner={options.drawingOwner}
          isDrawingEditable={options.isDrawingEditable}
          commitDrawing={options.commitDrawing}
          onDrawingHistoryChange={options.onDrawingHistoryChange}
          onPriceUpdate={(price: number, timestamp: number) => {
            if (!this._disposed && !this._replayActive) this._alertManager.checkPrice(price, timestamp)
          }}
          onReplayActiveChange={(active: boolean) => {
            if (active) this._historyReady = false
            this._replayActive = active
            if (!active) this._alertManager.resetPrevPrice()
          }}
          onReplayReset={(price, timestamp) => {
            this._replayAlertManager.clearAll()
            this._replayAlertManager.resetPrevPrice()
            for (const alert of this._alertManager.getAlerts()) this._replayAlertManager.addAlert(alert)
            if (price !== undefined && timestamp !== undefined) this._replayAlertManager.checkPrice(price, timestamp)
          }}
          onReplayPriceUpdate={(price: number, timestamp: number) => {
            if (!this._disposed && this._replayActive) this._replayAlertManager.checkPrice(price, timestamp)
          }}
          onDataReady={(context) => {
            if (this._disposed) return
            this._historyReady = true
            this._alertManager.resetPrevPrice()
            options.onDataReady?.(context)
          }}
          onDataReset={(symbol) => {
            this._historyReady = false
            this._activateAlertSymbol(symbol)
            this._alertManager.resetPrevPrice()
          }}
          onDataState={options.onDataState}
          onError={options.onError}/>
      ),
      this._container
    ) as unknown as (() => void)

    this._datafeed = options.datafeed

    // 指标图形点击检测（TradeVis 标签）
    // 直接绑定到 container（最外层），使用模块级 hitTargets（draw 每帧更新）
    {
      const onIndClick = options.onIndicatorClick
      this._clickTarget = this._container!
      this._clickHandler = (e: Event) => {
        const me = e as MouseEvent
        // hitTargets 的 x/y 是 pane canvas 内部坐标（xAxis/yAxis.convertToPixel）
        // 用 event.target（canvas）的 rect 匹配坐标系
        const target = me.target as HTMLElement
        const rect = target.getBoundingClientRect()
        const clickX = me.clientX - rect.left
        const clickY = me.clientY - rect.top

        // 从实例级 hitTargets 查找最近的交易标签
        const hitTargets = getTradeVisHitTargets(this._instanceId)
        let closest: { x: number; y: number; trade: TradeRecord; type: string } | null = null
        let minDist = Infinity
        for (const ht of hitTargets) {
          const dx = clickX - ht.x
          const dy = clickY - ht.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 40 && dist < minDist) {
            minDist = dist
            closest = ht
          }
        }

        if (closest && onIndClick) {
          onIndClick({
            indicatorName: 'TradeVis',
            data: { ...closest.trade, type: closest.type },
            x: clickX,
            y: clickY,
          })
        }
      }
      this._container!.addEventListener('click', this._clickHandler, true)
    }

    // 初始化报警管理器
    if (options.onAlertTrigger) {
      this._alertManager.onTrigger = options.onAlertTrigger
    }

    this._replayAlertManager.onTrigger = event => options.onReplayAlertTrigger?.({ ...event, mode: 'replay' })

    // 初始化快捷键管理器
    this._shortcutManager = new KeyboardShortcutManager(defaultBindings.filter(binding=>!binding.action.startsWith('draw:')))
    this._shortcutManager.registerActions({
      // 导航
      'nav:scrollToEnd': () => { this.getChart()?.scrollToRealTime() },
      'nav:scrollToStart': () => { this.getChart()?.scrollToDataIndex(0) },
      'nav:zoomIn': () => {
        const chart = this.getChart()
        if (chart) {
          const size = chart.getSize()
          chart.zoomAtCoordinate(1.2, { x: size?.width ? size.width / 2 : 400, y: 0 })
        }
      },
      'nav:zoomOut': () => {
        const chart = this.getChart()
        if (chart) {
          const size = chart.getSize()
          chart.zoomAtCoordinate(0.8, { x: size?.width ? size.width / 2 : 400, y: 0 })
        }
      },
      // 图表操作
      'chart:screenshot': () => { this.exportScreenshot() },
      'chart:cancelDraw': () => { void this._chartApi?.executeDrawingCommand({type:'cancel'}) },
      'chart:deleteSelected': () => { const ids=this._chartApi?.getDrawingState().selectedIds??[];if(ids.length)void this._chartApi?.executeDrawingCommand({type:'delete',ids}) },
      'drawing:undo': () => { void this._chartApi?.undoDrawing().catch(()=>{}) },
      'drawing:redo': () => { void this._chartApi?.redoDrawing().catch(()=>{}) },
      ...Object.fromEntries(drawingCatalog.map(tool=>[`draw:${tool.toolId}`,()=>{void this._chartApi?.executeDrawingCommand({type:'tool',toolId:tool.toolId})}])),
      'drawing:copy':()=>{const ids=this._chartApi?.getDrawingState().selectedIds??[];if(ids.length)void this._chartApi?.executeDrawingCommand({type:'copy',ids})},
      'drawing:paste':()=>{void this._chartApi?.executeDrawingCommand({type:'paste'})},
      // 显示切换
      'toggle:crosshair': () => {
        const chart = this.getChart()
        if (!chart) return
        const s = chart.getStyles()
        const show = s.crosshair?.show !== false
        chart.setStyles({ crosshair: { show: !show } })
      },
      'toggle:grid': () => {
        const chart = this.getChart()
        if (!chart) return
        const s = chart.getStyles()
        const show = s.grid?.show !== false
        chart.setStyles({ grid: { show: !show } })
      },
      'toggle:logScale': () => {
        const chart = this.getChart()
        if (!chart) return
        const axis = chart.getYAxes({paneId:'candle_pane'})[0]
        if (axis){chart.overrideYAxis({id:axis.id,paneId:'candle_pane',name:axis.name === 'logarithm' ? 'normal' : 'logarithm'});this._api().refreshDrawingAlertAxis()}
      },
    })
    this._drawingCatalog=drawingCatalog;this._applyDrawingShortcuts()
    this._shortcutManager.bindTo(this._container!)
  }

  private _drawingCatalog:import('./drawing/catalog').DrawingToolDescriptor[]=[]
  private _drawingBindingCombos:string[]=[]
  private _drawingPreferenceShortcuts:Record<string,string>={}
  private _applyDrawingShortcuts():void {
    if(!this._shortcutManager)return
    for(const combo of this._drawingBindingCombos)this._shortcutManager.removeBinding(combo)
    this._drawingBindingCombos=[]
    for(const tool of this._drawingCatalog){const combo=(this._drawingPreferenceShortcuts[tool.toolId]??tool.shortcut)?.toLowerCase();if(combo){this._shortcutManager.addBinding({combo,action:`draw:${tool.toolId}`,descriptionKey:tool.labels['zh-CN']});this._drawingBindingCombos.push(combo)}}
  }
  private _container: Nullable<HTMLElement>

  private _chartApi: Nullable<ChartComponentApi> = null

  private _shortcutManager: KeyboardShortcutManager


  private _datafeed: import('./types').Datafeed

  private _alertManager: AlertManager = new AlertManager()
  private _symbolAlerts = new Map<string, AlertManager>()
  private _alertSymbolKey = ''
  private _replayAlertManager: AlertManager = new AlertManager()
  private _replayActive = false

  private _instanceId = `tc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  private _disposed = false
  private _solidDispose: (() => void) | null = null
  private _clickHandler: ((e: Event) => void) | null = null
  private _clickTarget: Element | null = null

  /** Throws if called before Solid.js render completes or after dispose. */
  private _api(): ChartComponentApi {
    if (this._disposed) {
      throw new Error('[TradingChest] Instance has been disposed. Create a new instance to continue.')
    }
    if (!this._chartApi) {
      throw new Error('[TradingChest] Chart not initialized yet. Wait for render to complete before calling API methods.')
    }
    return this._chartApi
  }

  /** Throws if instance is disposed. For methods that don't need _chartApi. */
  private _assertNotDisposed(): void {
    if (this._disposed) {
      throw new Error('[TradingChest] Instance has been disposed. Create a new instance to continue.')
    }
  }

  retryData():Promise<void> {return this._api().retryData()}
  reloadData(options?: {preserveViewport?: boolean}): Promise<void> { return this._api().reloadData(options) }
  applySnapshot(snapshot: import('./types').ChartSnapshot): Promise<void> {return this._api().applySnapshot(snapshot)}

  setTheme (theme: string): void {
    this._container?.setAttribute('data-theme', theme)
    this._api().setTheme(theme)
  }

  getTheme (): string {
    return this._api().getTheme()
  }

  setStyles(styles: DeepPartial<Styles>): void {
    this._api().setStyles(styles)
  }

  getStyles(): Styles {
    return this._api().getStyles()
  }

  setLocale (locale: string): void {
    this._api().setLocale(locale)
  }

  getLocale (): string {
    return this._api().getLocale()
  }

  setTimezone (timezone: string): void {
    this._api().setTimezone(timezone)
  }

  getTimezone (): string {
    return this._api().getTimezone()
  }

  setSymbol (symbol: SymbolInfo): void {
    this._api().setSymbol(symbol)
  }

  getSymbol (): SymbolInfo {
    return this._api().getSymbol()
  }

  setPeriod (period: Period): void {
    this._api().setPeriod(period)
  }

  getPeriod (): Period {
    return this._api().getPeriod()
  }

  private _tradeIndicatorId: string | null = null
  private _historyReady = false

  locateTimestamp (target: { ticker: string, period: Period, timestamp: number }): TimestampLocation {
    const unavailable = (reason: string): TimestampLocation => ({
      status: 'unavailable', reason, requestedTimestamp: target.timestamp,
      ticker: target.ticker, period: { ...target.period }
    })
    if (this._disposed) return unavailable('disposed')
    if (!this._historyReady || this._replayActive) return unavailable('not-ready')
    const current = this.getPeriod()
    if (this.getSymbol().ticker !== target.ticker || current.multiplier !== target.period.multiplier || current.timespan !== target.period.timespan) {
      return unavailable('identity-mismatch')
    }
    const chart = this.getChart()
    const location = locateDataTimestamp(chart?.getDataList() ?? [], target.ticker, current, target.timestamp)
    if (location.status !== 'unavailable' && location.dataIndex !== undefined) chart?.scrollToDataIndex(location.dataIndex, 0)
    return location
  }

  getChart () {
    return this._api().getChart()
  }

  exportCSV (filename?: string): void {
    exportToCSV(this.getChart(), filename)
  }

  exportAllCSV (filename?: string): void {
    exportAllToCSV(this.getChart(), filename)
  }

  exportScreenshot (options?: { format?: 'png' | 'jpeg', backgroundColor?: string, filename?: string }): void {
    exportScreenshot(this.getChart(), options)
  }

  getShortcutManager (): KeyboardShortcutManager {
    return this._shortcutManager
  }

  createTradeVisualization (trades: TradeRecord[], paneOptions?: Record<string, unknown>): void {
    this._assertNotDisposed()
    const chart = this.getChart()
    if (!chart) return
    cleanupTradeVisInstance(this._instanceId)
    if (trades.length === 0) {
      if (this._tradeIndicatorId) chart.removeIndicator({id:this._tradeIndicatorId})
      this._tradeIndicatorId = null
      return
    }
    const value = {name:'TradeVis',paneId:'candle_pane',extendData:{trades,_instanceId:this._instanceId}}
    if (this._tradeIndicatorId && chart.getIndicators({id:this._tradeIndicatorId}).length) chart.overrideIndicator({...value,id:this._tradeIndicatorId})
    else this._tradeIndicatorId = chart.createIndicator(value, true)
    if(paneOptions) chart.setPaneOptions({...paneOptions,id:'candle_pane'})
  }

  private _symbolKey (symbol: SymbolInfo): string {
    return JSON.stringify([symbol.market ?? '', symbol.exchange ?? '', symbol.ticker, symbol.priceCurrency ?? ''])
  }

  private _activateAlertSymbol (symbol: SymbolInfo): void {
    const key = this._symbolKey(symbol)
    if (key === this._alertSymbolKey) return
    const chart = this.getChart()
    for (const alert of this._alertManager.getAlerts()) chart?.removeOverlay({ id: `alert_${alert.id}` })
    const onTrigger = this._alertManager.onTrigger
    this._alertManager = this._symbolAlerts.get(key) ?? new AlertManager()
    this._alertManager.onTrigger = onTrigger
    this._symbolAlerts.set(key, this._alertManager)
    this._alertSymbolKey = key
    this._alertManager.resetPrevPrice()
    this._replayAlertManager.clearAll()
    this._replayAlertManager.resetPrevPrice()
    for (const alert of this._alertManager.getAlerts()) {
      chart?.createOverlay({ name: 'alertLine', id: `alert_${alert.id}`,
        points: [{ value: alert.price }], styles: { line: { color: alert.color ?? '#ff9800' } }, lock: true })
    }
  }

  addAlert (config: AlertConfig): void {
    this._assertNotDisposed()
    this._alertManager.addAlert(config)
    if (this._replayActive) this._replayAlertManager.addAlert(config)
    const chart = this.getChart()
    if (chart) {
      chart.createOverlay({
        name: 'alertLine',
        id: `alert_${config.id}`,
        points: [{ value: config.price }],
        styles: { line: { color: config.color ?? '#ff9800' } },
        lock: true
      })
    }
  }

  updateAlert (id: string, updates: Partial<Omit<AlertConfig, 'id'>>): boolean {
    this._assertNotDisposed()
    const ok = this._alertManager.updateAlert(id, updates)
    if (this._replayActive) this._replayAlertManager.updateAlert(id, updates)
    if (ok && updates.price !== undefined) {
      // 更新 overlay 位置
      const chart = this.getChart()
      if (chart) {
        chart.removeOverlay({ id: `alert_${id}` })
        const alert = this._alertManager.getAlert(id)
        if (alert) {
          chart.createOverlay({
            name: 'alertLine',
            id: `alert_${id}`,
            points: [{ value: alert.price }],
            styles: { line: { color: updates.color ?? alert.color ?? '#ff9800' } },
            lock: true
          })
        }
      }
    }
    return ok
  }

  removeAlert (id: string): void {
    this._assertNotDisposed()
    this._alertManager.removeAlert(id)
    this._replayAlertManager.removeAlert(id)
    this.getChart()?.removeOverlay({ id: `alert_${id}` })
  }

  getAlerts (): AlertConfig[] {
    this._assertNotDisposed()
    return this._alertManager.getAlerts()
  }

  getAnalysisContext(){return this._api().getAnalysisContext()}
  addAnalysisLayer<S extends import('./analysis/types').AnalysisLayerSpec>(context:import('./analysis/types').AnalysisContext,spec:S){return this._api().addAnalysisLayer(context,spec)}
  getIndicatorCatalog(){return this._api().getIndicatorCatalog()}
  addIndicator(options:Parameters<ChartPro['addIndicator']>[0]){return this._api().addIndicator(options)}
  getIndicators(){return this._api().getIndicators()}
  updateIndicator(id:string,updates:Parameters<ChartPro['updateIndicator']>[1]){this._api().updateIndicator(id,updates)}
  removeIndicator(id:string){this._api().removeIndicator(id)}

  addComparison(symbol:SymbolInfo,datafeed:import('./compare/types').ComparisonDatafeed){
    this._assertNotDisposed()
    if(datafeed===this._datafeed)return Promise.reject(Error('比较必须使用独立于主图的数据通道'))
    return this._api().addComparison(symbol,datafeed)
  }
  removeComparison(id:string){this._api().removeComparison(id)}
  cancelComparison(id:string){this._api().cancelComparison(id)}
  getComparisons(){return this._api().getComparisons()}
  resetComparisonRange(){return this._api().resetComparisonRange()}
  refreshComparisons(){return this._api().refreshComparisons()}

  startReplay (startPosition?: number): void {
    this._api().startReplay(startPosition)
  }

  stopReplay (): void {
    this._api().stopReplay()
  }

  commitDrawing(change:Parameters<ChartPro['commitDrawing']>[0]) {return this._api().commitDrawing(change)}
  getDrawingTools(){return this._api().getDrawingTools()}
  getDrawingState(){return this._api().getDrawingState()}
  executeDrawingCommand(command:Parameters<ChartPro['executeDrawingCommand']>[0]){return this._api().executeDrawingCommand(command)}
  executeDrawingAlertCommand(command:Parameters<ChartPro['executeDrawingAlertCommand']>[0]){return this._api().executeDrawingAlertCommand(command)}
  getDrawingAlertState(){return this._api().getDrawingAlertState()}
  captureDrawingAlerts(){return this._api().captureDrawingAlerts()}
  restoreDrawingAlerts(document:Parameters<ChartPro['restoreDrawingAlerts']>[0]){this._api().restoreDrawingAlerts(document)}
  getDrawings(){return this._api().getDrawings()}
  bindDrawingWorkspace(registry:import('./drawing/session').DrawingSessionRegistry|undefined,resolve?:import('./drawing/session').DrawingShareResolver){return this._api().bindDrawingWorkspace(registry,resolve)}
  getDrawingHistoryState(){return this._api().getDrawingHistoryState()}
  restoreDrawings(owner:Parameters<ChartPro['restoreDrawings']>[0],drawings:Parameters<ChartPro['restoreDrawings']>[1]){this._api().restoreDrawings(owner,drawings)}
  resetDrawingHistory(){this._api().resetDrawingHistory()}
  undoDrawing(){return this._api().undoDrawing()}
  redoDrawing(){return this._api().redoDrawing()}
  getReplayEngine (): Pick<ReplayEngine,keyof ReplayEngine> | null {
    return this._api().getReplayEngine()
  }

  feedPrice (price: number): void {
    if (this._disposed || this._replayActive) return // feedPrice 静默忽略，不抛异常
    this._alertManager.checkPrice(price, Date.now())
  }

  dispose (): void {
    if (this._disposed) return // 幂等：重复调用安全
    this._disposed = true
    // Unmount below stops replay without reloading history or resubscribing.
    // 3. Clear alerts & TradeVis instance data
    for (const manager of this._symbolAlerts.values()) manager.clearAll()
    this._symbolAlerts.clear()
    this._alertManager.clearAll()
    this._alertManager.onTrigger = null
    this._replayAlertManager.clearAll()
    this._replayAlertManager.onTrigger = null
    cleanupTradeVisInstance(this._instanceId)
    // 4. Unbind shortcuts
    this._shortcutManager.unbind()
    // 5. Remove click listener
    if (this._clickHandler && this._clickTarget) {
      this._clickTarget.removeEventListener('click', this._clickHandler, true)
      this._clickHandler = null
      this._clickTarget = null
    }
    // 6. Unmount Solid.js render tree (triggers onCleanup → unsubscribe datafeed)
    if (this._solidDispose) {
      this._solidDispose()
      this._solidDispose = null
    }
    // 7. Release datafeed resources (WebSocket etc.)
    this._datafeed.dispose?.()
    // 8. Clean container
    this._container?.classList.remove('klinecharts-pro')
    this._container?.removeAttribute('data-theme')
    this._chartApi = null
  }
}
