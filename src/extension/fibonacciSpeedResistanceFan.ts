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

import { OverlayTemplate, LineAttrs, TextAttrs } from 'klinecharts'

import { getRayLine } from './utils'

import {canProjectAxisValue,toolLevels} from './numerics'

const fibonacciSpeedResistanceFan: OverlayTemplate = {
  name: 'fibonacciSpeedResistanceFan',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, bounding,overlay,yAxis }) => {
    const lines1: LineAttrs[] = []
    let lines2: LineAttrs[] = []
    const texts: TextAttrs[] = []
    if (coordinates.length > 1) {
      const xOffset = coordinates[1].x > coordinates[0].x ? -38 : 4
      const yOffset = coordinates[1].y > coordinates[0].y ? -2 : 20
      const xDistance = coordinates[1].x - coordinates[0].x
      const yDistance = coordinates[1].y - coordinates[0].y
      const percents = toolLevels(overlay,[1,.75,.618,.5,.382,.25,0])
      if(!yAxis||percents.some(percent=>!canProjectAxisValue(yAxis,overlay.points[1].value!-(overlay.points[1].value!-overlay.points[0].value!)*percent)))return [{type:'rectText',attrs:{...coordinates[0],text:'当前价格轴不能显示此级别，请调整级别或切换线性轴'}}]
      percents.forEach(percent => {
        const x = coordinates[1].x - xDistance * percent
        const y = yAxis!.convertToPixel(overlay.points[1].value!-(overlay.points[1].value!-overlay.points[0].value!)*percent)
        lines1.push({ coordinates: [{ x, y: coordinates[0].y }, { x, y: coordinates[1].y }] })
        lines1.push({ coordinates: [{ x: coordinates[0].x, y }, { x: coordinates[1].x, y }] })
        lines2 = lines2.concat(getRayLine([coordinates[0], { x, y: coordinates[1].y }], bounding))
        lines2 = lines2.concat(getRayLine([coordinates[0], { x: coordinates[1].x, y }], bounding))
        texts.unshift({
          x: coordinates[0].x + xOffset,
          y: y + 10,
          text: `${percent.toFixed(3)}`
        })
        texts.unshift({
          x: x - 18,
          y: coordinates[0].y + yOffset,
          text: `${percent.toFixed(3)}`
        })
      })
    }
    return [
      {
        type: 'line',
        attrs: lines1
      },
      {
        type: 'line',
        attrs: lines2
      },
      {
        type: 'text',
        ignoreEvent: true,
        attrs: texts
      }
    ]
  }
}

export default fibonacciSpeedResistanceFan
