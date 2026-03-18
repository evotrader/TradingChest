/**
 * ADX - 平均趋向指数
 *
 * 衡量趋势的强度（不区分方向），同时输出 +DI 和 -DI 来表示方向。
 * +DM = high - prevHigh（仅正值且大于 -DM 时有效，否则为 0）
 * -DM = prevLow - low（仅正值且大于 +DM 时有效，否则为 0）
 * +DI = 100 * RMA(+DM, period) / ATR
 * -DI = 100 * RMA(-DM, period) / ATR
 * DX = 100 * |+DI - -DI| / (+DI + -DI)
 * ADX = RMA(DX, period)
 *
 * 所有平滑均使用 Wilder 平滑法（RMA）
 */
import { IndicatorTemplate, KLineData } from 'klinecharts'

const adx: IndicatorTemplate = {
  name: 'ADX',
  shortName: 'ADX',
  calcParams: [14],
  figures: [
    { key: 'adx', title: 'ADX: ', type: 'line' },
    { key: 'plusDi', title: '+DI: ', type: 'line' },
    { key: 'minusDi', title: '-DI: ', type: 'line' }
  ],
  calc: (dataList: KLineData[], indicator) => {
    const period = indicator.calcParams[0] as number
    const len = dataList.length
    const result: any[] = []

    if (len === 0) return result

    // 原始 +DM、-DM、TR 序列
    const plusDmRaw: number[] = new Array(len).fill(0)
    const minusDmRaw: number[] = new Array(len).fill(0)
    const trRaw: number[] = new Array(len).fill(0)

    for (let i = 0; i < len; i++) {
      if (i === 0) {
        trRaw[i] = dataList[i].high - dataList[i].low
      } else {
        const prevClose = dataList[i - 1].close
        const prevHigh = dataList[i - 1].high
        const prevLow = dataList[i - 1].low
        const high = dataList[i].high
        const low = dataList[i].low

        // 真实波幅
        trRaw[i] = Math.max(
          high - low,
          Math.abs(high - prevClose),
          Math.abs(low - prevClose)
        )

        // 方向运动
        const upMove = high - prevHigh
        const downMove = prevLow - low

        if (upMove > downMove && upMove > 0) {
          plusDmRaw[i] = upMove
        }
        if (downMove > upMove && downMove > 0) {
          minusDmRaw[i] = downMove
        }
      }
    }

    // Wilder 平滑（RMA）
    let smoothPlusDm = 0
    let smoothMinusDm = 0
    let smoothTr = 0
    let adxSmooth = 0
    let adxCount = 0

    for (let i = 0; i < len; i++) {
      if (i < period) {
        // 累积阶段
        smoothPlusDm += plusDmRaw[i]
        smoothMinusDm += minusDmRaw[i]
        smoothTr += trRaw[i]

        if (i === period - 1) {
          // 首个平滑值 = 累积和 / period（等价于 SMA 种子）
          smoothPlusDm /= period
          smoothMinusDm /= period
          smoothTr /= period

          const plusDi = smoothTr !== 0 ? 100 * smoothPlusDm / smoothTr : 0
          const minusDi = smoothTr !== 0 ? 100 * smoothMinusDm / smoothTr : 0
          const diSum = plusDi + minusDi
          const dx = diSum !== 0 ? 100 * Math.abs(plusDi - minusDi) / diSum : 0

          // 开始累积 DX 用于计算 ADX
          adxSmooth += dx
          adxCount = 1

          result.push({ adx: undefined, plusDi, minusDi })
        } else {
          result.push({ adx: undefined, plusDi: undefined, minusDi: undefined })
        }
      } else {
        // Wilder 递归平滑
        smoothPlusDm = (smoothPlusDm * (period - 1) + plusDmRaw[i]) / period
        smoothMinusDm = (smoothMinusDm * (period - 1) + minusDmRaw[i]) / period
        smoothTr = (smoothTr * (period - 1) + trRaw[i]) / period

        const plusDi = smoothTr !== 0 ? 100 * smoothPlusDm / smoothTr : 0
        const minusDi = smoothTr !== 0 ? 100 * smoothMinusDm / smoothTr : 0
        const diSum = plusDi + minusDi
        const dx = diSum !== 0 ? 100 * Math.abs(plusDi - minusDi) / diSum : 0

        adxCount++
        if (adxCount < period) {
          // 累积 DX 值
          adxSmooth += dx
          result.push({ adx: undefined, plusDi, minusDi })
        } else if (adxCount === period) {
          // 首个 ADX = DX 累积期的 SMA
          adxSmooth = (adxSmooth + dx) / period
          result.push({ adx: adxSmooth, plusDi, minusDi })
        } else {
          // ADX 的 Wilder 平滑
          adxSmooth = (adxSmooth * (period - 1) + dx) / period
          result.push({ adx: adxSmooth, plusDi, minusDi })
        }
      }
    }

    return result
  }
}

export default adx
