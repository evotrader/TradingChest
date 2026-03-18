/**
 * DEMA - 双重指数移动平均线
 * DEMA = 2 * EMA(close) - EMA(EMA(close))
 * 比普通 EMA 更贴近价格，滞后更小
 */
import { IndicatorTemplate, KLineData } from 'klinecharts'

const dema: IndicatorTemplate = {
  name: 'DEMA',
  shortName: 'DEMA',
  calcParams: [21],
  figures: [
    { key: 'dema', title: 'DEMA: ', type: 'line' }
  ],
  calc: (dataList: KLineData[], indicator) => {
    const params = indicator.calcParams
    const period = params[0] as number
    const k = 2 / (period + 1)

    // 第一层 EMA
    const ema1: number[] = []
    // 第二层 EMA（对第一层 EMA 再做 EMA）
    const ema2: number[] = []

    for (let i = 0; i < dataList.length; i++) {
      const close = dataList[i].close

      if (i === 0) {
        ema1.push(close)
        ema2.push(close)
      } else {
        const e1 = close * k + ema1[i - 1] * (1 - k)
        ema1.push(e1)
        const e2 = e1 * k + ema2[i - 1] * (1 - k)
        ema2.push(e2)
      }
    }

    return dataList.map((_, i) => {
      if (i < period - 1) {
        return { dema: undefined }
      }
      return { dema: 2 * ema1[i] - ema2[i] }
    })
  }
}

export default dema
