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
 * 综合测量工具（类似 TradingView 的日期和价格区间测量）
 * 两次点击确定矩形区域，同时显示价格变动、涨跌幅、K 线根数及时间跨度
 * 上涨绿色，下跌红色
 */
const dateAndPriceRange: OverlayTemplate = {
  name: 'dateAndPriceRange',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay, precision }) => {
    if (coordinates.length > 1) {
      const points = overlay.points
      const price1 = points[0].value!
      const price2 = points[1].value!
      const ts1 = points[0].timestamp!
      const ts2 = points[1].timestamp!

      // 计算价格差和涨跌幅
      const priceDiff = price2 - price1
      const percentChange = (priceDiff / price1) * 100
      const isUp = priceDiff >= 0

      // 根据 x 坐标近似估算 K 线根数
      const bars = Math.abs(Math.round((coordinates[1].x - coordinates[0].x) / 10))

      // 计算时间跨度
      const timeDiffMs = Math.abs(ts2 - ts1)
      const durationText = formatDuration(timeDiffMs)

      // 上涨绿色，下跌红色
      const fillColor = isUp
        ? 'rgba(38, 166, 154, 0.15)'
        : 'rgba(239, 83, 80, 0.15)'
      const borderColor = isUp
        ? 'rgba(38, 166, 154, 0.6)'
        : 'rgba(239, 83, 80, 0.6)'

      // 格式化显示文本：价格差 / 涨跌幅 / K 线数 / 时间
      const sign = priceDiff >= 0 ? '+' : ''
      const line1 = `${sign}${priceDiff.toFixed(precision.price)}  (${sign}${percentChange.toFixed(2)}%)`
      const line2 = `${bars} 根  |  ${durationText}`

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
        // 对角连线（起点到终点）
        {
          type: 'line',
          attrs: { coordinates: [coordinates[0], coordinates[1]] },
          styles: { style: 'dashed', color: borderColor }
        },
        // 第一行文本：价格差和涨跌幅
        {
          type: 'rectText',
          ignoreEvent: true,
          attrs: {
            x: textX,
            y: textY - 10,
            text: line1,
            baseline: 'bottom',
            align: 'center'
          }
        },
        // 第二行文本：K 线数和时间跨度
        {
          type: 'rectText',
          ignoreEvent: true,
          attrs: {
            x: textX,
            y: textY + 10,
            text: line2,
            baseline: 'top',
            align: 'center'
          }
        }
      ]
    }
    return []
  }
}

/**
 * 将毫秒时间差格式化为可读文本
 * 根据跨度自动选择合适的单位
 */
function formatDuration (ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) {
    const remainHours = hours % 24
    return remainHours > 0 ? `${days}天${remainHours}小时` : `${days}天`
  }
  if (hours > 0) {
    const remainMinutes = minutes % 60
    return remainMinutes > 0 ? `${hours}小时${remainMinutes}分` : `${hours}小时`
  }
  if (minutes > 0) {
    return `${minutes}分钟`
  }
  return `${seconds}秒`
}

export default dateAndPriceRange
