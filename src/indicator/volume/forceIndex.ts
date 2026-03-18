/**
 * Force Index - 力度指数
 * 由 Alexander Elder 提出，结合价格变化和成交量衡量多空力量
 *
 * 计算公式：
 * 原始力度 = (当前收盘价 - 前一收盘价) * 当前成交量
 * Force Index = EMA(原始力度, n)
 *
 * EMA 权重因子 k = 2 / (n + 1)，首个有效值使用 SMA 种子
 */
import { IndicatorTemplate, KLineData } from 'klinecharts'

const forceIndex: IndicatorTemplate = {
  name: 'FI',
  shortName: 'FI',
  calcParams: [13],
  figures: [
    { key: 'fi', title: 'FI: ', type: 'line' }
  ],
  calc: (dataList: KLineData[], indicator) => {
    const params = indicator.calcParams
    const period = params[0] as number
    const result: any[] = []

    if (dataList.length === 0) {
      return result
    }

    // 第一步：计算每根 K 线的原始力度
    const rawForce: number[] = []
    for (let i = 0; i < dataList.length; i++) {
      if (i === 0) {
        // 第一根 K 线无前收盘价，原始力度为 0
        rawForce.push(0)
      } else {
        const priceChange = dataList[i].close - dataList[i - 1].close
        rawForce.push(priceChange * (dataList[i].volume ?? 0))
      }
    }

    // 第二步：对原始力度做 EMA 平滑
    const k = 2 / (period + 1)
    let prevEma: number | null = null

    for (let i = 0; i < dataList.length; i++) {
      if (i < period - 1) {
        // 数据不足一个完整周期
        result.push({ fi: undefined })
      } else if (i === period - 1) {
        // 用前 period 个原始力度的 SMA 作为 EMA 种子
        let sum = 0
        for (let j = 0; j < period; j++) {
          sum += rawForce[j]
        }
        prevEma = sum / period
        result.push({ fi: prevEma })
      } else {
        // EMA 递归
        prevEma = rawForce[i] * k + prevEma! * (1 - k)
        result.push({ fi: prevEma })
      }
    }
    return result
  }
}

export default forceIndex
