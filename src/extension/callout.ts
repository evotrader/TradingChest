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
      const text = typeof overlay.extendData==='string'?overlay.extendData:String((overlay.extendData as any)?.text??'')
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
            align: (overlay.extendData as any)?.drawingParameters?.textAlign??'center'
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
            size: 12,
            ...overlay.styles?.text
          }
        }
      ]
    }
    return []
  },
}

export default callout
