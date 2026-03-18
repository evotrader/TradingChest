/**
 * VWMA - 成交量加权移动平均线
 * VWMA = SMA(close * volume, n) / SMA(volume, n)
 * 在成交量较大的价格区域赋予更多权重
 */
import { IndicatorTemplate, KLineData } from 'klinecharts'

const vwma: IndicatorTemplate = {
  name: 'VWMA',
  shortName: 'VWMA',
  calcParams: [20],
  figures: [
    { key: 'vwma', title: 'VWMA: ', type: 'line' }
  ],
  calc: (dataList: KLineData[], indicator) => {
    const params = indicator.calcParams
    const period = params[0] as number

    return dataList.map((_, i) => {
      if (i < period - 1) {
        return { vwma: undefined }
      }
      let cvSum = 0
      let vSum = 0
      for (let j = i - period + 1; j <= i; j++) {
        const vol = dataList[j].volume ?? 0
        cvSum += dataList[j].close * vol
        vSum += vol
      }
      // 无成交量时退化为简单均线
      if (vSum === 0) {
        let closeSum = 0
        for (let j = i - period + 1; j <= i; j++) {
          closeSum += dataList[j].close
        }
        return { vwma: closeSum / period }
      }
      return { vwma: cvSum / vSum }
    })
  }
}

export default vwma
