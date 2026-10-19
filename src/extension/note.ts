/**
 * 便签覆盖工具
 * 单击放置一个黄色便签风格的文字标签
 * 绘制完成后弹出输入框让用户编辑文字内容
 */

import { OverlayTemplate } from 'klinecharts'

const note: OverlayTemplate = {
  name: 'note',
  totalStep: 2,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length > 0) {
      const text = typeof overlay.extendData==='string'?overlay.extendData:String((overlay.extendData as any)?.text??'')
      return [
        {
          type: 'rectText',
          attrs: {
            x: coordinates[0].x,
            y: coordinates[0].y,
            text: text,
            baseline: 'top',
            align: 'left'
          },
          styles: {
            style: 'stroke_fill',
            color: '#333333',
            backgroundColor: 'rgba(255, 235, 59, 0.85)',
            borderColor: 'rgba(200, 180, 30, 0.8)',
            borderSize: 1,
            borderRadius: 2,
            paddingLeft: 8,
            paddingRight: 8,
            paddingTop: 6,
            paddingBottom: 6,
            size: 12,
            ...overlay.styles?.text
          }
        }
      ]
    }
    return []
  },
}

export default note
