/**
 * AD Line - 累积/派发线（Accumulation/Distribution Line）
 * 通过价格和成交量的关系衡量累积的资金流入或流出
 *
 * 计算公式：
 * 资金流量乘数 = ((收盘价 - 最低价) - (最高价 - 收盘价)) / (最高价 - 最低价)
 * 资金流量成交量 = 资金流量乘数 * 成交量
 * AD = 前一期 AD + 当期资金流量成交量
 *
 * 当最高价等于最低价时（无波动），资金流量乘数设为 0
 */
import { IndicatorTemplate, KLineData } from 'klinecharts'

const adLine: IndicatorTemplate = {
  name: 'AD',
  shortName: 'AD',
  calcParams: [],
  figures: [
    { key: 'ad', title: 'AD: ', type: 'line' }
  ],
  calc: (dataList: KLineData[], _indicator) => {
    const result: any[] = []
    let ad = 0

    for (let i = 0; i < dataList.length; i++) {
      const kline = dataList[i]
      const hl = kline.high - kline.low

      if (hl !== 0) {
        // 资金流量乘数：收盘价越接近最高价，值越接近 +1；越接近最低价，值越接近 -1
        const mfMultiplier = ((kline.close - kline.low) - (kline.high - kline.close)) / hl
        ad += mfMultiplier * (kline.volume ?? 0)
      }
      // 最高价等于最低价时，资金流量为 0，AD 值不变

      result.push({ ad })
    }
    return result
  }
}

export default adLine
