/**
 * Fisher Transform - 费舍尔变换
 *
 * 将价格归一化到 [-1, 1] 区间后，应用反双曲正切变换使其近似正态分布，
 * 从而更清晰地识别价格转折点。
 *
 * 中间价 = (high + low) / 2
 * 归一化 x = 2 * (midPrice - lowest) / (highest - lowest) - 1，钳制到 (-0.999, 0.999)
 * Fisher = 0.5 * ln((1 + x) / (1 - x))，使用 EMA 平滑的 x
 * Trigger = 前一根的 Fisher 值
 */
import { IndicatorTemplate, KLineData } from 'klinecharts'

const fisherTransform: IndicatorTemplate = {
  name: 'FISHER',
  shortName: 'Fisher',
  calcParams: [9],
  figures: [
    { key: 'fisher', title: 'Fisher: ', type: 'line' },
    { key: 'trigger', title: 'Trigger: ', type: 'line' }
  ],
  calc: (dataList: KLineData[], indicator) => {
    const period = indicator.calcParams[0] as number
    const len = dataList.length
    const result: any[] = []

    // 计算中间价序列
    const midPrices: number[] = new Array(len)
    for (let i = 0; i < len; i++) {
      midPrices[i] = (dataList[i].high + dataList[i].low) / 2
    }

    let prevNorm = 0 // 前一根的归一化值（用于 EMA 平滑）
    let prevFisher = 0 // 前一根的 Fisher 值（即当前 trigger）

    for (let i = 0; i < len; i++) {
      if (i < period - 1) {
        result.push({ fisher: undefined, trigger: undefined })
        continue
      }

      // 查找窗口内的最高和最低中间价
      let highest = -Infinity
      let lowest = Infinity
      for (let j = i - period + 1; j <= i; j++) {
        if (midPrices[j] > highest) highest = midPrices[j]
        if (midPrices[j] < lowest) lowest = midPrices[j]
      }

      // 归一化到 [-1, 1]
      let norm: number
      if (highest === lowest) {
        norm = 0
      } else {
        norm = 2 * (midPrices[i] - lowest) / (highest - lowest) - 1
      }

      // 钳制到 (-0.999, 0.999) 防止 ln 溢出
      norm = Math.max(-0.999, Math.min(0.999, norm))

      // EMA 平滑归一化值（系数 0.5）
      norm = 0.5 * norm + 0.5 * prevNorm

      // 再次钳制（平滑后仍可能接近边界）
      norm = Math.max(-0.999, Math.min(0.999, norm))

      // Fisher 变换
      const fisher = 0.5 * Math.log((1 + norm) / (1 - norm))

      // trigger 是前一根的 fisher 值
      const trigger = i === period - 1 ? undefined : prevFisher

      result.push({ fisher, trigger })

      prevNorm = norm
      prevFisher = fisher
    }

    return result
  }
}

export default fisherTransform
