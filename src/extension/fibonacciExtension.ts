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

const fibonacciExtension: OverlayTemplate = {
  name: 'fibonacciExtension',
  totalStep: 4,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay, chart, yAxis }) => {
    const fbLines: LineAttrs[] = []
    const texts: TextAttrs[] = []
    if (coordinates.length > 2) {
      const points = overlay.points
      const valueDif = points[1].value! - points[0].value!
      const yDif = coordinates[1].y - coordinates[0].y
      const percents = toolLevels(overlay)
      const textX = coordinates[2].x > coordinates[1].x ? coordinates[1].x : coordinates[2].x
      if(percents.some(percent=>!canProjectAxisValue(yAxis,points[2].value! + valueDif * percent)))return [{type:'rectText',attrs:{...coordinates[0],text:'当前价格轴不能显示此级别，请调整级别或切换线性轴'}}]
      percents.forEach(percent => {
        const value=points[2].value!+valueDif*percent
        const y = yAxis!.convertToPixel(value)
        const price = (points[2].value! + valueDif * percent).toFixed((chart.getSymbol()?.pricePrecision ?? 2))
        fbLines.push({ coordinates: [{ x: coordinates[1].x, y }, { x: coordinates[2].x, y }] })
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
        attrs: { coordinates },
        styles: { style: 'dashed' }
      },
      {
        type: 'line',
        attrs: fbLines
      },
      {
        type: 'text',
        ignoreEvent: true,
        attrs: texts
      }
    ]
  }
}

export default fibonacciExtension
