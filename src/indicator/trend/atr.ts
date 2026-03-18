/**
 * ATR - 平均真实波幅
 * 使用 Wilder 平滑法（RMA）计算真实波幅的移动平均
 */
import { IndicatorTemplate, KLineData } from 'klinecharts'

const atr: IndicatorTemplate = {
  name: 'ATR',
  shortName: 'ATR',
  calcParams: [14],
  figures: [
    { key: 'atr', title: 'ATR: ', type: 'line' }
  ],
  calc: (dataList: KLineData[], indicator) => {
    const params = indicator.calcParams
    const period = params[0] as number
    const result: any[] = []
    let prevAtr = 0

    for (let i = 0; i < dataList.length; i++) {
      const kline = dataList[i]
      // 计算真实波幅（True Range）
      let tr: number
      if (i === 0) {
        tr = kline.high - kline.low
      } else {
        const prevClose = dataList[i - 1].close
        tr = Math.max(
          kline.high - kline.low,
          Math.abs(kline.high - prevClose),
          Math.abs(kline.low - prevClose)
        )
      }

      if (i < period) {
        // 累积阶段：收集前 period 个 TR 用于首次平均
        prevAtr += tr
        if (i === period - 1) {
          prevAtr = prevAtr / period
          result.push({ atr: prevAtr })
        } else {
          result.push({ atr: undefined })
        }
      } else {
        // Wilder 平滑：RMA = (prevATR * (period - 1) + TR) / period
        prevAtr = (prevAtr * (period - 1) + tr) / period
        result.push({ atr: prevAtr })
      }
    }
    return result
  }
}

export default atr
