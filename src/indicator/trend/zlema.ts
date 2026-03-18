/**
 * ZLEMA - 零滞后指数移动平均线
 * ZLEMA = EMA(close + (close - close[lag]), period)
 * 其中 lag = floor((period - 1) / 2)
 * 通过补偿滞后来使 EMA 更贴近当前价格
 */
import { IndicatorTemplate, KLineData } from 'klinecharts'

const zlema: IndicatorTemplate = {
  name: 'ZLEMA',
  shortName: 'ZLEMA',
  calcParams: [21],
  figures: [
    { key: 'zlema', title: 'ZLEMA: ', type: 'line' }
  ],
  calc: (dataList: KLineData[], indicator) => {
    const params = indicator.calcParams
    const period = params[0] as number
    const lag = Math.floor((period - 1) / 2)
    const k = 2 / (period + 1)

    const result: any[] = []
    let prevZlema = 0

    for (let i = 0; i < dataList.length; i++) {
      const close = dataList[i].close
      // 获取滞后补偿价格
      const lagClose = i >= lag ? dataList[i - lag].close : close
      // 修正后的价格 = close + (close - close[lag])
      const adjusted = close + (close - lagClose)

      if (i === 0) {
        prevZlema = adjusted
        result.push({ zlema: i >= period - 1 ? prevZlema : undefined })
      } else {
        prevZlema = adjusted * k + prevZlema * (1 - k)
        result.push({ zlema: i >= period - 1 ? prevZlema : undefined })
      }
    }

    return result
  }
}

export default zlema
