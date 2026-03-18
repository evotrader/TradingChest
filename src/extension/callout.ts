/**
 * 标注气泡覆盖工具
 * 两次点击：第一次确定锚点，第二次确定文字位置
 * 绘制一条从锚点到文字位置的连线，并在文字位置显示带背景的文本框
 * 文字内容通过 overlay.extendData 传入，默认显示 'Note'
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
      // 从 extendData 获取文字内容，默认 'Note'
      const text = (overlay.extendData as string) || 'Note'
      return [
        // 锚点到文字位置的连线
        {
          type: 'line',
          attrs: {
            coordinates: [coordinates[0], coordinates[1]]
          }
        },
        // 锚点处的小圆点
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
        // 文字位置的文本框
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
  }
}

export default callout
