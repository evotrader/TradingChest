/**
 * DPO - 去趋势价格振荡器
 *
 * 消除长期趋势，仅显示短期价格周期。
 * DPO = close - SMA(close, period) 向左偏移 (period/2 + 1) 根
 * 等价于：DPO[i] = close[i] - SMA(close, period)[i - period/2 - 1 所对应的 K 线]
 * 实际实现：DPO[i] = close[i] - SMA[i - floor(period/2) - 1] 处的 SMA 值
 *
 * 注意：标准 DPO 不使用最近的数据来计算 SMA，而是回看 floor(period/2)+1 根之前的 SMA。
 * 这意味着我们需要用 i 时刻的收盘价减去 (floor(period/2)+1) 根之前计算好的 SMA。
 * 但更常见的公式是：DPO[i] = close[i] - SMA(close, period) 在索引 i 处的值回移。
 * 标准实现：DPO[i] = close[i] - SMA_at(i - floor(period/2) - 1)
 * 其中 SMA_at(j) = 以 j 为终点的 period 周期 SMA
 */
import { IndicatorTemplate, KLineData } from 'klinecharts'

const dpo: IndicatorTemplate = {
  name: 'DPO',
  shortName: 'DPO',
  calcParams: [20],
  figures: [
    { key: 'dpo', title: 'DPO: ', type: 'line' }
  ],
  calc: (dataList: KLineData[], indicator) => {
    const period = indicator.calcParams[0] as number
    const len = dataList.length
    const result: any[] = []

    // 偏移量
    const shift = Math.floor(period / 2) + 1

    // 先计算完整的 SMA 序列
    const sma: (number | null)[] = new Array(len).fill(null)
    let windowSum = 0
    for (let i = 0; i < len; i++) {
      windowSum += dataList[i].close
      if (i >= period) {
        windowSum -= dataList[i - period].close
      }
      if (i >= period - 1) {
        sma[i] = windowSum / period
      }
    }

    // DPO[i] = close[i] - SMA[i - shift]
    for (let i = 0; i < len; i++) {
      const smaIdx = i - shift
      if (smaIdx < 0 || sma[smaIdx] === null) {
        result.push({ dpo: undefined })
      } else {
        result.push({ dpo: dataList[i].close - (sma[smaIdx] as number) })
      }
    }

    return result
  }
}

export default dpo
