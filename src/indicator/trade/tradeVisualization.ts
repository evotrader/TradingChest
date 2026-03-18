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

const tradeVisualization: IndicatorTemplate = {
  name: 'TradeVis',
  shortName: 'Trades',
  calcParams: [],
  figures: [],
  calc: (dataList: KLineData[], indicator) => {
    const trades = indicator.extendData as TradeRecord[] | undefined
    if (!trades || trades.length === 0) {
      return dataList.map(() => ({}))
    }

    // 为每根 K 线标记交易信息
    return dataList.map((bar) => {
      const info: BarTradeInfo = {}
      const ts = bar.timestamp

      for (const t of trades) {
        // 入场点（时间戳匹配，允许 ±12 小时误差以兼容时区差异）
        if (Math.abs(ts - t.entryTs) < 43200000) {
          info.entry = { price: t.entryPrice, direction: t.direction, pnl: t.pnl }
        }
        // 出场点
        if (Math.abs(ts - t.exitTs) < 43200000) {
          info.exit = { price: t.exitPrice, direction: t.direction, pnl: t.pnl }
        }
        // 在交易区间内
        if (ts >= t.entryTs - 43200000 && ts <= t.exitTs + 43200000) {
          if (!info.ranges) info.ranges = []
          info.ranges.push({
            entryPrice: t.entryPrice,
            exitPrice: t.exitPrice,
            pnl: t.pnl,
            isStart: Math.abs(ts - t.entryTs) < 43200000,
            isEnd: Math.abs(ts - t.exitTs) < 43200000,
          })
        }
      }

      return info
    })
  },
  draw: ({ ctx, indicator, bounding, barSpace, xAxis, yAxis, visibleRange }) => {
    const result = indicator.result as BarTradeInfo[]
    if (!result || result.length === 0) return false

    const trades = indicator.extendData as TradeRecord[] | undefined
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

    // ── 第二遍：画入场/出场标记 ──
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
      }

      if (info.exit) {
        const y = yAxis.convertToPixel(info.exit.price)
        const isLong = info.exit.direction === 'long'
        const color = isLong ? 'rgba(239, 83, 80, 0.9)' : 'rgba(38, 166, 154, 0.9)'
        const label = isLong ? 'S' : 'B'
        const pnlStr = `${label} ${info.exit.pnl >= 0 ? '+' : ''}${info.exit.pnl.toFixed(0)}`
        drawLabel(ctx, barX, y, pnlStr, color)
      }
    }

    ctx.restore()
    return false
  }
}

function drawLabel(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string) {
  // 小三角
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x - 4, y - 7)
  ctx.lineTo(x + 4, y - 7)
  ctx.closePath()
  ctx.fill()

  // 标签
  ctx.font = '11px sans-serif'
  const tw = ctx.measureText(text).width
  const w = tw + 10
  const h = 18
  const lx = x - w / 2
  const ly = y - 7 - h - 2
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
