/**
 * KVO - 克林格成交量振荡器（Klinger Volume Oscillator）
 * 通过成交量和价格趋势的关系预测价格反转
 *
 * 计算步骤：
 * 1. 趋势方向：当前典型价格 > 前一典型价格时为 +1，否则为 -1
 *    典型价格 = (最高价 + 最低价 + 收盘价) / 3（此处简化用 HLC 之和）
 * 2. dm = 最高价 - 最低价
 * 3. cm = 如果趋势方向不变则 cm = 前一 cm + dm，否则 cm = 前一 dm + dm
 * 4. 成交量力度（Volume Force）= volume * |2 * dm/cm - 1| * trend * 100
 *    当 cm 为零时，成交量力度为 0
 * 5. KVO = EMA(VF, 快线周期) - EMA(VF, 慢线周期)
 * 6. 信号线 = EMA(KVO, 信号周期)
 */
import { IndicatorTemplate, KLineData } from 'klinecharts'

const klingerOscillator: IndicatorTemplate = {
  name: 'KVO',
  shortName: 'KVO',
  calcParams: [34, 55, 13],
  figures: [
    { key: 'kvo', title: 'KVO: ', type: 'line' },
    { key: 'signal', title: 'Signal: ', type: 'line' }
  ],
  calc: (dataList: KLineData[], indicator) => {
    const params = indicator.calcParams
    const fastPeriod = params[0] as number
    const slowPeriod = params[1] as number
    const signalPeriod = params[2] as number
    const result: any[] = []

    if (dataList.length === 0) {
      return result
    }

    // 第一步：计算成交量力度数组
    const vf: number[] = []
    let prevTrend = 0
    let prevDm = 0
    let cm = 0

    for (let i = 0; i < dataList.length; i++) {
      const kline = dataList[i]
      // 使用 HLC 之和作为典型价格的代理（单调性相同）
      const hlc = kline.high + kline.low + kline.close
      const dm = kline.high - kline.low

      if (i === 0) {
        // 第一根 K 线无法判断趋势方向
        prevTrend = 0
        prevDm = dm
        cm = dm
        vf.push(0)
      } else {
        const prevHlc = dataList[i - 1].high + dataList[i - 1].low + dataList[i - 1].close
        const trend = hlc > prevHlc ? 1 : -1

        // cm 累积：趋势方向不变时累加，方向改变时重置
        if (trend === prevTrend) {
          cm = cm + dm
        } else {
          cm = prevDm + dm
        }

        // 计算成交量力度
        if (cm === 0) {
          vf.push(0)
        } else {
          const vol = kline.volume ?? 0
          vf.push(vol * Math.abs(2 * (dm / cm) - 1) * trend * 100)
        }

        prevTrend = trend
        prevDm = dm
      }
    }

    // 第二步：计算快慢 EMA
    const fastEma = calcEmaArray(vf, fastPeriod)
    const slowEma = calcEmaArray(vf, slowPeriod)

    // 第三步：计算 KVO 和信号线
    const kvoValues: number[] = []
    for (let i = 0; i < dataList.length; i++) {
      if (fastEma[i] !== null && slowEma[i] !== null) {
        kvoValues.push(fastEma[i]! - slowEma[i]!)
      } else {
        kvoValues.push(0)
      }
    }

    // 信号线：对 KVO 值做 EMA
    // 信号线的起点需要等 KVO 有效后才开始计算
    const slowStart = slowPeriod - 1
    const validKvo: number[] = []
    for (let i = slowStart; i < kvoValues.length; i++) {
      validKvo.push(kvoValues[i])
    }
    const signalEma = calcEmaArray(validKvo, signalPeriod)

    for (let i = 0; i < dataList.length; i++) {
      if (fastEma[i] === null || slowEma[i] === null) {
        result.push({ kvo: undefined, signal: undefined })
      } else {
        const kvoVal = kvoValues[i]
        const signalIdx = i - slowStart
        const signalVal = signalIdx >= 0 && signalIdx < signalEma.length
          ? signalEma[signalIdx]
          : null
        result.push({
          kvo: kvoVal,
          signal: signalVal ?? undefined
        })
      }
    }
    return result
  }
}

/**
 * 内联 EMA 计算（避免外部依赖）
 * 权重因子 k = 2 / (period + 1)
 * 首个有效值使用 SMA 作为种子
 */
function calcEmaArray(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = []
  const k = 2 / (period + 1)
  let prevEma: number | null = null

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null)
    } else if (i === period - 1) {
      // 用前 period 个数据的 SMA 作为 EMA 种子值
      let sum = 0
      for (let j = 0; j < period; j++) {
        sum += data[j]
      }
      prevEma = sum / period
      result.push(prevEma)
    } else {
      prevEma = data[i] * k + prevEma! * (1 - k)
      result.push(prevEma)
    }
  }
  return result
}

export default klingerOscillator
