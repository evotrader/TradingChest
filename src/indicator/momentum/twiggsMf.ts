/**
 * Twiggs Money Flow - 特威格斯资金流
 *
 * Colin Twiggs 对 Chaikin Money Flow 的改进版，使用 Wilder 平滑法消除
 * 标准 CMF 在窗口边界处的突变问题。
 *
 * True Range High (TRH) = max(high, prevClose)
 * True Range Low (TRL) = min(low, prevClose)
 * AD = volume * (2 * close - TRL - TRH) / (TRH - TRL)
 *   当 TRH == TRL 时，AD = 0（无价格波动）
 * TMF = Wilder_SMA(AD, period) / Wilder_SMA(volume, period)
 */
import { IndicatorTemplate, KLineData } from 'klinecharts'

const twiggsMf: IndicatorTemplate = {
  name: 'TMF',
  shortName: 'TMF',
  calcParams: [21],
  figures: [
    { key: 'tmf', title: 'TMF: ', type: 'line' }
  ],
  calc: (dataList: KLineData[], indicator) => {
    const period = indicator.calcParams[0] as number
    const len = dataList.length
    const result: any[] = []

    if (len === 0) return result

    // ---- 计算 AD 和 volume 序列 ----
    const ad: number[] = new Array(len).fill(0)
    const vol: number[] = new Array(len).fill(0)

    for (let i = 0; i < len; i++) {
      const kline = dataList[i]
      const volume = kline.volume ?? 0
      vol[i] = volume

      if (i === 0) {
        // 第一根 K 线无前收盘价，使用当根 high/low 作为 TR 范围
        const range = kline.high - kline.low
        if (range === 0) {
          ad[i] = 0
        } else {
          ad[i] = volume * (2 * kline.close - kline.low - kline.high) / range
        }
      } else {
        const prevClose = dataList[i - 1].close
        const trh = Math.max(kline.high, prevClose)
        const trl = Math.min(kline.low, prevClose)
        const range = trh - trl

        if (range === 0) {
          ad[i] = 0
        } else {
          ad[i] = volume * (2 * kline.close - trl - trh) / range
        }
      }
    }

    // ---- Wilder 平滑（RMA）AD 和 Volume ----
    let smoothAd = 0
    let smoothVol = 0

    for (let i = 0; i < len; i++) {
      if (i < period - 1) {
        // 累积阶段
        smoothAd += ad[i]
        smoothVol += vol[i]
        result.push({ tmf: undefined })
      } else if (i === period - 1) {
        // 首个平滑值 = 累积和的 SMA
        smoothAd = (smoothAd + ad[i]) / period
        smoothVol = (smoothVol + vol[i]) / period

        if (smoothVol === 0) {
          result.push({ tmf: 0 })
        } else {
          result.push({ tmf: smoothAd / smoothVol })
        }
      } else {
        // Wilder 递归平滑
        smoothAd = (smoothAd * (period - 1) + ad[i]) / period
        smoothVol = (smoothVol * (period - 1) + vol[i]) / period

        if (smoothVol === 0) {
          result.push({ tmf: 0 })
        } else {
          result.push({ tmf: smoothAd / smoothVol })
        }
      }
    }

    return result
  }
}

export default twiggsMf
