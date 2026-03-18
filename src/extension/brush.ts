/**
 * 自由画笔覆盖工具
 * 使用多点线段模式：用户连续点击添加点
 * klinecharts overlay 不支持真正的拖拽绘制模式，
 * 因此使用多点线段实现近似效果
 */

import { OverlayTemplate } from 'klinecharts'

const brush: OverlayTemplate = {
  name: 'brush',
  totalStep: 100,  // 最多100个点，实际通过右键结束
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ coordinates }) => {
    if (coordinates.length < 2) {
      return []
    }
    // 将所有点连成一条连续线
    return [
      {
        type: 'line',
        attrs: {
          coordinates: coordinates
        },
        styles: {
          style: 'solid',
          size: 2,
          color: '#FF6D00'
        }
      }
    ]
  }
}

export default brush
