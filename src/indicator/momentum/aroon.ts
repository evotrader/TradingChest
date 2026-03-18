/**
 * Aroon - 阿隆指标
 *
 * 衡量自最近最高价/最低价以来经过的时间，判断趋势方向与强度。
 * AroonUp = ((period - 距最高价天数) / period) * 100
 * AroonDown = ((period - 距最低价天数) / period) * 100
 * Aroon Oscillator = AroonUp - AroonDown
 */
import { IndicatorTemplate, KLineData } from 'klinecharts'

const aroon: IndicatorTemplate = {
  name: 'AROON',
  shortName: 'Aroon',
  calcParams: [25],
  figures: [
    { key: 'aroonUp', title: 'Up: ', type: 'line' },
    { key: 'aroonDown', title: 'Down: ', type: 'line' },
    { key: 'oscillator', title: 'Osc: ', type: 'line' }
  ],
  calc: (dataList: KLineData[], indicator) => {
    const period = indicator.calcParams[0] as number
    const len = dataList.length
    const result: any[] = []

    for (let i = 0; i < len; i++) {
      if (i < period) {
        // 数据不足一个完整周期
        result.push({
          aroonUp: undefined,
          aroonDown: undefined,
          oscillator: undefined
        })
        continue
      }

      // 在 [i - period, i] 窗口内查找最高价和最低价的位置
      let highestIdx = i - period
      let lowestIdx = i - period
      let highestVal = dataList[i - period].high
      let lowestVal = dataList[i - period].low

      for (let j = i - period + 1; j <= i; j++) {
        // 相同值时取最近的（用 >= 和 <=）
        if (dataList[j].high >= highestVal) {
          highestVal = dataList[j].high
          highestIdx = j
        }
        if (dataList[j].low <= lowestVal) {
          lowestVal = dataList[j].low
          lowestIdx = j
        }
      }

      const daysSinceHigh = i - highestIdx
      const daysSinceLow = i - lowestIdx

      const aroonUp = ((period - daysSinceHigh) / period) * 100
      const aroonDown = ((period - daysSinceLow) / period) * 100
      const oscillator = aroonUp - aroonDown

      result.push({ aroonUp, aroonDown, oscillator })
    }

    return result
  }
}

export default aroon
