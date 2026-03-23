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
 * 时间区间测量工具
 * 两次点击确定时间区间，显示垂直阴影带、K 线根数及时间跨度
 */
const dateRange: OverlayTemplate = {
  name: 'dateRange',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, bounding, overlay }) => {
    if (coordinates.length > 1) {
      const points = overlay.points
      const ts1 = points[0].timestamp!
      const ts2 = points[1].timestamp!

      // 计算时间差（毫秒）
      const timeDiffMs = Math.abs(ts2 - ts1)

      // 根据 x 坐标近似估算 K 线根数
      const bars = Math.abs(Math.round((coordinates[1].x - coordinates[0].x) / 10))

      // 格式化时间跨度为可读文本
      const durationText = formatDuration(timeDiffMs)

      // 垂直阴影带：从图表顶部到底部
      const minX = Math.min(coordinates[0].x, coordinates[1].x)
      const maxX = Math.max(coordinates[0].x, coordinates[1].x)
      const width = maxX - minX
      const chartHeight = bounding.height

      // 显示文本
      const displayText = `${bars} 根  |  ${durationText}`
      const textX = (coordinates[0].x + coordinates[1].x) / 2
      const textY = coordinates[0].y

      return [
        // 垂直阴影区域
        {
          type: 'polygon',
          ignoreEvent: true,
          attrs: {
            coordinates: [
              { x: minX, y: 0 },
              { x: maxX, y: 0 },
              { x: maxX, y: chartHeight },
              { x: minX, y: chartHeight }
            ]
          },
          styles: { style: 'fill', color: 'rgba(22, 119, 255, 0.1)' }
        },
        // 左右垂直边界线
        {
          type: 'line',
          attrs: [
            { coordinates: [{ x: coordinates[0].x, y: 0 }, { x: coordinates[0].x, y: chartHeight }] },
            { coordinates: [{ x: coordinates[1].x, y: 0 }, { x: coordinates[1].x, y: chartHeight }] }
          ],
          styles: { style: 'dashed', color: 'rgba(22, 119, 255, 0.5)' }
        },
        // 测量文本
        {
          type: 'rectText',
          ignoreEvent: true,
          attrs: {
            x: textX,
            y: textY,
            text: displayText,
            baseline: 'bottom',
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

export default dateRange
