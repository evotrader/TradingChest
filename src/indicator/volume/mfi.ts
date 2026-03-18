/**
 * MFI - 资金流量指数（Money Flow Index）
 * 基于典型价格和成交量的动量指标，也被称为"成交量加权 RSI"
 * 输出范围 0-100
 *
 * 计算步骤：
 * 1. 典型价格 = (最高价 + 最低价 + 收盘价) / 3
 * 2. 原始资金流量 = 典型价格 * 成交量
 * 3. 正资金流量：典型价格上升时的原始资金流量之和（过去 n 期）
 * 4. 负资金流量：典型价格下降时的原始资金流量之和（过去 n 期）
 * 5. 资金流量比率 = 正资金流量 / 负资金流量
 * 6. MFI = 100 - 100 / (1 + 资金流量比率)
 */
import { IndicatorTemplate, KLineData } from 'klinecharts'

const mfi: IndicatorTemplate = {
  name: 'MFI',
  shortName: 'MFI',
  calcParams: [14],
  figures: [
    { key: 'mfi', title: 'MFI: ', type: 'line' }
  ],
  calc: (dataList: KLineData[], indicator) => {
    const params = indicator.calcParams
    const period = params[0] as number
    const result: any[] = []

    // 预先计算每根 K 线的典型价格和原始资金流量
    const typicalPrices: number[] = []
    const rawMoneyFlows: number[] = []

    for (let i = 0; i < dataList.length; i++) {
      const kline = dataList[i]
      const tp = (kline.high + kline.low + kline.close) / 3
      typicalPrices.push(tp)
      rawMoneyFlows.push(tp * (kline.volume ?? 0))
    }

    for (let i = 0; i < dataList.length; i++) {
      // 需要至少 period + 1 根 K 线（因为需要比较典型价格方向）
      if (i < period) {
        result.push({ mfi: undefined })
        continue
      }

      // 计算窗口内的正负资金流量
      let positiveFlow = 0
      let negativeFlow = 0

      for (let j = i - period + 1; j <= i; j++) {
        if (typicalPrices[j] > typicalPrices[j - 1]) {
          positiveFlow += rawMoneyFlows[j]
        } else if (typicalPrices[j] < typicalPrices[j - 1]) {
          negativeFlow += rawMoneyFlows[j]
        }
        // 典型价格不变时不计入任何一方
      }

      if (negativeFlow === 0) {
        // 无负资金流量，MFI 为 100
        result.push({ mfi: 100 })
      } else {
        const moneyFlowRatio = positiveFlow / negativeFlow
        result.push({ mfi: 100 - 100 / (1 + moneyFlowRatio) })
      }
    }
    return result
  }
}

export default mfi
