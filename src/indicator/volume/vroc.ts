/**
 * VROC - 成交量变化率（Volume Rate of Change）
 * 衡量当前成交量相对于 n 期前成交量的百分比变化
 *
 * 计算公式：
 * VROC = (当前成交量 - n 期前成交量) / n 期前成交量 * 100
 *
 * 当 n 期前成交量为零时无法计算，返回 undefined
 */
import { IndicatorTemplate, KLineData } from 'klinecharts'

const vroc: IndicatorTemplate = {
  name: 'VROC',
  shortName: 'VROC',
  calcParams: [14],
  figures: [
    { key: 'vroc', title: 'VROC: ', type: 'line' }
  ],
  calc: (dataList: KLineData[], indicator) => {
    const params = indicator.calcParams
    const period = params[0] as number
    const result: any[] = []

    for (let i = 0; i < dataList.length; i++) {
      if (i < period) {
        // 数据不足 n 期，无法计算变化率
        result.push({ vroc: undefined })
      } else {
        const prevVol = dataList[i - period].volume ?? 0
        const curVol = dataList[i].volume ?? 0

        if (prevVol === 0) {
          // n 期前成交量为零，除法无意义
          result.push({ vroc: undefined })
        } else {
          result.push({ vroc: ((curVol - prevVol) / prevVol) * 100 })
        }
      }
    }
    return result
  }
}

export default vroc
