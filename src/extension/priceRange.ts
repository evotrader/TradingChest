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

import { OverlayTemplate } from 'klinecharts'

/**
 * 价格区间测量工具
 * 两次点击确定价格区间，显示价格差、涨跌幅百分比、K线根数
 * 上涨显示绿色，下跌显示红色
 */
const priceRange: OverlayTemplate = {
  name: 'priceRange',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay, precision }) => {
    if (coordinates.length > 1) {
      const points = overlay.points
      // @ts-expect-error
      const price1: number = points[0].value
      // @ts-expect-error
      const price2: number = points[1].value

      // 计算价格差和涨跌幅
      const priceDiff = price2 - price1
      const percentChange = (priceDiff / price1) * 100
      const isUp = priceDiff >= 0

      // 根据 x 坐标近似估算 K 线根数
      const bars = Math.abs(Math.round((coordinates[1].x - coordinates[0].x) / 10))

      // 矩形区域的边界
      const minX = Math.min(coordinates[0].x, coordinates[1].x)
      const maxX = Math.max(coordinates[0].x, coordinates[1].x)
      const minY = Math.min(coordinates[0].y, coordinates[1].y)
      const maxY = Math.max(coordinates[0].y, coordinates[1].y)
      const width = maxX - minX
      const height = maxY - minY

      // 上涨绿色，下跌红色
      const fillColor = isUp
        ? 'rgba(38, 166, 154, 0.15)'
        : 'rgba(239, 83, 80, 0.15)'
      const borderColor = isUp
        ? 'rgba(38, 166, 154, 0.6)'
        : 'rgba(239, 83, 80, 0.6)'

      // 格式化显示文本
      const sign = priceDiff >= 0 ? '+' : ''
      const displayText = `${sign}${priceDiff.toFixed(precision.price)}  (${sign}${percentChange.toFixed(2)}%)  ${bars} 根`

      // 文本位置：矩形中间
      const textX = (coordinates[0].x + coordinates[1].x) / 2
      const textY = (coordinates[0].y + coordinates[1].y) / 2

      return [
        // 填充矩形
        {
          type: 'polygon',
          ignoreEvent: true,
          attrs: {
            coordinates: [
              coordinates[0],
              { x: coordinates[1].x, y: coordinates[0].y },
              coordinates[1],
              { x: coordinates[0].x, y: coordinates[1].y }
            ]
          },
          styles: { style: 'fill', color: fillColor }
        },
        // 边框线
        {
          type: 'line',
          attrs: [
            { coordinates: [coordinates[0], { x: coordinates[1].x, y: coordinates[0].y }] },
            { coordinates: [{ x: coordinates[1].x, y: coordinates[0].y }, coordinates[1]] },
            { coordinates: [coordinates[1], { x: coordinates[0].x, y: coordinates[1].y }] },
            { coordinates: [{ x: coordinates[0].x, y: coordinates[1].y }, coordinates[0]] }
          ],
          styles: { color: borderColor }
        },
        // 测量文本
        {
          type: 'rectText',
          ignoreEvent: true,
          attrs: {
            x: textX,
            y: textY,
            text: displayText,
            baseline: 'middle',
            align: 'center'
          }
        }
      ]
    }
    return []
  }
}

export default priceRange
