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

import { utils, Nullable, DeepPartial, Styles, registerIndicator } from 'klinecharts'
import { normalizeToPercent } from './compare'

import ChartProComponent from './ChartProComponent'

import { SymbolInfo, Period, ChartPro, ChartProOptions } from './types'

import KeyboardShortcutManager from './shortcut'
import { IndicatorClickDetector } from './core/indicatorClickDetector'
import { exportToCSV, exportAllToCSV, exportScreenshot } from './export'
import { AlertManager } from './alert'
import type { AlertConfig } from './alert/types'
import { ReplayEngine } from './replay/ReplayEngine'
import type { TradeRecord } from './indicator/trade/tradeVisualization'

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
          onIndicatorClick={options.onIndicatorClick ?? (() => {})}/>
      ),
      this._container
    ) as unknown as (() => void)

    this._datafeed = options.datafeed

    // 指标图形点击检测：先检查元素是否已存在，否则用 MutationObserver
    if (options.onIndicatorClick) {
      const onIndClick = options.onIndicatorClick
      const detector = this._clickDetector
      const container = this._container!

      const self = this
      const attachClickListener = (widgetEl: Element) => {
        self._clickTarget = widgetEl
        self._clickHandler = (e: Event) => {
          const me = e as MouseEvent
          // hitTargets 坐标是 candle_pane 内部坐标（由 draw 回调的 xAxis/yAxis.convertToPixel 生成）
          // 需要用事件目标 canvas 的父容器（pane container）的 rect 来正确计算点击位置
          const target = me.target as HTMLElement
          // KLineChart DOM: pane container > canvas。找到 canvas 所在的 pane container
          const paneContainer = target.tagName === 'CANVAS' ? target.parentElement : target
          const rect = (paneContainer ?? widgetEl as HTMLElement).getBoundingClientRect()
          const clickX = me.clientX - rect.left
          const clickY = me.clientY - rect.top
          const closest = detector.findClosest(clickX, clickY, 40)
          if (closest) {
            onIndClick({
              indicatorName: 'TradeVis',
              data: { ...closest.trade, type: closest.type },
              x: clickX,
              y: clickY,
            })
          }
        }
        widgetEl.addEventListener('click', self._clickHandler, true)
      }

      // Solid.js render() 是同步的，元素可能已存在
      const existingEl = container.querySelector('.klinecharts-pro-widget')
      if (existingEl) {
        attachClickListener(existingEl)
      } else {
        this._observer = new MutationObserver(() => {
          const widgetEl = container.querySelector('.klinecharts-pro-widget')
          if (widgetEl) {
            this._observer!.disconnect()
            if (this._observerTimeoutId) {
              clearTimeout(this._observerTimeoutId)
              this._observerTimeoutId = null
            }
            attachClickListener(widgetEl)
          }
        })
        this._observer.observe(container, { childList: true, subtree: true })
        this._observerTimeoutId = setTimeout(() => {
          this._observer?.disconnect()
          this._observerTimeoutId = null
        }, 3000)
      }
    }

    // 初始化报警管理器
    if (options.onAlertTrigger) {
      this._alertManager.onTrigger = options.onAlertTrigger
    }

    // 初始化快捷键管理器
    this._shortcutManager = new KeyboardShortcutManager()
    this._shortcutManager.registerActions({
      'nav:scrollToEnd': () => { this.getChart()?.scrollToRealTime() },
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
      'chart:screenshot': () => { this.exportScreenshot() },
      'chart:cancelDraw': () => { this.getChart()?.removeOverlay() },
    })
    this._shortcutManager.bindTo(this._container!)
  }

  private _container: Nullable<HTMLElement>

  private _chartApi: Nullable<ChartPro> = null

  private _shortcutManager: KeyboardShortcutManager

  private _comparisons = new Map<string, string>() // ticker → indicatorName

  private _datafeed: import('./types').Datafeed

  private _clickDetector: IndicatorClickDetector = new IndicatorClickDetector()

  private _alertManager: AlertManager = new AlertManager()

  private _replayEngine: ReplayEngine | null = null

  private _solidDispose: (() => void) | null = null
  private _clickHandler: ((e: Event) => void) | null = null
  private _clickTarget: Element | null = null
  private _observer: MutationObserver | null = null
  private _observerTimeoutId: ReturnType<typeof setTimeout> | null = null

  setTheme (theme: string): void {
    this._container?.setAttribute('data-theme', theme)
    this._chartApi!.setTheme(theme)
  }

  getTheme (): string {
    return this._chartApi!.getTheme()
  }

  setStyles(styles: DeepPartial<Styles>): void {
    this._chartApi!.setStyles(styles)
  }

  getStyles(): Styles {
    return this._chartApi!.getStyles()
  }

  setLocale (locale: string): void {
    this._chartApi!.setLocale(locale)
  }

  getLocale (): string {
    return this._chartApi!.getLocale()
  }

  setTimezone (timezone: string): void {
    this._chartApi!.setTimezone(timezone)
  }

  getTimezone (): string {
    return this._chartApi!.getTimezone()
  }

  setSymbol (symbol: SymbolInfo): void {
    this._chartApi!.setSymbol(symbol)
  }

  getSymbol (): SymbolInfo {
    return this._chartApi!.getSymbol()
  }

  setPeriod (period: Period): void {
    this._chartApi!.setPeriod(period)
  }

  getPeriod (): Period {
    return this._chartApi!.getPeriod()
  }

  getChart () {
    return this._chartApi!.getChart()
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

  getClickDetector (): IndicatorClickDetector {
    return this._clickDetector
  }

  createTradeVisualization (trades: TradeRecord[], paneOptions?: Record<string, unknown>): void {
    const chart = this.getChart()
    if (!chart) return
    chart.createIndicator({
      name: 'TradeVis',
      extendData: { trades, clickDetector: this._clickDetector }
    } as any, true, paneOptions ?? { id: 'candle_pane' })
  }

  addAlert (config: AlertConfig): void {
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

  removeAlert (id: string): void {
    this._alertManager.removeAlert(id)
    this.getChart()?.removeOverlay({ id: `alert_${id}` })
  }

  getAlerts (): AlertConfig[] {
    return this._alertManager.getAlerts()
  }

  /**
   * Add comparison overlay for another symbol.
   * Known limitation: comparison data is fetched once and not updated with new ticks.
   */
  async addComparison (symbol: SymbolInfo): Promise<void> {
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
            for (const [ts, val] of compMap) {
              if (Math.abs(ts - d.timestamp) <= 60000) { pct = val; break }
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
    const indicatorName = this._comparisons.get(ticker)
    if (indicatorName) {
      this.getChart()?.removeIndicator('candle_pane', indicatorName)
      this._comparisons.delete(ticker)
    }
  }

  startReplay (startPosition?: number): void {
    const chart = this.getChart()
    if (!chart) return
    const dataList = chart.getDataList()
    if (dataList.length === 0) return
    const pos = startPosition ?? Math.floor(dataList.length * 0.5)

    this._replayEngine = new ReplayEngine({
      onDataChange: (data) => { chart.applyNewData(data, data.length > 0) },
      onBarUpdate: (bar) => {
        chart.updateData(bar)
        this._alertManager.checkPrice(bar.close, bar.timestamp)
      },
      onStateChange: () => {}
    })
    this._replayEngine.start(dataList, pos)
  }

  stopReplay (): void {
    if (this._replayEngine) {
      this._replayEngine.stop()
      this._replayEngine.dispose()
      this._replayEngine = null
    }
  }

  getReplayEngine (): ReplayEngine | null {
    return this._replayEngine
  }

  feedPrice (price: number): void {
    this._alertManager.checkPrice(price, Date.now())
  }

  dispose (): void {
    // 1. Stop replay
    this.stopReplay()
    // 2. Clear alerts
    this._alertManager.clearAll()
    this._alertManager.onTrigger = null
    // 3. Unbind shortcuts
    this._shortcutManager.unbind()
    // 4. Remove click listener
    if (this._clickHandler && this._clickTarget) {
      this._clickTarget.removeEventListener('click', this._clickHandler, true)
      this._clickHandler = null
      this._clickTarget = null
    }
    // 5. Disconnect observer
    if (this._observerTimeoutId) {
      clearTimeout(this._observerTimeoutId)
      this._observerTimeoutId = null
    }
    if (this._observer) {
      this._observer.disconnect()
      this._observer = null
    }
    // 6. Unmount Solid.js render tree
    if (this._solidDispose) {
      this._solidDispose()
      this._solidDispose = null
    }
    // 7. Clean container
    this._container?.classList.remove('klinecharts-pro')
    this._container?.removeAttribute('data-theme')
    this._chartApi = null
  }
}
