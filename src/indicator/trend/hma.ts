/**
 * HMA - Hull 移动平均线
 * HMA = WMA(2 * WMA(n/2) - WMA(n), sqrt(n))
 * 同时保持平滑度和减少滞后
 */
import { IndicatorTemplate, KLineData } from 'klinecharts'

/**
 * 计算 WMA 值序列
 */
function calcWmaArray(values: (number | undefined)[], period: number): (number | undefined)[] {
  const weightSum = period * (period + 1) / 2
  const result: (number | undefined)[] = []

  for (let i = 0; i < values.length; i++) {
    if (i < period - 1 || values[i] === undefined) {
      result.push(undefined)
      continue
    }
    let sum = 0
    let valid = true
    for (let j = 0; j < period; j++) {
      const val = values[i - period + 1 + j]
      if (val === undefined) {
        valid = false
        break
      }
      sum += val * (j + 1)
    }
    result.push(valid ? sum / weightSum : undefined)
  }
  return result
}

const hma: IndicatorTemplate = {
  name: 'HMA',
  shortName: 'HMA',
  calcParams: [9],
  figures: [
    { key: 'hma', title: 'HMA: ', type: 'line' }
  ],
  calc: (dataList: KLineData[], indicator) => {
    const params = indicator.calcParams
    const period = params[0] as number
    const halfPeriod = Math.floor(period / 2)
    const sqrtPeriod = Math.round(Math.sqrt(period))

    const closes = dataList.map(k => k.close)

    // WMA(n/2) 和 WMA(n)
    const wmaHalf = calcWmaArray(closes, halfPeriod)
    const wmaFull = calcWmaArray(closes, period)

    // 中间序列：2 * WMA(n/2) - WMA(n)
    const diffSeries: (number | undefined)[] = []
    for (let i = 0; i < dataList.length; i++) {
      if (wmaHalf[i] !== undefined && wmaFull[i] !== undefined) {
        diffSeries.push(2 * wmaHalf[i]! - wmaFull[i]!)
      } else {
        diffSeries.push(undefined)
      }
    }

    // 对中间序列再做 WMA(sqrt(n))
    const hmaValues = calcWmaArray(diffSeries, sqrtPeriod)

    return dataList.map((_, i) => ({
      hma: hmaValues[i]
    }))
  }
}

export default hma
