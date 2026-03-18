/**
 * Historical Volatility - 历史波动率
 * 对数收益率的年化标准差，使用 sqrt(252) 进行年化
 */
import { IndicatorTemplate, KLineData } from 'klinecharts'

const historicalVolatility: IndicatorTemplate = {
  name: 'HV',
  shortName: 'HV',
  calcParams: [20],
  figures: [
    { key: 'hv', title: 'HV: ', type: 'line' }
  ],
  calc: (dataList: KLineData[], indicator) => {
    const params = indicator.calcParams
    const period = params[0] as number
    const result: any[] = []

    // 年化因子：sqrt(252 个交易日)
    const annualizationFactor = Math.sqrt(252)

    for (let i = 0; i < dataList.length; i++) {
      // 需要 period 个对数收益率，即 period + 1 个数据点（从 i - period 到 i）
      // 所以最早可计算的位置是 i = period
      if (i < period) {
        result.push({ hv: undefined })
        continue
      }

      // 计算回看窗口内的对数收益率
      const logReturns: number[] = []
      for (let j = i - period + 1; j <= i; j++) {
        const prevClose = dataList[j - 1].close
        const currClose = dataList[j].close
        // 防止除零或负值
        if (prevClose > 0 && currClose > 0) {
          logReturns.push(Math.log(currClose / prevClose))
        }
      }

      if (logReturns.length < 2) {
        result.push({ hv: undefined })
        continue
      }

      // 计算均值
      let sum = 0
      for (let k = 0; k < logReturns.length; k++) {
        sum += logReturns[k]
      }
      const mean = sum / logReturns.length

      // 计算样本方差（使用 n-1 贝塞尔校正）
      let varianceSum = 0
      for (let k = 0; k < logReturns.length; k++) {
        const diff = logReturns[k] - mean
        varianceSum += diff * diff
      }
      const variance = varianceSum / (logReturns.length - 1)

      // 年化标准差
      const hv = Math.sqrt(variance) * annualizationFactor

      result.push({ hv: hv })
    }
    return result
  }
}

export default historicalVolatility
