/**
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at

 * http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { OverlayTemplate, LineAttrs } from 'klinecharts'

import { getRayLine, getDistance } from './utils'

/**
 * 回归通道（Regression Channel）
 * 2 个点定义回归线区间，上下各偏移固定视觉距离绘制平行通道线。
 * 偏移量基于两点间距离的 15% 计算，模拟 ±1 标准差通道。
 * 注意：在 createPointFigures 中无法获取实际 K 线数据进行真实标准差计算。
 */
const regressionChannel: OverlayTemplate = {
  name: 'regressionChannel',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  styles: {
    polygon: {
      color: 'rgba(22, 119, 255, 0.08)'
    }
  },
  createPointFigures: ({ coordinates, bounding }) => {
    if (coordinates.length < 2) {
      return []
    }

    const start = coordinates[0]
    const end = coordinates[1]

    // 中线方向向量
    const dx = end.x - start.x
    const dy = end.y - start.y
    const length = getDistance(start, end)

    if (length === 0) {
      return []
    }

    // 法线方向（垂直于中线方向），用于计算通道偏移
    // 法线单位向量：(-dy, dx) / length
    const nx = -dy / length
    const ny = dx / length

    // 通道宽度：两点距离的 15%，模拟 ±1 标准差
    const channelOffset = length * 0.15

    // 上通道线的起止点
    const upperStart = { x: start.x + nx * channelOffset, y: start.y + ny * channelOffset }
    const upperEnd = { x: end.x + nx * channelOffset, y: end.y + ny * channelOffset }

    // 下通道线的起止点
    const lowerStart = { x: start.x - nx * channelOffset, y: start.y - ny * channelOffset }
    const lowerEnd = { x: end.x - nx * channelOffset, y: end.y - ny * channelOffset }

    // 中线射线
    const centerRay = getRayLine([start, end], bounding) as LineAttrs
    // 上通道射线
    const upperRay = getRayLine([upperStart, upperEnd], bounding) as LineAttrs
    // 下通道射线
    const lowerRay = getRayLine([lowerStart, lowerEnd], bounding) as LineAttrs

    // 中线（实线）
    const centerLines: LineAttrs[] = []
    if (centerRay && 'coordinates' in centerRay) {
      centerLines.push(centerRay)
    }

    // 上下通道线（虚线）
    const channelLines: LineAttrs[] = []
    if (upperRay && 'coordinates' in upperRay) {
      channelLines.push(upperRay)
    }
    if (lowerRay && 'coordinates' in lowerRay) {
      channelLines.push(lowerRay)
    }

    // 通道填充区域（两点之间的矩形区域）
    const fillCoordinates = [upperStart, upperEnd, lowerEnd, lowerStart]

    return [
      {
        type: 'polygon',
        ignoreEvent: true,
        attrs: { coordinates: fillCoordinates },
        styles: { style: 'fill' }
      },
      {
        type: 'line',
        attrs: centerLines
      },
      {
        type: 'line',
        attrs: channelLines,
        styles: { style: 'dashed' }
      }
    ]
  }
}

export default regressionChannel
