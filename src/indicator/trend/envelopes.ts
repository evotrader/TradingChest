/**
 * Envelopes - 移动平均包络线
 * 在简单移动平均线上下各偏移固定百分比形成通道
 * 用于识别超买超卖区域和趋势方向
 */
import { IndicatorTemplate, KLineData } from 'klinecharts'

const envelopes: IndicatorTemplate = {
  name: 'ENVELOPES',
  shortName: 'Envelopes',
  calcParams: [20, 2.5],
  figures: [
    { key: 'middle', title: '中轨: ', type: 'line' },
    { key: 'upper', title: '上轨: ', type: 'line' },
    { key: 'lower', title: '下轨: ', type: 'line' }
  ],
  calc: (dataList: KLineData[], indicator) => {
    const params = indicator.calcParams
    const period = params[0] as number
    const percentage = params[1] as number

    return dataList.map((_, i) => {
      if (i < period - 1) {
        return { middle: undefined, upper: undefined, lower: undefined }
      }

      // 计算 SMA
      let sum = 0
      for (let j = i - period + 1; j <= i; j++) {
        sum += dataList[j].close
      }
      const sma = sum / period
      const offset = sma * percentage / 100

      return {
        middle: sma,
        upper: sma + offset,
        lower: sma - offset
      }
    })
  }
}

export default envelopes
