/**
 * 标注气泡覆盖工具
 * 两次点击：锚点 + 文字位置
 * 绘制完成后弹出输入框让用户编辑文字内容
 */

import { OverlayTemplate } from 'klinecharts'

const callout: OverlayTemplate = {
  name: 'callout',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length > 1) {
      const text = (overlay.extendData as string) || 'Note'
      return [
        {
          type: 'line',
          attrs: {
            coordinates: [coordinates[0], coordinates[1]]
          }
        },
        {
          type: 'circle',
          ignoreEvent: true,
          attrs: {
            x: coordinates[0].x,
            y: coordinates[0].y,
            r: 4
          },
          styles: {
            style: 'fill',
            color: '#1677FF'
          }
        },
        {
          type: 'rectText',
          attrs: {
            x: coordinates[1].x,
            y: coordinates[1].y,
            text: text,
            baseline: 'middle',
            align: 'center'
          },
          styles: {
            style: 'stroke_fill',
            color: '#1677FF',
            backgroundColor: 'rgba(22, 119, 255, 0.15)',
            borderColor: 'rgba(22, 119, 255, 0.6)',
            borderSize: 1,
            borderRadius: 4,
            paddingLeft: 8,
            paddingRight: 8,
            paddingTop: 4,
            paddingBottom: 4,
            size: 12
          }
        }
      ]
    }
    return []
  },
  onDrawEnd: ({ overlay }) => {
    const input = window.prompt('输入标注文字 / Enter text:', (overlay.extendData as string) || 'Note')
    if (input !== null && input.trim() !== '') {
      overlay.extendData = input.trim()
    }
    return true
  },
  onRightClick: ({ overlay }) => {
    const input = window.prompt('编辑标注文字 / Edit text:', (overlay.extendData as string) || '')
    if (input !== null && input.trim() !== '') {
      overlay.extendData = input.trim()
    }
    return true
  }
}

export default callout
