/**
 * Donchian Channels - 唐奇安通道
 * 以过去 N 周期最高价和最低价构成的价格通道
 */
import { IndicatorTemplate, KLineData } from 'klinecharts'

const donchianChannels: IndicatorTemplate = {
  name: 'DC',
  shortName: 'DC',
  calcParams: [20],
  figures: [
    { key: 'upper', title: 'UP: ', type: 'line' },
    { key: 'lower', title: 'LOW: ', type: 'line' },
    { key: 'middle', title: 'MID: ', type: 'line' }
  ],
  calc: (dataList: KLineData[], indicator) => {
    const params = indicator.calcParams
    const period = params[0] as number
    const result: any[] = []

    for (let i = 0; i < dataList.length; i++) {
      if (i < period - 1) {
        // 数据不足，无法计算完整周期
        result.push({ upper: undefined, lower: undefined, middle: undefined })
        continue
      }

      // 在回看窗口内查找最高价和最低价
      let highestHigh = -Infinity
      let lowestLow = Infinity
      for (let j = i - period + 1; j <= i; j++) {
        if (dataList[j].high > highestHigh) {
          highestHigh = dataList[j].high
        }
        if (dataList[j].low < lowestLow) {
          lowestLow = dataList[j].low
        }
      }

      const middle = (highestHigh + lowestLow) / 2
      result.push({
        upper: highestHigh,
        lower: lowestLow,
        middle: middle
      })
    }
    return result
  }
}

export default donchianChannels
