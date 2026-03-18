/**
 * Linear Regression - 线性回归通道
 * 使用最小二乘法拟合直线，并计算上下通道
 * 通道宽度基于标准差
 */
import { IndicatorTemplate, KLineData } from 'klinecharts'

const linearRegression: IndicatorTemplate = {
  name: 'LINEARREGRESSION',
  shortName: 'LinReg',
  calcParams: [14],
  figures: [
    { key: 'value', title: '回归: ', type: 'line' },
    { key: 'upper', title: '上轨: ', type: 'line' },
    { key: 'lower', title: '下轨: ', type: 'line' }
  ],
  calc: (dataList: KLineData[], indicator) => {
    const params = indicator.calcParams
    const period = params[0] as number

    return dataList.map((_, i) => {
      if (i < period - 1) {
        return { value: undefined, upper: undefined, lower: undefined }
      }

      // 最小二乘法：y = a + b * x，x 取 0 到 period-1
      let sumX = 0
      let sumY = 0
      let sumXY = 0
      let sumX2 = 0

      for (let j = 0; j < period; j++) {
        const x = j
        const y = dataList[i - period + 1 + j].close
        sumX += x
        sumY += y
        sumXY += x * y
        sumX2 += x * x
      }

      const n = period
      const denominator = n * sumX2 - sumX * sumX
      // 斜率和截距
      const b = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0
      const a = (sumY - b * sumX) / n

      // 回归线终点值（x = period - 1）
      const regValue = a + b * (period - 1)

      // 计算标准差作为通道宽度
      let sumSqDiff = 0
      for (let j = 0; j < period; j++) {
        const y = dataList[i - period + 1 + j].close
        const yHat = a + b * j
        sumSqDiff += (y - yHat) * (y - yHat)
      }
      const stdDev = Math.sqrt(sumSqDiff / period)

      return {
        value: regValue,
        upper: regValue + 2 * stdDev,
        lower: regValue - 2 * stdDev
      }
    })
  }
}

export default linearRegression
