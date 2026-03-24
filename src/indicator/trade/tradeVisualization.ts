/**
 * 交易可视化指标
 * calc 中将交易数据映射到每根 K 线，draw 中直接用数据索引绘制
 */
import { IndicatorTemplate, KLineData } from 'klinecharts'

export interface TradeRecord {
  entryTs: number
  exitTs: number
  entryPrice: number
  exitPrice: number
  pnl: number
  direction: 'long' | 'short'
}

interface BarTradeInfo {
  // 该 K 线所在的交易区间列表（用于画矩形）
  ranges?: Array<{ entryPrice: number; exitPrice: number; pnl: number; isStart: boolean; isEnd: boolean }>
  // 该 K 线是入场点
  entry?: { price: number; direction: 'long' | 'short'; pnl: number }
  // 该 K 线是出场点
  exit?: { price: number; direction: 'long' | 'short'; pnl: number }
}

/** extendData shape for TradeVis indicator */
export interface TradeVisExtendData {
  trades: TradeRecord[]
  clickDetector?: import('../../core/indicatorClickDetector').IndicatorClickDetector
}

/** Module-level hit targets, updated every draw frame. Accessible via getTradeVisHitTargets(). */
let _hitTargets: Array<{ x: number; y: number; trade: TradeRecord; type: 'entry' | 'exit' }> = []

/** Get the latest visible trade marker positions (updated each draw frame). */
export function getTradeVisHitTargets(): ReadonlyArray<{ x: number; y: number; trade: TradeRecord; type: string }> {
  return _hitTargets
}

