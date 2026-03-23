import { KLineData, Indicator } from 'klinecharts'

type CalcFn = (dataList: KLineData[], indicator: Indicator) => any[]

/**
 * Wraps a full-recalculation indicator `calc` function with an incremental
 * caching layer.
 *
 * On every KLineChart update the chart calls the indicator's `calc` with the
 * complete data list. This wrapper detects two cheap cases and avoids
 * re-running the expensive full calculation for them:
 *
 * - **Append**: exactly one new candle was added to the end.
 * - **Last-candle update**: the list length is identical but the final
 *   candle's values changed (real-time tick update).
 *
 * In both cases only the last `lookback` candles are passed to `fullCalc` and
 * the result is spliced into the cached array.
 *
 * Detection strategy: compare the timestamp at `prevLength - 2` (the
 * second-to-last position from the previous call) with the value at the same
 * index in the new data list. If they match, earlier history is considered
 * unchanged and the update is treated as incremental.
 *
 * @param fullCalc - The original, unoptimised calc function.
 * @param lookback - Number of trailing candles to recompute on incremental
 *   updates. Should be at least as large as the indicator's own lookback
 *   period so that recalculated values are correct.
 * @returns A drop-in replacement for `fullCalc` that transparently caches
 *   results between calls.
 */
export function wrapWithIncrementalCalc(fullCalc: CalcFn, lookback: number): CalcFn {
  let prevLen = 0
  let prevSecondLastTs = 0
  let cached: any[] = []

  return (dataList: KLineData[], indicator: Indicator): any[] => {
    const len = dataList.length

    if (len === 0) {
      prevLen = 0
      prevSecondLastTs = 0
      cached = []
      return []
    }

    // Incremental conditions:
    //  1. We have a previous result to build on.
    //  2. The list grew by at most 1 (append) or stayed the same (tick update).
    //  3. Both lists are long enough for the timestamp-anchor check.
    //  4. The second-to-last timestamp from the previous call still sits at
    //     the same index in the new list — proving earlier data is unchanged.
    const isIncremental =
      prevLen > 0 &&
      len >= prevLen &&
      len - prevLen <= 1 &&
      len >= 2 &&
      prevLen >= 2 &&
      dataList[prevLen - 2].timestamp === prevSecondLastTs

    if (!isIncremental || len <= lookback) {
      // Full recalculation: data shrank, first call, history changed, or the
      // dataset is too small to benefit from a partial pass.
      cached = fullCalc(dataList, indicator)
      prevLen = len
      prevSecondLastTs = len >= 2 ? dataList[len - 2].timestamp : 0
      return cached
    }

    // Incremental path: recalculate only the trailing `lookback` candles.
    const startIdx = Math.max(0, len - lookback)
    const tailData = dataList.slice(startIdx)
    const tailResult = fullCalc(tailData, indicator)

    // Merge preserved head with freshly computed tail.
    cached.length = startIdx
    cached.push(...tailResult)
    prevLen = len
    prevSecondLastTs = len >= 2 ? dataList[len - 2].timestamp : 0
    return cached
  }
}
