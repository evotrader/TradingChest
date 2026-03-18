/**
 * WMA - 加权移动平均线
 * 对近期数据赋予更高权重：权重 = 1, 2, 3, ..., n
 * WMA = Σ(close_i * weight_i) / Σ(weight_i)
 */
import { IndicatorTemplate, KLineData } from 'klinecharts'

const wma: IndicatorTemplate = {
  name: 'WMA',
  shortName: 'WMA',
  calcParams: [9],
  figures: [
    { key: 'wma', title: 'WMA: ', type: 'line' }
  ],
  calc: (dataList: KLineData[], indicator) => {
    const params = indicator.calcParams
    const period = params[0] as number
    // 权重之和 = n * (n + 1) / 2
    const weightSum = period * (period + 1) / 2

    return dataList.map((_, i) => {
      if (i < period - 1) {
        return { wma: undefined }
      }
      let sum = 0
      for (let j = 0; j < period; j++) {
        // 权重从 1（最旧）到 period（最新）
        sum += dataList[i - period + 1 + j].close * (j + 1)
      }
      return { wma: sum / weightSum }
    })
  }
}

export default wma
