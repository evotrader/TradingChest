/**
 * ZigZag - 之字转向指标
 * 连接价格的显著波峰与波谷，过滤小于阈值百分比的波动
 *
 * 参数：
 *   calcParams[0] = 偏差阈值百分比（默认 5%）
 *
 * 算法逻辑：
 *   1. 从第一根 K 线开始，记录初始高低点
 *   2. 当价格从最近的低点反弹超过阈值%，确认低点为波谷
 *   3. 当价格从最近的高点回落超过阈值%，确认高点为波峰
 *   4. 在确认的波峰/波谷处标记数值，其余位置为 undefined
 *   5. 最终将相邻标记点之间做线性插值，形成连续的折线
 */
import { IndicatorTemplate, KLineData } from 'klinecharts'

const zigzag: IndicatorTemplate = {
  name: 'ZIGZAG',
  shortName: 'ZigZag',
  calcParams: [5],
  figures: [
    { key: 'zigzag', title: 'ZigZag: ', type: 'line' }
  ],
  calc: (dataList: KLineData[], indicator) => {
    const params = indicator.calcParams
    const deviation = (params[0] as number) / 100

    if (dataList.length === 0) {
      return []
    }

    // 第一步：识别所有显著的波峰和波谷
    // pivots 记录 [index, value] 的确认转折点
    const pivots: Array<[number, number]> = []

    // 趋势方向：1 = 正在寻找波峰（上升中），-1 = 正在寻找波谷（下降中）
    let trend = 0
    let lastHigh = dataList[0].high
    let lastLow = dataList[0].low
    let lastHighIdx = 0
    let lastLowIdx = 0

    for (let i = 1; i < dataList.length; i++) {
      const kline = dataList[i]

      if (trend === 0) {
        // 初始状态，确定初始方向
        if (kline.high >= lastHigh * (1 + deviation)) {
          // 初始上升趋势，确认起始低点为第一个波谷
          pivots.push([lastLowIdx, lastLow])
          trend = 1
          lastHigh = kline.high
          lastHighIdx = i
        } else if (kline.low <= lastLow * (1 - deviation)) {
          // 初始下降趋势，确认起始高点为第一个波峰
          pivots.push([lastHighIdx, lastHigh])
          trend = -1
          lastLow = kline.low
          lastLowIdx = i
        } else {
          // 未超过阈值，持续更新极值
          if (kline.high > lastHigh) {
            lastHigh = kline.high
            lastHighIdx = i
          }
          if (kline.low < lastLow) {
            lastLow = kline.low
            lastLowIdx = i
          }
        }
      } else if (trend === 1) {
        // 上升趋势中，寻找波峰
        if (kline.high > lastHigh) {
          // 继续创新高，更新候选波峰
          lastHigh = kline.high
          lastHighIdx = i
        }
        if (kline.low <= lastHigh * (1 - deviation)) {
          // 从高点回落超过阈值，确认波峰
          pivots.push([lastHighIdx, lastHigh])
          trend = -1
          lastLow = kline.low
          lastLowIdx = i
        }
      } else {
        // 下降趋势中，寻找波谷
        if (kline.low < lastLow) {
          // 继续创新低，更新候选波谷
          lastLow = kline.low
          lastLowIdx = i
        }
        if (kline.high >= lastLow * (1 + deviation)) {
          // 从低点反弹超过阈值，确认波谷
          pivots.push([lastLowIdx, lastLow])
          trend = 1
          lastHigh = kline.high
          lastHighIdx = i
        }
      }
    }

    // 添加最后一个未确认的端点（当前趋势的候选极值）
    if (trend === 1) {
      pivots.push([lastHighIdx, lastHigh])
    } else if (trend === -1) {
      pivots.push([lastLowIdx, lastLow])
    } else if (pivots.length === 0 && dataList.length > 0) {
      // 整个数据范围内都没有超过阈值的波动
      // 不绘制任何线段
    }

    // 第二步：在相邻转折点之间做线性插值，生成连续折线
    const result: any[] = new Array(dataList.length)
    for (let i = 0; i < dataList.length; i++) {
      result[i] = { zigzag: undefined }
    }

    if (pivots.length < 2) {
      // 转折点不足两个，无法绘制折线
      return result
    }

    for (let p = 0; p < pivots.length - 1; p++) {
      const [startIdx, startVal] = pivots[p]
      const [endIdx, endVal] = pivots[p + 1]
      const span = endIdx - startIdx

      for (let i = startIdx; i <= endIdx; i++) {
        // 线性插值
        const ratio = span === 0 ? 0 : (i - startIdx) / span
        result[i] = { zigzag: startVal + (endVal - startVal) * ratio }
      }
    }

    return result
  }
}

export default zigzag
