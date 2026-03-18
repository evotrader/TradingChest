/**
 * Mass Index - 质量指数
 * 通过计算 EMA(H-L) 与 EMA(EMA(H-L)) 的比值之和来检测趋势反转
 * 当指标超过 27 然后回落到 26.5 以下时，形成"反转膨胀"信号
 */
import { IndicatorTemplate, KLineData } from 'klinecharts'

const massIndex: IndicatorTemplate = {
  name: 'MI',
  shortName: 'MI',
  calcParams: [9, 25],
  figures: [
    { key: 'mi', title: 'MI: ', type: 'line' }
  ],
  calc: (dataList: KLineData[], indicator) => {
    const params = indicator.calcParams
    const emaPeriod = params[0] as number
    const sumPeriod = params[1] as number
    const result: any[] = []

    // EMA 平滑系数
    const emaK = 2 / (emaPeriod + 1)

    // 第一步：计算 (High - Low) 的单次 EMA
    const singleEma: number[] = []
    let singleEmaVal = 0
    let singleCumSum = 0

    for (let i = 0; i < dataList.length; i++) {
      const hl = dataList[i].high - dataList[i].low

      if (i < emaPeriod) {
        singleCumSum += hl
        if (i === emaPeriod - 1) {
          singleEmaVal = singleCumSum / emaPeriod
          singleEma.push(singleEmaVal)
        } else {
          singleEma.push(0)
        }
      } else {
        singleEmaVal = hl * emaK + singleEmaVal * (1 - emaK)
        singleEma.push(singleEmaVal)
      }
    }

    // 第二步：计算单次 EMA 的二次 EMA
    const doubleEma: number[] = []
    let doubleEmaVal = 0
    let doubleCumSum = 0
    // 二次 EMA 从 singleEma 有效的位置开始（即 index = emaPeriod - 1）
    let doubleCount = 0

    for (let i = 0; i < dataList.length; i++) {
      if (i < emaPeriod - 1) {
        // 单次 EMA 尚未有效
        doubleEma.push(0)
        continue
      }

      if (doubleCount < emaPeriod) {
        doubleCumSum += singleEma[i]
        doubleCount++
        if (doubleCount === emaPeriod) {
          doubleEmaVal = doubleCumSum / emaPeriod
          doubleEma.push(doubleEmaVal)
        } else {
          doubleEma.push(0)
        }
      } else {
        doubleEmaVal = singleEma[i] * emaK + doubleEmaVal * (1 - emaK)
        doubleEma.push(doubleEmaVal)
      }
    }

    // 第三步：计算比值并求和
    // 比值 = singleEma / doubleEma
    // 二次 EMA 从 index = (emaPeriod - 1) + (emaPeriod - 1) = 2 * (emaPeriod - 1) 开始有效
    const ratioStartIdx = 2 * (emaPeriod - 1)

    // 比值序列
    const ratios: number[] = []
    for (let i = 0; i < dataList.length; i++) {
      if (i < ratioStartIdx) {
        ratios.push(0)
      } else {
        // 防止除零
        if (doubleEma[i] === 0) {
          ratios.push(1)
        } else {
          ratios.push(singleEma[i] / doubleEma[i])
        }
      }
    }

    // 第四步：对比值序列求 sumPeriod 的滚动和
    // 需要从 ratioStartIdx 开始有 sumPeriod 个有效比值
    const miStartIdx = ratioStartIdx + sumPeriod - 1

    for (let i = 0; i < dataList.length; i++) {
      if (i < miStartIdx) {
        result.push({ mi: undefined })
      } else {
        let sum = 0
        for (let j = i - sumPeriod + 1; j <= i; j++) {
          sum += ratios[j]
        }
        result.push({ mi: sum })
      }
    }

    return result
  }
}

export default massIndex
