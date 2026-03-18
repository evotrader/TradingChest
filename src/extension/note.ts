/**
 * 便签覆盖工具
 * 单击放置一个便签风格的矩形文本框
 * 黄色背景、黑色文字，模拟实体便签效果
 * 文字内容通过 overlay.extendData 传入，默认显示 'Note'
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
      // 从 extendData 获取文字内容，默认 'Note'
      const text = (overlay.extendData as string) || 'Note'
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
            size: 12
          }
        }
      ]
    }
    return []
  }
}

export default note
