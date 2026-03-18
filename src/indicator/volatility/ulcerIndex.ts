/**
 * Ulcer Index - 溃疡指数
 * 衡量价格从最高点回撤的深度和持续时间，反映下行风险
 * UI = sqrt(sum(pctDrawdown^2) / n)
 */
import { IndicatorTemplate, KLineData } from 'klinecharts'

const ulcerIndex: IndicatorTemplate = {
  name: 'UI',
  shortName: 'UI',
  calcParams: [14],
  figures: [
    { key: 'ui', title: 'UI: ', type: 'line' }
  ],
  calc: (dataList: KLineData[], indicator) => {
    const params = indicator.calcParams
    const period = params[0] as number
    const result: any[] = []

    for (let i = 0; i < dataList.length; i++) {
      if (i < period - 1) {
        // 数据不足一个完整周期
        result.push({ ui: undefined })
        continue
      }

      // 在回看窗口内找到最高收盘价
      let highestClose = -Infinity
      for (let j = i - period + 1; j <= i; j++) {
        if (dataList[j].close > highestClose) {
          highestClose = dataList[j].close
        }
      }

      // 计算百分比回撤的平方和
      let sumSquared = 0
      for (let j = i - period + 1; j <= i; j++) {
        // 百分比回撤 = (close - highestClose) / highestClose * 100
        const pctDrawdown = ((dataList[j].close - highestClose) / highestClose) * 100
        sumSquared += pctDrawdown * pctDrawdown
      }

      // 溃疡指数 = sqrt(平均平方回撤)
      const ui = Math.sqrt(sumSquared / period)

      result.push({ ui: ui })
    }
    return result
  }
}

export default ulcerIndex
