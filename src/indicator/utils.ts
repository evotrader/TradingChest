/**
 * 技术指标计算工具函数集
 *
 * 所有函数接受 number[] 输入，返回 (number | null)[]。
 * 数据不足的位置填充 null，确保输出数组长度与输入一致。
 * 本模块用于金融交易系统，数值精度至关重要。
 */

/**
 * 简单移动平均（Simple Moving Average）
 * SMA = 区间内数据的算术平均值
 */
export function calcSMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = []
  // 维护滑动窗口的累加和，避免重复求和
  let windowSum = 0
  for (let i = 0; i < data.length; i++) {
    windowSum += data[i]
    if (i < period - 1) {
      // 数据不足一个完整周期
      result.push(null)
    } else {
      if (i >= period) {
        // 滑出窗口最旧的一个值
        windowSum -= data[i - period]
      }
      result.push(windowSum / period)
    }
  }
  return result
}

/**
 * 指数移动平均（Exponential Moving Average）
 * 权重因子 k = 2 / (period + 1)
 * 首个有效值使用 SMA 作为种子
 */
export function calcEMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = []
  const k = 2 / (period + 1)
  let prevEma: number | null = null

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      // 数据不足，尚未产生第一个 EMA
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
      // EMA = 前值 + k * (当前值 - 前值)
      prevEma = data[i] * k + prevEma! * (1 - k)
      result.push(prevEma)
    }
  }
  return result
}

/**
 * 加权移动平均（Weighted Moving Average）
 * 最新数据权重最大：权重 = 1, 2, 3, ..., period
 * WMA = Σ(data[i] * weight[i]) / Σ(weight)
 */
export function calcWMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = []
  // 权重总和 = period * (period + 1) / 2
  const weightSum = (period * (period + 1)) / 2

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null)
    } else {
      let weighted = 0
      for (let j = 0; j < period; j++) {
        // 窗口内第 j 个元素的权重为 j + 1（越新权重越大）
        weighted += data[i - period + 1 + j] * (j + 1)
      }
      result.push(weighted / weightSum)
    }
  }
  return result
}

/**
 * 真实波幅（True Range）
 * TR = max(high - low, |high - prevClose|, |low - prevClose|)
 * 第一根 K 线无前收盘价，TR = high - low
 */
export function calcTR(
  high: number[],
  low: number[],
  close: number[]
): (number | null)[] {
  const result: (number | null)[] = []
  for (let i = 0; i < high.length; i++) {
    if (i === 0) {
      // 第一根 K 线没有前一根收盘价，直接用 high - low
      result.push(high[i] - low[i])
    } else {
      const prevClose = close[i - 1]
      const hl = high[i] - low[i]
      const hc = Math.abs(high[i] - prevClose)
      const lc = Math.abs(low[i] - prevClose)
      result.push(Math.max(hl, hc, lc))
    }
  }
  return result
}

/**
 * 标准差（Standard Deviation）
 * 使用总体标准差（除以 N），与大多数技术分析平台一致（如布林带）
 */
export function calcStdDev(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = []
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null)
    } else {
      // 先求区间均值
      let sum = 0
      for (let j = i - period + 1; j <= i; j++) {
        sum += data[j]
      }
      const mean = sum / period
      // 求方差
      let varianceSum = 0
      for (let j = i - period + 1; j <= i; j++) {
        const diff = data[j] - mean
        varianceSum += diff * diff
      }
      result.push(Math.sqrt(varianceSum / period))
    }
  }
  return result
}

/**
 * 区间最高值（Highest value in period）
 * 返回过去 period 根 K 线内的最大值
 */
export function calcHighest(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = []
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null)
    } else {
      let max = -Infinity
      for (let j = i - period + 1; j <= i; j++) {
        if (data[j] > max) {
          max = data[j]
        }
      }
      result.push(max)
    }
  }
  return result
}

/**
 * 区间最低值（Lowest value in period）
 * 返回过去 period 根 K 线内的最小值
 */
export function calcLowest(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = []
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null)
    } else {
      let min = Infinity
      for (let j = i - period + 1; j <= i; j++) {
        if (data[j] < min) {
          min = data[j]
        }
      }
      result.push(min)
    }
  }
  return result
}

/**
 * 递归移动平均 / Wilder 平滑（RMA / SMMA / Wilder's Smoothing）
 * 广泛用于 RSI、ATR 等指标
 * RMA = (prevRMA * (period - 1) + currentValue) / period
 * 首个有效值使用 SMA 作为种子
 */
export function calcRMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = []
  let prevRma: number | null = null

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null)
    } else if (i === period - 1) {
      // 用前 period 个数据的 SMA 作为种子
      let sum = 0
      for (let j = 0; j < period; j++) {
        sum += data[j]
      }
      prevRma = sum / period
      result.push(prevRma)
    } else {
      // Wilder 递归公式
      prevRma = (prevRma! * (period - 1) + data[i]) / period
      result.push(prevRma)
    }
  }
  return result
}

/**
 * 滚动求和（Rolling Sum）
 * 返回过去 period 个数据点的累加和
 */
export function calcSum(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = []
  let windowSum = 0

  for (let i = 0; i < data.length; i++) {
    windowSum += data[i]
    if (i < period - 1) {
      result.push(null)
    } else {
      if (i >= period) {
        windowSum -= data[i - period]
      }
      result.push(windowSum)
    }
  }
  return result
}

/**
 * 变化量（Change / Difference）
 * change[i] = data[i] - data[i-1]
 * 第一个元素无前值，返回 null
 */
export function calcChange(data: number[]): (number | null)[] {
  const result: (number | null)[] = []
  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      result.push(null)
    } else {
      result.push(data[i] - data[i - 1])
    }
  }
  return result
}

/**
 * 正变化（Gain）
 * 当 data[i] > data[i-1] 时返回差值，否则返回 0
 * 第一个元素返回 null
 */
export function calcGain(data: number[]): (number | null)[] {
  const result: (number | null)[] = []
  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      result.push(null)
    } else {
      const diff = data[i] - data[i - 1]
      result.push(diff > 0 ? diff : 0)
    }
  }
  return result
}

/**
 * 负变化的绝对值（Loss）
 * 当 data[i] < data[i-1] 时返回差值的绝对值，否则返回 0
 * 第一个元素返回 null
 */
export function calcLoss(data: number[]): (number | null)[] {
  const result: (number | null)[] = []
  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      result.push(null)
    } else {
      const diff = data[i] - data[i - 1]
      result.push(diff < 0 ? Math.abs(diff) : 0)
    }
  }
  return result
}
