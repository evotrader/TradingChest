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

import { utils, Nullable, DeepPartial, Styles, registerIndicator, YAxisType } from 'klinecharts'
import { normalizeToPercent } from './compare'

import ChartProComponent from './ChartProComponent'

import { SymbolInfo, Period, ChartPro, ChartProOptions } from './types'

import KeyboardShortcutManager from './shortcut'
import { exportToCSV, exportAllToCSV, exportScreenshot } from './export'
import { AlertManager } from './alert'
import type { AlertConfig } from './alert/types'
import { ReplayEngine } from './replay/ReplayEngine'
import type { TradeRecord } from './indicator/trade/tradeVisualization'
import { getTradeVisHitTargets, cleanupTradeVisInstance } from './indicator/trade/tradeVisualization'

export default class KLineChartPro implements ChartPro {
  constructor (options: ChartProOptions) {
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

    this._solidDispose = render(
      () => (
        <ChartProComponent
          ref={(chart: ChartPro) => { this._chartApi = chart }}
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
          mainIndicators={options.mainIndicators ?? ['MA']}
          subIndicators={options.subIndicators ?? ['VOL']}
          datafeed={options.datafeed}
          onIndicatorClick={options.onIndicatorClick ?? (() => {})}
          onPriceUpdate={(price: number) => { this._alertManager.checkPrice(price, Date.now()) }}
          onDataReset={() => {
            this._alertManager.resetPrevPrice()
            // 品种/周期切换时清理比较指标（旧数据时间戳不再对齐）
            this._clearComparisons()
          }}
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

    // 初始化快捷键管理器
    this._shortcutManager = new KeyboardShortcutManager()
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
      'chart:cancelDraw': () => { this.getChart()?.removeOverlay() },
      'chart:deleteSelected': () => { this.getChart()?.removeOverlay() },
      // 绘图工具
      'draw:straightLine': () => { this.getChart()?.createOverlay('straightLine') },
      'draw:horizontalStraightLine': () => { this.getChart()?.createOverlay('horizontalStraightLine') },
      'draw:verticalStraightLine': () => { this.getChart()?.createOverlay('verticalStraightLine') },
      'draw:fibonacciLine': () => { this.getChart()?.createOverlay('fibonacciLine') },
      'draw:rect': () => { this.getChart()?.createOverlay('rect') },
      'draw:brush': () => { this.getChart()?.createOverlay('simpleAnnotation') },
      'draw:dateAndPriceRange': () => { this.getChart()?.createOverlay('dateAndPriceRange') },
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
        const s = chart.getStyles()
        const yAxisType = s.yAxis?.type === YAxisType.Log ? YAxisType.Normal : YAxisType.Log
        chart.setStyles({ yAxis: { type: yAxisType } })
      },
    })
    this._shortcutManager.bindTo(this._container!)
  }

  private _container: Nullable<HTMLElement>

  private _chartApi: Nullable<ChartPro> = null

  private _shortcutManager: KeyboardShortcutManager

  private _comparisons = new Map<string, string>() // ticker → indicatorName

  private _datafeed: import('./types').Datafeed

  private _alertManager: AlertManager = new AlertManager()

  private _instanceId = `tc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  private _disposed = false
  private _solidDispose: (() => void) | null = null
  private _clickHandler: ((e: Event) => void) | null = null
  private _clickTarget: Element | null = null

  /** Throws if called before Solid.js render completes or after dispose. */
  private _api(): ChartPro {
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
    chart.createIndicator({
      name: 'TradeVis',
      extendData: { trades, _instanceId: this._instanceId }
    } as any, true, paneOptions ?? { id: 'candle_pane' })
  }

  addAlert (config: AlertConfig): void {
    this._assertNotDisposed()
    this._alertManager.addAlert(config)
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
    this.getChart()?.removeOverlay({ id: `alert_${id}` })
  }

  getAlerts (): AlertConfig[] {
    this._assertNotDisposed()
    return this._alertManager.getAlerts()
  }

  private _clearComparisons (): void {
    for (const [ticker, indicatorName] of this._comparisons) {
      try { this.getChart()?.removeIndicator('candle_pane', indicatorName) } catch (_) { /* already disposing */ }
    }
    this._comparisons.clear()
  }

  /**
   * Add comparison overlay for another symbol.
   * Known limitation: comparison data is fetched once and not updated with new ticks.
   */
  async addComparison (symbol: SymbolInfo): Promise<void> {
    this._assertNotDisposed()
    // 防止重复添加同一品种（先移除旧的）
    if (this._comparisons.has(symbol.ticker)) {
      this.removeComparison(symbol.ticker)
    }
    const chart = this.getChart()
    if (!chart) return

    const p = this.getPeriod()
    const mainData = chart.getDataList()
    if (mainData.length === 0) return

    const from = mainData[0].timestamp
    const to = mainData[mainData.length - 1].timestamp
    const compData = await this._datafeed.getHistoryKLineData(symbol, p, from, to)
    if (compData.length === 0) return

    const compPercent = normalizeToPercent(compData)
    const compMap = new Map<number, number>()
    // Sorted arrays for binary search fallback
    const compTimestamps = compData.map(d => d.timestamp)
    compData.forEach((d, i) => { compMap.set(d.timestamp, compPercent[i]) })

    const indicatorName = `COMPARE_${symbol.ticker.replace(/[^A-Z0-9]/g, '_')}`
    registerIndicator({
      name: indicatorName,
      shortName: symbol.shortName ?? symbol.ticker,
      figures: [{ key: 'pct', title: `${symbol.ticker}: `, type: 'line' }],
      calc: (dataList) => {
        return dataList.map(d => {
          let pct = compMap.get(d.timestamp)
          if (pct === undefined) {
            // Binary search for nearest timestamp within tolerance
            let lo = 0, hi = compTimestamps.length - 1
            while (lo < hi) {
              const mid = (lo + hi) >> 1
              if (compTimestamps[mid] < d.timestamp) lo = mid + 1
              else hi = mid
            }
            // Check lo and lo-1 for closest match within 60s
            for (const idx of [lo, lo - 1]) {
              if (idx >= 0 && idx < compTimestamps.length && Math.abs(compTimestamps[idx] - d.timestamp) <= 60000) {
                pct = compMap.get(compTimestamps[idx])
                break
              }
            }
          }
          return { pct }
        })
      }
    })

    chart.createIndicator(indicatorName, true, { id: 'candle_pane' })
    this._comparisons.set(symbol.ticker, indicatorName)
  }

  removeComparison (ticker: string): void {
    this._assertNotDisposed()
    const indicatorName = this._comparisons.get(ticker)
    if (indicatorName) {
      this.getChart()?.removeIndicator('candle_pane', indicatorName)
      this._comparisons.delete(ticker)
    }
  }

  startReplay (startPosition?: number): void {
    this._api().startReplay(startPosition)
  }

  stopReplay (): void {
    this._api().stopReplay()
  }

  getReplayEngine (): ReplayEngine | null {
    return this._api().getReplayEngine()
  }

  feedPrice (price: number): void {
    if (this._disposed) return // feedPrice 静默忽略，不抛异常
    this._alertManager.checkPrice(price, Date.now())
  }

  dispose (): void {
    if (this._disposed) return // 幂等：重复调用安全
    this._disposed = true
    // 1. Stop replay (safe — ChartProComponent.onCleanup also handles this)
    if (this._chartApi) {
      try { this._chartApi.stopReplay() } catch (_) { /* already disposing */ }
    }
    // 2. Remove comparisons
    this._clearComparisons()
    // 3. Clear alerts & TradeVis instance data
    this._alertManager.clearAll()
    this._alertManager.onTrigger = null
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
