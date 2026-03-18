/**
 * 文字标注覆盖工具
 * 单击放置一个带背景的文字标签
 * 文字内容通过 overlay.extendData 传入，默认显示 'Text'
 */

import { OverlayTemplate } from 'klinecharts'

const textAnnotation: OverlayTemplate = {
  name: 'textAnnotation',
  totalStep: 2,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length > 0) {
      // 从 extendData 获取文字内容，默认 'Text'
      const text = (overlay.extendData as string) || 'Text'
      return [
        {
          type: 'rectText',
          attrs: {
            x: coordinates[0].x,
            y: coordinates[0].y,
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
  }
}

export default textAnnotation
