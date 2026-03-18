/**
 * 文字标注覆盖工具
 * 单击放置一个带背景的文字标签
 * 绘制完成后弹出输入框让用户编辑文字内容
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
  },
  // 绘制完成后弹出文字输入
  onDrawEnd: ({ overlay }) => {
    const input = window.prompt('输入标注文字 / Enter text:', (overlay.extendData as string) || 'Text')
    if (input !== null && input.trim() !== '') {
      overlay.extendData = input.trim()
    }
    return true
  },
  // 双击编辑文字
  onClick: ({ overlay }) => {
    // 右键或特殊操作才编辑，普通点击不处理
    return false
  },
  onRightClick: ({ overlay }) => {
    const input = window.prompt('编辑标注文字 / Edit text:', (overlay.extendData as string) || '')
    if (input !== null && input.trim() !== '') {
      overlay.extendData = input.trim()
    }
    return true  // 阻止默认右键菜单
  }
}

export default textAnnotation
