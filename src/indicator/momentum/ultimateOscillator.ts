/**
 * Ultimate Oscillator - 终极震荡指标
 *
 * Larry Williams 设计的多时间框架动量指标，综合三个周期的买入压力与真实波幅之比。
 * BP (Buying Pressure) = close - min(low, prevClose)
 * TR (True Range) = max(high, prevClose) - min(low, prevClose)
 * UO = 100 * (4 * avg7 + 2 * avg14 + avg28) / 7
 * 其中 avgN = sum(BP, N) / sum(TR, N)
 * 输出范围 0-100
 */
import { IndicatorTemplate, KLineData } from 'klinecharts'

const ultimateOscillator: IndicatorTemplate = {
  name: 'UO',
  shortName: 'UO',
  calcParams: [7, 14, 28],
  figures: [
    { key: 'uo', title: 'UO: ', type: 'line' }
  ],
  calc: (dataList: KLineData[], indicator) => {
    const params = indicator.calcParams
    const period1 = params[0] as number
    const period2 = params[1] as number
    const period3 = params[2] as number
    const maxPeriod = Math.max(period1, period2, period3)
    const len = dataList.length
    const result: any[] = []

    // 预计算 BP 和 TR 序列（从索引 1 开始有效）
    const bp: number[] = new Array(len).fill(0)
    const tr: number[] = new Array(len).fill(0)

    for (let i = 1; i < len; i++) {
      const prevClose = dataList[i - 1].close
      const low = dataList[i].low
      const high = dataList[i].high
      const close = dataList[i].close

      bp[i] = close - Math.min(low, prevClose)
      tr[i] = Math.max(high, prevClose) - Math.min(low, prevClose)
    }

    // 滚动求和用于三个周期
    // 使用累积和数组，方便区间求和
    const bpCum: number[] = new Array(len + 1).fill(0)
    const trCum: number[] = new Array(len + 1).fill(0)
    for (let i = 0; i < len; i++) {
      bpCum[i + 1] = bpCum[i] + bp[i]
      trCum[i + 1] = trCum[i] + tr[i]
    }

    for (let i = 0; i < len; i++) {
      // 需要至少 maxPeriod 个有效数据点（从索引 1 开始）
      if (i < maxPeriod) {
        result.push({ uo: undefined })
        continue
      }

      // 区间 [i - periodN + 1, i] 的和
      const bpSum1 = bpCum[i + 1] - bpCum[i - period1 + 1]
      const trSum1 = trCum[i + 1] - trCum[i - period1 + 1]
      const bpSum2 = bpCum[i + 1] - bpCum[i - period2 + 1]
      const trSum2 = trCum[i + 1] - trCum[i - period2 + 1]
      const bpSum3 = bpCum[i + 1] - bpCum[i - period3 + 1]
      const trSum3 = trCum[i + 1] - trCum[i - period3 + 1]

      // 防除零
      if (trSum1 === 0 || trSum2 === 0 || trSum3 === 0) {
        result.push({ uo: undefined })
        continue
      }

      const avg1 = bpSum1 / trSum1
      const avg2 = bpSum2 / trSum2
      const avg3 = bpSum3 / trSum3

      // 加权平均：短周期权重 4，中周期权重 2，长周期权重 1
      const uo = 100 * (4 * avg1 + 2 * avg2 + avg3) / 7

      result.push({ uo })
    }

    return result
  }
}

export default ultimateOscillator
