/**
 * 做空持仓可视化覆盖工具
 * 三次点击：入场价、止损价、止盈价
 * 与 longPosition 反转：
 *   - 绿色区域：入场到止盈（入场下方）
 *   - 红色区域：入场到止损（入场上方）
 *   - 入场价水平线
 * 显示盈亏比文字
 */

import { OverlayTemplate } from 'klinecharts'

const shortPosition: OverlayTemplate = {
  name: 'shortPosition',
  totalStep: 4,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay, precision }) => {
    if (coordinates.length < 2) {
      return []
    }

    const points = overlay.points
    const entryPrice = points[0].value!
    const stopLossPrice = points[1].value!

    // 入场坐标和止损坐标
    const entryY = coordinates[0].y
    const stopLossY = coordinates[1].y
    const leftX = coordinates[0].x
    const rightX = coordinates[1].x

    const figures: any[] = []

    // 红色区域：入场到止损（做空时止损在入场上方）
    const redColor = 'rgba(239, 83, 80, 0.15)'
    const redBorder = 'rgba(239, 83, 80, 0.6)'
    figures.push(
      {
        type: 'polygon',
        ignoreEvent: true,
        attrs: {
          coordinates: [
            { x: leftX, y: entryY },
            { x: rightX, y: entryY },
            { x: rightX, y: stopLossY },
            { x: leftX, y: stopLossY }
          ]
        },
        styles: { style: 'fill', color: redColor }
      }
    )

    // 入场价水平线
    figures.push(
      {
        type: 'line',
        attrs: {
          coordinates: [{ x: leftX, y: entryY }, { x: rightX, y: entryY }]
        },
        styles: { color: '#1677FF', style: 'dashed' }
      }
    )

    // 止损价水平线
    figures.push(
      {
        type: 'line',
        ignoreEvent: true,
        attrs: {
          coordinates: [{ x: leftX, y: stopLossY }, { x: rightX, y: stopLossY }]
        },
        styles: { color: redBorder }
      }
    )

    // 止损文字
    const riskAmount = Math.abs(stopLossPrice - entryPrice)
    figures.push(
      {
        type: 'rectText',
        ignoreEvent: true,
        attrs: {
          x: rightX,
          y: (entryY + stopLossY) / 2,
          text: `SL: ${stopLossPrice.toFixed(precision.price)} (-${riskAmount.toFixed(precision.price)})`,
          baseline: 'middle',
          align: 'left'
        },
        styles: {
          color: 'rgba(239, 83, 80, 1)',
          size: 11
        }
      }
    )

    // 第三个点：止盈
    if (coordinates.length > 2) {
      const takeProfitPrice = points[2].value!
      const takeProfitY = coordinates[2].y

      const greenColor = 'rgba(38, 166, 154, 0.15)'
      const greenBorder = 'rgba(38, 166, 154, 0.6)'

      // 绿色区域：入场到止盈（做空时止盈在入场下方）
      figures.push(
        {
          type: 'polygon',
          ignoreEvent: true,
          attrs: {
            coordinates: [
              { x: leftX, y: entryY },
              { x: rightX, y: entryY },
              { x: rightX, y: takeProfitY },
              { x: leftX, y: takeProfitY }
            ]
          },
          styles: { style: 'fill', color: greenColor }
        }
      )

      // 止盈价水平线
      figures.push(
        {
          type: 'line',
          ignoreEvent: true,
          attrs: {
            coordinates: [{ x: leftX, y: takeProfitY }, { x: rightX, y: takeProfitY }]
          },
          styles: { color: greenBorder }
        }
      )

      // 计算盈亏比
      const rewardAmount = Math.abs(entryPrice - takeProfitPrice)
      const ratio = riskAmount > 0 ? (rewardAmount / riskAmount).toFixed(2) : '--'

      // 止盈文字
      figures.push(
        {
          type: 'rectText',
          ignoreEvent: true,
          attrs: {
            x: rightX,
            y: (entryY + takeProfitY) / 2,
            text: `TP: ${takeProfitPrice.toFixed(precision.price)} (+${rewardAmount.toFixed(precision.price)})`,
            baseline: 'middle',
            align: 'left'
          },
          styles: {
            color: 'rgba(38, 166, 154, 1)',
            size: 11
          }
        }
      )

      // 盈亏比文字，显示在入场线下方
      figures.push(
        {
          type: 'rectText',
          ignoreEvent: true,
          attrs: {
            x: (leftX + rightX) / 2,
            y: entryY + 16,
            text: `R/R: 1:${ratio}`,
            baseline: 'top',
            align: 'center'
          },
          styles: {
            style: 'stroke_fill',
            color: '#1677FF',
            backgroundColor: 'rgba(22, 119, 255, 0.1)',
            borderColor: 'rgba(22, 119, 255, 0.4)',
            borderSize: 1,
            borderRadius: 3,
            paddingLeft: 6,
            paddingRight: 6,
            paddingTop: 2,
            paddingBottom: 2,
            size: 12
          }
        }
      )
    }

    return figures
  }
}

export default shortPosition
