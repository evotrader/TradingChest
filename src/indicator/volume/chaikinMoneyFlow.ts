/**
 * CMF - 蔡金资金流量（Chaikin Money Flow）
 * 衡量一段时间内资金流入流出的强度
 *
 * 计算公式：
 * 资金流量乘数 = ((收盘价 - 最低价) - (最高价 - 收盘价)) / (最高价 - 最低价)
 * 资金流量成交量 = 资金流量乘数 * 成交量
 * CMF = SUM(资金流量成交量, n) / SUM(成交量, n)
 *
 * 当最高价等于最低价时（无波动），资金流量乘数设为 0
 */
import { IndicatorTemplate, KLineData } from 'klinecharts'

const chaikinMoneyFlow: IndicatorTemplate = {
  name: 'CMF',
  shortName: 'CMF',
  calcParams: [20],
  figures: [
    { key: 'cmf', title: 'CMF: ', type: 'line' }
  ],
  calc: (dataList: KLineData[], indicator) => {
    const params = indicator.calcParams
    const period = params[0] as number
    const result: any[] = []

    // 预先计算每根 K 线的资金流量成交量
    const mfVolumes: number[] = []

    for (let i = 0; i < dataList.length; i++) {
      const kline = dataList[i]
      const hl = kline.high - kline.low
      if (hl === 0) {
        // 最高价等于最低价，无法判断资金方向，乘数为 0
        mfVolumes.push(0)
      } else {
        // 资金流量乘数：衡量收盘价在当日波幅中的相对位置
        const mfMultiplier = ((kline.close - kline.low) - (kline.high - kline.close)) / hl
        mfVolumes.push(mfMultiplier * (kline.volume ?? 0))
      }
    }

    // 使用滑动窗口计算 CMF
    let sumMfv = 0
    let sumVol = 0

    for (let i = 0; i < dataList.length; i++) {
      sumMfv += mfVolumes[i]
      sumVol += dataList[i].volume ?? 0

      if (i >= period) {
        // 滑出窗口最旧的值
        sumMfv -= mfVolumes[i - period]
        sumVol -= dataList[i - period].volume ?? 0
      }

      if (i < period - 1) {
        // 数据不足一个完整周期
        result.push({ cmf: undefined })
      } else if (sumVol === 0) {
        // 窗口内总成交量为零
        result.push({ cmf: 0 })
      } else {
        result.push({ cmf: sumMfv / sumVol })
      }
    }
    return result
  }
}

export default chaikinMoneyFlow
