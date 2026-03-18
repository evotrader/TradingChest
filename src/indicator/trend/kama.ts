/**
 * KAMA - 考夫曼自适应移动平均线
 * 根据市场效率比率（ER）动态调整平滑常数
 * 趋势明显时响应快，震荡时响应慢
 */
import { IndicatorTemplate, KLineData } from 'klinecharts'

const kama: IndicatorTemplate = {
  name: 'KAMA',
  shortName: 'KAMA',
  calcParams: [10, 2, 30],
  figures: [
    { key: 'kama', title: 'KAMA: ', type: 'line' }
  ],
  calc: (dataList: KLineData[], indicator) => {
    const params = indicator.calcParams
    const period = params[0] as number
    const fastPeriod = params[1] as number
    const slowPeriod = params[2] as number

    // 快速与慢速平滑常数
    const fastSc = 2 / (fastPeriod + 1)
    const slowSc = 2 / (slowPeriod + 1)

    const result: any[] = []
    let prevKama = 0

    for (let i = 0; i < dataList.length; i++) {
      if (i < period) {
        // 数据不足，KAMA 初始值取第 period 根 K 线的收盘价
        if (i === period - 1) {
          prevKama = dataList[i].close
          result.push({ kama: prevKama })
        } else {
          result.push({ kama: undefined })
        }
        continue
      }

      const close = dataList[i].close

      // 方向：|close - close[period 之前]|
      const direction = Math.abs(close - dataList[i - period].close)

      // 波动：period 个周期内相邻收盘价绝对差之和
      let volatility = 0
      for (let j = i - period + 1; j <= i; j++) {
        volatility += Math.abs(dataList[j].close - dataList[j - 1].close)
      }

      // 效率比率
      const er = volatility !== 0 ? direction / volatility : 0

      // 自适应平滑常数
      const sc = Math.pow(er * (fastSc - slowSc) + slowSc, 2)

      // KAMA = 前值 + sc * (close - 前值)
      prevKama = prevKama + sc * (close - prevKama)
      result.push({ kama: prevKama })
    }

    return result
  }
}

export default kama
