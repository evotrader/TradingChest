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

import { getRayLine } from './utils'

/**
 * 线性回归趋势线（Linear Regression Trend）
 * 2 个点定义区间，在两点间绘制回归线并向右延伸。
 * 注意：在 createPointFigures 中无法获取实际 K 线数据，
 * 因此以两点连线作为回归线的近似，并通过射线延伸至图表边界。
 */
const regressionTrend: OverlayTemplate = {
  name: 'regressionTrend',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, bounding }) => {
    if (coordinates.length < 2) {
      return []
    }

    const start = coordinates[0]
    const end = coordinates[1]

    // 回归线（两点连线）向右延伸为射线
    const rayLine = getRayLine([start, end], bounding) as LineAttrs

    const lines: LineAttrs[] = []
    if (rayLine && 'coordinates' in rayLine) {
      lines.push(rayLine)
    }

    // 起止区间的垂直标记线（虚线），标识回归计算范围
    const markerLines: LineAttrs[] = [
      { coordinates: [{ x: start.x, y: start.y - 20 }, { x: start.x, y: start.y + 20 }] },
      { coordinates: [{ x: end.x, y: end.y - 20 }, { x: end.x, y: end.y + 20 }] }
    ]

    return [
      {
        type: 'line',
        attrs: lines
      },
      {
        type: 'line',
        attrs: markerLines,
        styles: { style: 'dashed' }
      }
    ]
  }
}

export default regressionTrend