const tradeVisualization: IndicatorTemplate = {
  name: 'TradeVis',
  shortName: 'Trades',
  calcParams: [],
  figures: [],
  calc: (dataList: KLineData[], indicator) => {
    const ext = indicator.extendData as TradeVisExtendData | TradeRecord[] | undefined
    const trades = Array.isArray(ext) ? ext : ext?.trades
    if (!trades || trades.length === 0) {
      return dataList.map(() => ({}))
    }

    // 先为每笔交易找到最近的入场/出场 K 线索引（精确匹配，不用固定容差）
    const entryMap = new Map<number, { price: number; direction: 'long' | 'short'; pnl: number }>()
    const exitMap = new Map<number, { price: number; direction: 'long' | 'short'; pnl: number }>()
    const rangeSet = new Map<number, Array<{ entryPrice: number; exitPrice: number; pnl: number }>>()

    for (const t of trades) {
      // 找入场最近的 K 线
      let entryIdx = -1, entryMinDiff = Infinity
      let exitIdx = -1, exitMinDiff = Infinity
      for (let i = 0; i < dataList.length; i++) {
        const diff = Math.abs(dataList[i].timestamp - t.entryTs)
        if (diff < entryMinDiff) { entryMinDiff = diff; entryIdx = i }
        const diff2 = Math.abs(dataList[i].timestamp - t.exitTs)
        if (diff2 < exitMinDiff) { exitMinDiff = diff2; exitIdx = i }
      }
      if (entryIdx >= 0) {
        entryMap.set(entryIdx, { price: t.entryPrice, direction: t.direction, pnl: t.pnl })
      }
      if (exitIdx >= 0) {
        exitMap.set(exitIdx, { price: t.exitPrice, direction: t.direction, pnl: t.pnl })
      }
      // 区间：标记 entryIdx 到 exitIdx 之间的所有 K 线
      if (entryIdx >= 0 && exitIdx >= 0) {
        const lo = Math.min(entryIdx, exitIdx)
        const hi = Math.max(entryIdx, exitIdx)
        for (let i = lo; i <= hi; i++) {
          if (!rangeSet.has(i)) rangeSet.set(i, [])
          rangeSet.get(i)!.push({ entryPrice: t.entryPrice, exitPrice: t.exitPrice, pnl: t.pnl })
        }
      }
    }

    return dataList.map((_, i) => {
      const info: BarTradeInfo = {}
      if (entryMap.has(i)) info.entry = entryMap.get(i)!
      if (exitMap.has(i)) info.exit = exitMap.get(i)!
      if (rangeSet.has(i)) {
        info.ranges = rangeSet.get(i)!.map(r => ({
          ...r, isStart: entryMap.has(i), isEnd: exitMap.has(i)
        }))
      }
      return info
    })
  },
  draw: ({ ctx, indicator, bounding, barSpace, xAxis, yAxis, visibleRange }) => {
    const result = indicator.result as BarTradeInfo[]
    if (!result || result.length === 0) return false

    const ext = indicator.extendData as TradeVisExtendData | TradeRecord[] | undefined
    const trades = Array.isArray(ext) ? ext : ext?.trades
    const clickDetector = !Array.isArray(ext) ? ext?.clickDetector : undefined
    if (!trades || trades.length === 0) return false

    ctx.save()

    const { halfGapBar } = barSpace

    // ── 第一遍：画持仓区间矩形 ──
    for (const t of trades) {
      const isProfit = t.pnl >= 0
      const bgColor = isProfit ? 'rgba(38, 166, 154, 0.12)' : 'rgba(239, 83, 80, 0.12)'
      const borderColor = isProfit ? 'rgba(38, 166, 154, 0.4)' : 'rgba(239, 83, 80, 0.4)'

      // 找入场和出场的数据索引
      let entryIdx = -1, exitIdx = -1
      for (let i = 0; i < result.length; i++) {
        const info = result[i]
        if (info.entry && Math.abs(info.entry.price - t.entryPrice) < 1) {
          entryIdx = i
        }
        if (info.exit && Math.abs(info.exit.price - t.exitPrice) < 1) {
          exitIdx = i
        }
      }

      if (entryIdx >= 0 && exitIdx >= 0) {
        const x1 = xAxis.convertToPixel(entryIdx)
        const x2 = xAxis.convertToPixel(exitIdx)
        const y1 = yAxis.convertToPixel(t.entryPrice)
        const y2 = yAxis.convertToPixel(t.exitPrice)

        const left = Math.min(x1, x2)
        const right = Math.max(x1, x2)
        const top = Math.min(y1, y2)
        const bottom = Math.max(y1, y2)

        if (right >= 0 && left <= bounding.width && bottom >= 0 && top <= bounding.height) {
          // 半透明填充
          ctx.fillStyle = bgColor
          ctx.fillRect(left, top, right - left, bottom - top)
          // 虚线边框
          ctx.strokeStyle = borderColor
          ctx.lineWidth = 1
          ctx.setLineDash([4, 3])
          ctx.strokeRect(left, top, right - left, bottom - top)
          ctx.setLineDash([])
        }
      }
    }

    // ── 第二遍：画入场/出场标记 + 收集可见标记像素坐标用于点击检测 ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hitTargets: Array<{ x: number; y: number; trade: TradeRecord; type: 'entry' | 'exit' }> = [];

    for (let i = visibleRange.from; i < visibleRange.to; i++) {
      const info = result[i]
      if (!info) continue

      const barX = xAxis.convertToPixel(i)

      if (info.entry) {
        const y = yAxis.convertToPixel(info.entry.price)
        const isLong = info.entry.direction === 'long'
        const color = isLong ? 'rgba(38, 166, 154, 0.9)' : 'rgba(239, 83, 80, 0.9)'
        const label = isLong ? 'B' : 'S'
        drawLabel(ctx, barX, y, label, color)
        // 收集标签中心像素位置
        const trade = trades.find(t => Math.abs(t.entryPrice - info.entry!.price) < 1)
        if (trade) hitTargets.push({ x: barX, y: y - 35 - 9, trade, type: 'entry' })
      }

      if (info.exit) {
        const y = yAxis.convertToPixel(info.exit.price)
        const isLong = info.exit.direction === 'long'
        const color = isLong ? 'rgba(239, 83, 80, 0.9)' : 'rgba(38, 166, 154, 0.9)'
        const label = isLong ? 'S' : 'B'
        const pnlStr = `${label} ${info.exit.pnl >= 0 ? '+' : ''}${info.exit.pnl.toFixed(0)}`
        drawLabel(ctx, barX, y, pnlStr, color)
        const trade = trades.find(t => Math.abs(t.exitPrice - info.exit!.price) < 1)
        if (trade) hitTargets.push({ x: barX, y: y - 35 - 9, trade, type: 'exit' })
      }
    }

    // Always update module-level targets (for KLineChartPro click detection)
    _hitTargets = hitTargets

    // Also update clickDetector if provided via extendData
    if (clickDetector) {
      clickDetector.clearTargets()
      for (const ht of hitTargets) {
        clickDetector.addTarget(ht)
      }
    }

    ctx.restore()
    return false
  }
}

function drawLabel(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string) {
  // 标签在数据点上方，偏移足够大避免遮挡 K 线
  const offset = 35 // 标签底部距数据点的像素距离

  // 连接线（数据点到标签）
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.setLineDash([2, 2])
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x, y - offset + 5)
  ctx.stroke()
  ctx.setLineDash([])

  // 标签
  ctx.font = '11px sans-serif'
  const tw = ctx.measureText(text).width
  const w = tw + 10
  const h = 18
  const lx = x - w / 2
  const ly = y - offset - h
  const r = 3

  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(lx + r, ly)
  ctx.lineTo(lx + w - r, ly)
  ctx.quadraticCurveTo(lx + w, ly, lx + w, ly + r)
  ctx.lineTo(lx + w, ly + h - r)
  ctx.quadraticCurveTo(lx + w, ly + h, lx + w - r, ly + h)
  ctx.lineTo(lx + r, ly + h)
  ctx.quadraticCurveTo(lx, ly + h, lx, ly + h - r)
  ctx.lineTo(lx, ly + r)
  ctx.quadraticCurveTo(lx, ly, lx + r, ly)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, ly + h / 2)
}

export default tradeVisualization
