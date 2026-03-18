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
 * 希夫音叉（Schiff Pitchfork）
 * 与标准安德鲁音叉相同的 3 个输入点，但枢轴点在垂直方向上
 * 移至原始枢轴与第二个点的中点位置，使中线斜率更平缓。
 */
const schiffPitchfork: OverlayTemplate = {
  name: 'schiffPitchfork',
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

    const originalPivot = coordinates[0]
    const swing1 = coordinates[1]
    const swing2 = coordinates[2]

    // 希夫变体：枢轴点在 Y 方向移至原始枢轴与第二点的中点
    const pivot = {
      x: originalPivot.x,
      y: (originalPivot.y + swing1.y) / 2
    }

    // 两摆动点的中点
    const midPoint = {
      x: (swing1.x + swing2.x) / 2,
      y: (swing1.y + swing2.y) / 2
    }

    // 中线方向向量（调整后的 pivot → midPoint）
    const dx = midPoint.x - pivot.x
    const dy = midPoint.y - pivot.y

    // 中线射线
    const medianRay = getRayLine([pivot, midPoint], bounding) as LineAttrs

    // 上外线：过 swing1，平行于中线
    const upperRay = getRayLine(
      [swing1, { x: swing1.x + dx, y: swing1.y + dy }],
      bounding
    ) as LineAttrs

    // 下外线：过 swing2，平行于中线
    const lowerRay = getRayLine(
      [swing2, { x: swing2.x + dx, y: swing2.y + dy }],
      bounding
    ) as LineAttrs

    // 50% 内线
    const innerUpperStart = {
      x: (midPoint.x + swing1.x) / 2,
      y: (midPoint.y + swing1.y) / 2
    }
    const innerUpperRay = getRayLine(
      [innerUpperStart, { x: innerUpperStart.x + dx, y: innerUpperStart.y + dy }],
      bounding
    ) as LineAttrs

    const innerLowerStart = {
      x: (midPoint.x + swing2.x) / 2,
      y: (midPoint.y + swing2.y) / 2
    }
    const innerLowerRay = getRayLine(
      [innerLowerStart, { x: innerLowerStart.x + dx, y: innerLowerStart.y + dy }],
      bounding
    ) as LineAttrs

    // 收集主线
    const mainLines: LineAttrs[] = []
    if (medianRay && 'coordinates' in medianRay) {
      mainLines.push(medianRay)
    }
    if (upperRay && 'coordinates' in upperRay) {
      mainLines.push(upperRay)
    }
    if (lowerRay && 'coordinates' in lowerRay) {
      mainLines.push(lowerRay)
    }

    // 连接线：原始枢轴 → 各摆动点（虚线辅助参考）
    const connectLines: LineAttrs[] = [
      { coordinates: [originalPivot, swing1] },
      { coordinates: [originalPivot, swing2] }
    ]

    // 内线（50%，虚线）
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
        attrs: mainLines
      },
      {
        type: 'line',
        attrs: innerLines,
        styles: { style: 'dashed' }
      }
    ]
  }
}

export default schiffPitchfork
