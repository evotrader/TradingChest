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
 * 安德鲁音叉（Andrew's Pitchfork）
 * 3 个点：枢轴点（pivot）、两个摆动点（swing high/low）
 * 绘制：中线（枢轴 → 两摆动点中点）+ 两条平行外线 + 两条 50% 内线
 */
const pitchfork: OverlayTemplate = {
  name: 'pitchfork',
  totalStep: 4,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, bounding }) => {
    if (coordinates.length < 2) {
      return []
    }

    // 两点时先画引导线
    if (coordinates.length === 2) {
      return [
        {
          type: 'line',
          ignoreEvent: true,
          attrs: { coordinates }
        }
      ]
    }

    // 三点齐全，开始计算音叉
    const pivot = coordinates[0]
    const swing1 = coordinates[1]
    const swing2 = coordinates[2]

    // 两摆动点的中点
    const midPoint = {
      x: (swing1.x + swing2.x) / 2,
      y: (swing1.y + swing2.y) / 2
    }

    // 中线方向向量（pivot → midPoint）
    const dx = midPoint.x - pivot.x
    const dy = midPoint.y - pivot.y

    // 中线：从枢轴点出发，经过中点，延伸至图表边界
    const medianRay = getRayLine([pivot, midPoint], bounding) as LineAttrs

    // 平行线通过各摆动点，方向与中线相同
    // swing1 的平行线终点
    const upper1 = { x: swing1.x, y: swing1.y }
    const upper2 = { x: swing1.x + dx, y: swing1.y + dy }
    const upperRay = getRayLine([upper1, upper2], bounding) as LineAttrs

    // swing2 的平行线终点
    const lower1 = { x: swing2.x, y: swing2.y }
    const lower2 = { x: swing2.x + dx, y: swing2.y + dy }
    const lowerRay = getRayLine([lower1, lower2], bounding) as LineAttrs

    // 50% 内线：中线与外线之间的中间平行线
    const innerUpper1 = {
      x: (pivot.x + swing1.x) / 2,
      y: (pivot.y + swing1.y) / 2
    }
    const innerUpper2 = {
      x: innerUpper1.x + dx,
      y: innerUpper1.y + dy
    }
    // 内上线的起点取中线起点与上外线起点的中点方向
    const innerUpperStart = {
      x: (midPoint.x + swing1.x) / 2,
      y: (midPoint.y + swing1.y) / 2
    }
    const innerUpperEnd = {
      x: innerUpperStart.x + dx,
      y: innerUpperStart.y + dy
    }
    const innerUpperRay = getRayLine([innerUpperStart, innerUpperEnd], bounding) as LineAttrs

    const innerLowerStart = {
      x: (midPoint.x + swing2.x) / 2,
      y: (midPoint.y + swing2.y) / 2
    }
    const innerLowerEnd = {
      x: innerLowerStart.x + dx,
      y: innerLowerStart.y + dy
    }
    const innerLowerRay = getRayLine([innerLowerStart, innerLowerEnd], bounding) as LineAttrs

    const lines: LineAttrs[] = []

    // 中线
    if (medianRay && 'coordinates' in medianRay) {
      lines.push(medianRay)
    }
    // 上外线
    if (upperRay && 'coordinates' in upperRay) {
      lines.push(upperRay)
    }
    // 下外线
    if (lowerRay && 'coordinates' in lowerRay) {
      lines.push(lowerRay)
    }

    // 连接线：pivot → swing1, pivot → swing2（辅助参考）
    const connectLines: LineAttrs[] = [
      { coordinates: [pivot, swing1] },
      { coordinates: [pivot, swing2] }
    ]

    // 内线（50% 线，虚线风格）
    const innerLines: LineAttrs[] = []
    if (innerUpperRay && 'coordinates' in innerUpperRay) {
      innerLines.push(innerUpperRay)
    }
    if (innerLowerRay && 'coordinates' in innerLowerRay) {
      innerLines.push(innerLowerRay)
    }

    return [
      {
        type: 'line',
        attrs: connectLines,
        styles: { style: 'dashed' }
      },
      {
        type: 'line',
        attrs: lines
      },
      {
        type: 'line',
        attrs: innerLines,
        styles: { style: 'dashed' }
      }
    ]
  }
}

export default pitchfork
