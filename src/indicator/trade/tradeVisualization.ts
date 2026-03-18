/**
 * 交易可视化指标
 * 通过自定义指标的 draw 回调在 canvas 上直接绘制交易标记和持仓区间
 * 比 overlay 更可靠：不会在 loadMore/scrolling 时丢失
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

const tradeVisualization: IndicatorTemplate = {
  name: 'TradeVis',
  shortName: 'Trades',
  calcParams: [],
  figures: [],
  calc: (dataList: KLineData[]) => {
    return dataList.map(() => ({}))
  },
  draw: ({ ctx, indicator, bounding, barSpace, xAxis, yAxis }) => {
    const trades = indicator.extendData as TradeRecord[] | undefined
    if (!trades || trades.length === 0) return false

    ctx.save()

    for (const t of trades) {
      const entryX = xAxis.convertToPixel(t.entryTs)
      const exitX = xAxis.convertToPixel(t.exitTs)
      const entryY = yAxis.convertToPixel(t.entryPrice)
      const exitY = yAxis.convertToPixel(t.exitPrice)

      // 跳过不在可见范围的交易
      if (exitX < 0 || entryX > bounding.width) continue

      const isProfit = t.pnl >= 0
      const color = isProfit ? 'rgba(38, 166, 154, 0.9)' : 'rgba(239, 83, 80, 0.9)'
      const bgColor = isProfit ? 'rgba(38, 166, 154, 0.12)' : 'rgba(239, 83, 80, 0.12)'
      const borderColor = isProfit ? 'rgba(38, 166, 154, 0.4)' : 'rgba(239, 83, 80, 0.4)'

      // ── 持仓区间矩形 ──
      const rectLeft = Math.max(0, Math.min(entryX, exitX))
      const rectRight = Math.min(bounding.width, Math.max(entryX, exitX))
      const rectTop = Math.min(entryY, exitY)
      const rectBottom = Math.max(entryY, exitY)
      const rectWidth = rectRight - rectLeft
      const rectHeight = rectBottom - rectTop

      if (rectWidth > 1 && rectHeight > 1) {
        // 半透明填充
        ctx.fillStyle = bgColor
        ctx.fillRect(rectLeft, rectTop, rectWidth, rectHeight)

        // 虚线边框
        ctx.strokeStyle = borderColor
        ctx.lineWidth = 1
        ctx.setLineDash([4, 3])
        ctx.strokeRect(rectLeft, rectTop, rectWidth, rectHeight)
        ctx.setLineDash([])
      }

      // ── 入场标记 ──
      if (entryX >= 0 && entryX <= bounding.width) {
        const isOpen = true
        const side = t.direction
        const label = side === 'long' ? 'B' : 'S'

        // 小三角
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.moveTo(entryX, entryY)
        ctx.lineTo(entryX - 4, entryY - 7)
        ctx.lineTo(entryX + 4, entryY - 7)
        ctx.closePath()
        ctx.fill()

        // 标签
        ctx.font = '11px sans-serif'
        const labelText = label
        const textWidth = ctx.measureText(labelText).width
        const labelW = textWidth + 10
        const labelH = 18
        const labelX = entryX - labelW / 2
        const labelY = entryY - 7 - labelH - 2

        ctx.fillStyle = color
        // 圆角矩形
        const r = 3
        ctx.beginPath()
        ctx.moveTo(labelX + r, labelY)
        ctx.lineTo(labelX + labelW - r, labelY)
        ctx.quadraticCurveTo(labelX + labelW, labelY, labelX + labelW, labelY + r)
        ctx.lineTo(labelX + labelW, labelY + labelH - r)
        ctx.quadraticCurveTo(labelX + labelW, labelY + labelH, labelX + labelW - r, labelY + labelH)
        ctx.lineTo(labelX + r, labelY + labelH)
        ctx.quadraticCurveTo(labelX, labelY + labelH, labelX, labelY + labelH - r)
        ctx.lineTo(labelX, labelY + r)
        ctx.quadraticCurveTo(labelX, labelY, labelX + r, labelY)
        ctx.closePath()
        ctx.fill()

        ctx.fillStyle = '#fff'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(labelText, entryX, labelY + labelH / 2)
      }

      // ── 出场标记 ──
      if (exitX >= 0 && exitX <= bounding.width) {
        const side = t.direction
        const label = side === 'long' ? 'S' : 'B'
        const pnlText = `${label} ${t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(0)}`

        // 小三角
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.moveTo(exitX, exitY)
        ctx.lineTo(exitX - 4, exitY - 7)
        ctx.lineTo(exitX + 4, exitY - 7)
        ctx.closePath()
        ctx.fill()

        // 标签
        ctx.font = '11px sans-serif'
        const textWidth = ctx.measureText(pnlText).width
        const labelW = textWidth + 10
        const labelH = 18
        const labelX = exitX - labelW / 2
        const labelY = exitY - 7 - labelH - 2

        ctx.fillStyle = color
        const r = 3
        ctx.beginPath()
        ctx.moveTo(labelX + r, labelY)
        ctx.lineTo(labelX + labelW - r, labelY)
        ctx.quadraticCurveTo(labelX + labelW, labelY, labelX + labelW, labelY + r)
        ctx.lineTo(labelX + labelW, labelY + labelH - r)
        ctx.quadraticCurveTo(labelX + labelW, labelY + labelH, labelX + labelW - r, labelY + labelH)
        ctx.lineTo(labelX + r, labelY + labelH)
        ctx.quadraticCurveTo(labelX, labelY + labelH, labelX, labelY + labelH - r)
        ctx.lineTo(labelX, labelY + r)
        ctx.quadraticCurveTo(labelX, labelY, labelX + r, labelY)
        ctx.closePath()
        ctx.fill()

        ctx.fillStyle = '#fff'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(pnlText, exitX, labelY + labelH / 2)
      }
    }

    ctx.restore()
    return false // false = 不阻止默认绘制
  }
}

export default tradeVisualization
