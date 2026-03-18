/**
 * Ichimoku Cloud - 一目均衡图
 * 包含转换线、基准线、先行带A/B、迟行带五条线
 */
import { IndicatorTemplate, KLineData } from 'klinecharts'

/**
 * 计算指定区间内的最高价与最低价的中间值
 */
function midPoint(dataList: KLineData[], endIndex: number, period: number): number | undefined {
  if (endIndex < period - 1) return undefined
  let high = -Infinity
  let low = Infinity
  for (let i = endIndex - period + 1; i <= endIndex; i++) {
    if (dataList[i].high > high) high = dataList[i].high
    if (dataList[i].low < low) low = dataList[i].low
  }
  return (high + low) / 2
}

const ichimoku: IndicatorTemplate = {
  name: 'ICHIMOKU',
  shortName: 'Ichimoku',
  calcParams: [9, 26, 52, 26],
  figures: [
    { key: 'tenkanSen', title: '转换线: ', type: 'line' },
    { key: 'kijunSen', title: '基准线: ', type: 'line' },
    { key: 'senkouSpanA', title: '先行带A: ', type: 'line' },
    { key: 'senkouSpanB', title: '先行带B: ', type: 'line' },
    { key: 'chikouSpan', title: '迟行带: ', type: 'line' }
  ],
  calc: (dataList: KLineData[], indicator) => {
    const params = indicator.calcParams
    const tenkanPeriod = params[0] as number
    const kijunPeriod = params[1] as number
    const senkouBPeriod = params[2] as number
    const displacement = params[3] as number

    // 先计算各条线的原始值
    const tenkanArr: (number | undefined)[] = []
    const kijunArr: (number | undefined)[] = []
    const spanAArr: (number | undefined)[] = []
    const spanBArr: (number | undefined)[] = []

    for (let i = 0; i < dataList.length; i++) {
      const tenkan = midPoint(dataList, i, tenkanPeriod)
      const kijun = midPoint(dataList, i, kijunPeriod)
      tenkanArr.push(tenkan)
      kijunArr.push(kijun)

      // 先行带 A = (转换线 + 基准线) / 2
      if (tenkan !== undefined && kijun !== undefined) {
        spanAArr.push((tenkan + kijun) / 2)
      } else {
        spanAArr.push(undefined)
      }

      // 先行带 B = (senkouBPeriod 周期内最高价 + 最低价) / 2
      spanBArr.push(midPoint(dataList, i, senkouBPeriod))
    }

    // 组装结果，先行带需要前移 displacement 个周期，迟行带需要后移 displacement 个周期
    const totalLength = dataList.length + displacement
    const result: any[] = []

    for (let i = 0; i < totalLength; i++) {
      const item: any = {}

      if (i < dataList.length) {
        item.tenkanSen = tenkanArr[i]
        item.kijunSen = kijunArr[i]
      }

      // 先行带：当前位置的值来自 displacement 个周期之前
      const spanSrcIdx = i - displacement
      if (spanSrcIdx >= 0 && spanSrcIdx < dataList.length) {
        item.senkouSpanA = spanAArr[spanSrcIdx]
        item.senkouSpanB = spanBArr[spanSrcIdx]
      }

      // 迟行带：将当前收盘价显示在 displacement 个周期之前
      const chikouSrcIdx = i + displacement
      if (chikouSrcIdx < dataList.length) {
        item.chikouSpan = dataList[chikouSrcIdx].close
      }

      result.push(item)
    }

    return result
  }
}

export default ichimoku
