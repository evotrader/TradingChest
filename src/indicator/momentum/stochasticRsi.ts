/**
 * Stochastic RSI - 随机相对强弱指数
 *
 * 将 RSI 值代入随机指标公式，衡量 RSI 在自身历史区间内的相对位置。
 * StochRSI = (RSI - lowest(RSI, stochPeriod)) / (highest(RSI, stochPeriod) - lowest(RSI, stochPeriod))
 * K = SMA(StochRSI, kSmooth)
 * D = SMA(K, dSmooth)
 * 输出范围 0-1（部分平台显示为 0-100，此处使用 0-1）
 */
import { IndicatorTemplate, KLineData } from 'klinecharts'

const stochasticRsi: IndicatorTemplate = {
  name: 'StochRSI',
  shortName: 'StochRSI',
  calcParams: [14, 14, 3, 3],
  figures: [
    { key: 'k', title: 'K: ', type: 'line' },
    { key: 'd', title: 'D: ', type: 'line' }
  ],
  calc: (dataList: KLineData[], indicator) => {
    const params = indicator.calcParams
    const rsiPeriod = params[0] as number
    const stochPeriod = params[1] as number
    const kSmooth = params[2] as number
    const dSmooth = params[3] as number
    const len = dataList.length

    // ---- 第一步：计算 RSI（Wilder 平滑法） ----
    const rsi: (number | null)[] = new Array(len).fill(null)
    let avgGain = 0
    let avgLoss = 0

    for (let i = 1; i < len; i++) {
      const diff = dataList[i].close - dataList[i - 1].close
      const gain = diff > 0 ? diff : 0
      const loss = diff < 0 ? -diff : 0

      if (i < rsiPeriod) {
        // 累积阶段
        avgGain += gain
        avgLoss += loss
      } else if (i === rsiPeriod) {
        // 首个 RSI：用 SMA 作为种子
        avgGain = (avgGain + gain) / rsiPeriod
        avgLoss = (avgLoss + loss) / rsiPeriod
        if (avgLoss === 0) {
          rsi[i] = 100
        } else {
          rsi[i] = 100 - 100 / (1 + avgGain / avgLoss)
        }
      } else {
        // Wilder 递归平滑
        avgGain = (avgGain * (rsiPeriod - 1) + gain) / rsiPeriod
        avgLoss = (avgLoss * (rsiPeriod - 1) + loss) / rsiPeriod
        if (avgLoss === 0) {
          rsi[i] = 100
        } else {
          rsi[i] = 100 - 100 / (1 + avgGain / avgLoss)
        }
      }
    }

    // ---- 第二步：在 RSI 序列上计算随机指标 ----
    const stochRsi: (number | null)[] = new Array(len).fill(null)
    for (let i = 0; i < len; i++) {
      if (rsi[i] === null) continue
      // 回溯 stochPeriod 个有效 RSI 值
      let lowest = Infinity
      let highest = -Infinity
      let validCount = 0
      for (let j = i; j >= 0 && validCount < stochPeriod; j--) {
        if (rsi[j] !== null) {
          const v = rsi[j] as number
          if (v < lowest) lowest = v
          if (v > highest) highest = v
          validCount++
        }
      }
      if (validCount < stochPeriod) continue
      // 分母为零时（RSI 区间内无变化），输出 0
      if (highest === lowest) {
        stochRsi[i] = 0
      } else {
        stochRsi[i] = ((rsi[i] as number) - lowest) / (highest - lowest)
      }
    }

    // ---- 第三步：K = SMA(StochRSI, kSmooth)，D = SMA(K, dSmooth) ----
    // 对有效值序列做 SMA
    const kLine: (number | null)[] = new Array(len).fill(null)
    const dLine: (number | null)[] = new Array(len).fill(null)

    // K 线：对 stochRsi 做滑动平均
    let kBuf: number[] = []
    let kSum = 0
    for (let i = 0; i < len; i++) {
      if (stochRsi[i] !== null) {
        kBuf.push(stochRsi[i] as number)
        kSum += stochRsi[i] as number
        if (kBuf.length > kSmooth) {
          kSum -= kBuf[kBuf.length - kSmooth - 1]
        }
        if (kBuf.length >= kSmooth) {
          kLine[i] = kSum / kSmooth
          // 修正：重新计算窗口内的精确和，避免浮点漂移
          if (kBuf.length > kSmooth) {
            let s = 0
            for (let w = kBuf.length - kSmooth; w < kBuf.length; w++) {
              s += kBuf[w]
            }
            kLine[i] = s / kSmooth
          }
        }
      }
    }

    // D 线：对 K 线做滑动平均
    let dBuf: number[] = []
    for (let i = 0; i < len; i++) {
      if (kLine[i] !== null) {
        dBuf.push(kLine[i] as number)
        if (dBuf.length >= dSmooth) {
          let s = 0
          for (let w = dBuf.length - dSmooth; w < dBuf.length; w++) {
            s += dBuf[w]
          }
          dLine[i] = s / dSmooth
        }
      }
    }

    // ---- 组装输出 ----
    const result: any[] = []
    for (let i = 0; i < len; i++) {
      result.push({
        k: kLine[i] !== null ? kLine[i] : undefined,
        d: dLine[i] !== null ? dLine[i] : undefined
      })
    }
    return result
  }
}

export default stochasticRsi
