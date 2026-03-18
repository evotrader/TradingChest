/**
 * 交易标记覆盖工具
 * 在数据点上显示一个可点击的标签（B/S + PnL）
 * 与 simpleAnnotation 不同，文字部分也可以接收点击事件
 */

import { OverlayTemplate } from 'klinecharts'

const tradeMarker: OverlayTemplate = {
  name: 'tradeMarker',
  totalStep: 2,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length === 0) return []

    const x = coordinates[0].x
    const y = coordinates[0].y
    const text = (overlay.extendData as string) || ''
    const color = overlay.styles?.rectText?.backgroundColor ?? '#1677FF'
    const borderColor = overlay.styles?.rectText?.borderColor ?? color

    return [
      // 小三角指示器（指向数据点）
      {
        type: 'polygon',
        attrs: {
          coordinates: [
            { x: x, y: y },
            { x: x - 5, y: y - 8 },
            { x: x + 5, y: y - 8 },
          ]
        },
        styles: {
          style: 'fill',
          color: borderColor,
        }
      },
      // 标签背景 + 文字（可点击）
      {
        type: 'rectText',
        // ignoreEvent 默认 false，文字可点击
        attrs: {
          x: x,
          y: y - 20,
          text: text,
          align: 'center',
          baseline: 'bottom',
        },
        styles: {
          style: 'stroke_fill',
          color: '#fff',
          backgroundColor: color,
          borderColor: borderColor,
          borderSize: 1,
          borderRadius: 3,
          paddingLeft: 6,
          paddingRight: 6,
          paddingTop: 3,
          paddingBottom: 3,
          size: 11,
        }
      },
    ]
  }
}

export default tradeMarker
