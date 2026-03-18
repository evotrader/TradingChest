/**
 * PPO - 百分比价格振荡器
 *
 * 与 MACD 类似，但使用百分比表示，便于跨标的比较。
 * PPO = (EMA_fast - EMA_slow) / EMA_slow * 100
 * Signal = EMA(PPO, signalPeriod)
 * Histogram = PPO - Signal
 */
import { IndicatorTemplate, KLineData } from 'klinecharts'

const ppo: IndicatorTemplate = {
  name: 'PPO',
  shortName: 'PPO',
  calcParams: [12, 26, 9],
  figures: [
    { key: 'ppo', title: 'PPO: ', type: 'line' },
    { key: 'signal', title: 'Signal: ', type: 'line' },
    { key: 'histogram', title: 'Hist: ', type: 'line' }
  ],
  calc: (dataList: KLineData[], indicator) => {
    const params = indicator.calcParams
    const fastPeriod = params[0] as number
    const slowPeriod = params[1] as number
    const signalPeriod = params[2] as number
    const len = dataList.length
    const result: any[] = []

    // ---- 计算快速 EMA ----
    const emaFast: (number | null)[] = new Array(len).fill(null)
    const kFast = 2 / (fastPeriod + 1)
    let prevEmaFast: number | null = null
    for (let i = 0; i < len; i++) {
      const close = dataList[i].close
      if (i < fastPeriod - 1) {
        // 累积阶段
      } else if (i === fastPeriod - 1) {
        let sum = 0
        for (let j = 0; j < fastPeriod; j++) sum += dataList[j].close
        prevEmaFast = sum / fastPeriod
        emaFast[i] = prevEmaFast
      } else {
        prevEmaFast = close * kFast + prevEmaFast! * (1 - kFast)
        emaFast[i] = prevEmaFast
      }
    }

    // ---- 计算慢速 EMA ----
    const emaSlow: (number | null)[] = new Array(len).fill(null)
    const kSlow = 2 / (slowPeriod + 1)
    let prevEmaSlow: number | null = null
    for (let i = 0; i < len; i++) {
      const close = dataList[i].close
      if (i < slowPeriod - 1) {
        // 累积阶段
      } else if (i === slowPeriod - 1) {
        let sum = 0
        for (let j = 0; j < slowPeriod; j++) sum += dataList[j].close
        prevEmaSlow = sum / slowPeriod
        emaSlow[i] = prevEmaSlow
      } else {
        prevEmaSlow = close * kSlow + prevEmaSlow! * (1 - kSlow)
        emaSlow[i] = prevEmaSlow
      }
    }

    // ---- 计算 PPO 序列 ----
    const ppoLine: (number | null)[] = new Array(len).fill(null)
    for (let i = 0; i < len; i++) {
      if (emaFast[i] !== null && emaSlow[i] !== null && emaSlow[i] !== 0) {
        ppoLine[i] = ((emaFast[i] as number) - (emaSlow[i] as number)) / (emaSlow[i] as number) * 100
      }
    }

    // ---- 计算 Signal 线（对 PPO 做 EMA） ----
    const signalLine: (number | null)[] = new Array(len).fill(null)
    const kSignal = 2 / (signalPeriod + 1)
    let prevSignal: number | null = null
    let signalSeedCount = 0
    let signalSeedSum = 0

    for (let i = 0; i < len; i++) {
      if (ppoLine[i] === null) continue

      if (prevSignal === null) {
        signalSeedCount++
        signalSeedSum += ppoLine[i] as number
        if (signalSeedCount === signalPeriod) {
          prevSignal = signalSeedSum / signalPeriod
          signalLine[i] = prevSignal
        }
      } else {
        prevSignal = (ppoLine[i] as number) * kSignal + prevSignal * (1 - kSignal)
        signalLine[i] = prevSignal
      }
    }

    // ---- 组装输出 ----
    for (let i = 0; i < len; i++) {
      const p = ppoLine[i]
      const s = signalLine[i]
      result.push({
        ppo: p !== null ? p : undefined,
        signal: s !== null ? s : undefined,
        histogram: p !== null && s !== null ? (p as number) - (s as number) : undefined
      })
    }

    return result
  }
}

export default ppo
