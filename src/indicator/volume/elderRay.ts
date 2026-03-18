/**
 * Elder Ray - 艾尔德射线
 * 由 Alexander Elder 提出，分解多空力量为牛力和熊力
 *
 * 计算公式：
 * EMA = 收盘价的 n 期指数移动平均
 * 牛力（Bull Power）= 最高价 - EMA
 * 熊力（Bear Power）= 最低价 - EMA
 *
 * 牛力 > 0 表示多方控制，熊力 < 0 表示空方控制
 * EMA 权重因子 k = 2 / (n + 1)，首个有效值使用 SMA 种子
 */
import { IndicatorTemplate, KLineData } from 'klinecharts'

const elderRay: IndicatorTemplate = {
  name: 'ELDER_RAY',
  shortName: 'Elder Ray',
  calcParams: [13],
  figures: [
    { key: 'bullPower', title: 'Bull: ', type: 'line' },
    { key: 'bearPower', title: 'Bear: ', type: 'line' }
  ],
  calc: (dataList: KLineData[], indicator) => {
    const params = indicator.calcParams
    const period = params[0] as number
    const result: any[] = []

    // 内联计算收盘价的 EMA
    const k = 2 / (period + 1)
    let prevEma: number | null = null

    for (let i = 0; i < dataList.length; i++) {
      const kline = dataList[i]

      if (i < period - 1) {
        // 数据不足，尚未产生第一个 EMA
        result.push({ bullPower: undefined, bearPower: undefined })
      } else if (i === period - 1) {
        // 用前 period 个收盘价的 SMA 作为 EMA 种子
        let sum = 0
        for (let j = 0; j < period; j++) {
          sum += dataList[j].close
        }
        prevEma = sum / period

        result.push({
          bullPower: kline.high - prevEma,
          bearPower: kline.low - prevEma
        })
      } else {
        // EMA 递归
        prevEma = kline.close * k + prevEma! * (1 - k)

        result.push({
          bullPower: kline.high - prevEma,
          bearPower: kline.low - prevEma
        })
      }
    }
    return result
  }
}

export default elderRay
