/**
 * 自由画笔覆盖工具
 * 多点连线模式：用户连续点击添加点，双击或 Escape 结束绘制
 * totalStep 设为极大值，依赖用户主动结束绘制
 * 将所有坐标点依次连线，形成自由绘制效果
 */

import { OverlayTemplate } from 'klinecharts'

const brush: OverlayTemplate = {
  name: 'brush',
  totalStep: 1000,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ coordinates }) => {
    if (coordinates.length < 2) {
      return []
    }
    // 将相邻坐标点两两配对，生成线段数组
    const lineSegments = []
    for (let i = 0; i < coordinates.length - 1; i++) {
      lineSegments.push({
        coordinates: [coordinates[i], coordinates[i + 1]]
      })
    }
    return [
      {
        type: 'line',
        attrs: lineSegments
      }
    ]
  }
}

export default brush
