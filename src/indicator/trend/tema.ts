/**
 * TEMA - 三重指数移动平均线
 * TEMA = 3 * EMA - 3 * EMA(EMA) + EMA(EMA(EMA))
 * 进一步减少滞后，比 DEMA 响应更快
 */
import { IndicatorTemplate, KLineData } from 'klinecharts'

const tema: IndicatorTemplate = {
  name: 'TEMA',
  shortName: 'TEMA',
  calcParams: [21],
  figures: [
    { key: 'tema', title: 'TEMA: ', type: 'line' }
  ],
  calc: (dataList: KLineData[], indicator) => {
    const params = indicator.calcParams
    const period = params[0] as number
    const k = 2 / (period + 1)

    const ema1: number[] = []
    const ema2: number[] = []
    const ema3: number[] = []

    for (let i = 0; i < dataList.length; i++) {
      const close = dataList[i].close

      if (i === 0) {
        ema1.push(close)
        ema2.push(close)
        ema3.push(close)
      } else {
        const e1 = close * k + ema1[i - 1] * (1 - k)
        ema1.push(e1)
        const e2 = e1 * k + ema2[i - 1] * (1 - k)
        ema2.push(e2)
        const e3 = e2 * k + ema3[i - 1] * (1 - k)
        ema3.push(e3)
      }
    }

    return dataList.map((_, i) => {
      if (i < period - 1) {
        return { tema: undefined }
      }
      return { tema: 3 * ema1[i] - 3 * ema2[i] + ema3[i] }
    })
  }
}

export default tema
