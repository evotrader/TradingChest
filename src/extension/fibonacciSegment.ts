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

import {canProjectAxisValue,toolLevels} from './numerics'

const fibonacciSegment: OverlayTemplate = {
  name: 'fibonacciSegment',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay, chart, yAxis }) => {
    const lines: LineAttrs[] = []
    const texts: TextAttrs[] = []
    if (coordinates.length > 1) {
      const textX = coordinates[1].x > coordinates[0].x ? coordinates[0].x : coordinates[1].x
      const percents = toolLevels(overlay)
      const yDif = coordinates[0].y - coordinates[1].y
      const points = overlay.points
      const valueDif = points[0].value! - points[1].value!
      if(percents.some(percent=>!canProjectAxisValue(yAxis,points[1].value! + valueDif * percent)))return [{type:'rectText',attrs:{...coordinates[0],text:'当前价格轴不能显示此级别，请调整级别或切换线性轴'}}]
      percents.forEach(percent => {
        const value=points[1].value!+valueDif*percent
        const y = yAxis!.convertToPixel(value)
        const price = (points[1].value! + valueDif * percent).toFixed((chart.getSymbol()?.pricePrecision ?? 2))
        lines.push({ coordinates: [{ x: coordinates[0].x, y }, { x: coordinates[1].x, y }] })
        texts.push({
          x: textX,
          y,
          text: `${price} (${(percent * 100).toFixed(1)}%)`,
          baseline: 'bottom'
        })
      })
    }
    return [
      {
        type: 'line',
        attrs: lines
      }, {
        type: 'text',
        ignoreEvent: true,
        attrs: texts
      }
    ]
  }
}

export default fibonacciSegment
