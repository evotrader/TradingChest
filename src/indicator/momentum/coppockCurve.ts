/**
 * Coppock Curve - 估波指标
 *
 * Edwin Coppock 设计的长期动量指标，用于识别市场底部。
 * Coppock = WMA(ROC(close, roc1Period) + ROC(close, roc2Period), wmaPeriod)
 * 其中 ROC(x, n) = (x / x[n周期前] - 1) * 100
 */
import { IndicatorTemplate, KLineData } from 'klinecharts'

const coppockCurve: IndicatorTemplate = {
  name: 'COPPOCK',
  shortName: 'Coppock',
  calcParams: [14, 11, 10],
  figures: [
    { key: 'coppock', title: 'Coppock: ', type: 'line' }
  ],
  calc: (dataList: KLineData[], indicator) => {
    const params = indicator.calcParams
    const roc1Period = params[0] as number
    const roc2Period = params[1] as number
    const wmaPeriod = params[2] as number
    const len = dataList.length
    const result: any[] = []

    // 需要足够的历史数据来计算 ROC
    const maxRocPeriod = Math.max(roc1Period, roc2Period)

    // 计算两条 ROC 之和
    const rocSum: (number | null)[] = new Array(len).fill(null)
    for (let i = 0; i < len; i++) {
      if (i < maxRocPeriod) {
        continue
      }
      const closeNow = dataList[i].close
      const close1 = dataList[i - roc1Period].close
      const close2 = dataList[i - roc2Period].close

      // 防除零
      if (close1 === 0 || close2 === 0) continue

      const roc1 = (closeNow / close1 - 1) * 100
      const roc2 = (closeNow / close2 - 1) * 100
      rocSum[i] = roc1 + roc2
    }

    // 对 rocSum 做 WMA
    // WMA 权重：1, 2, 3, ..., wmaPeriod
    const weightSum = (wmaPeriod * (wmaPeriod + 1)) / 2

    for (let i = 0; i < len; i++) {
      // 需要从 rocSum 中取连续 wmaPeriod 个有效值
      if (i < maxRocPeriod + wmaPeriod - 1) {
        result.push({ coppock: undefined })
        continue
      }

      // 检查窗口内是否所有 rocSum 值都有效
      let valid = true
      let weighted = 0
      for (let j = 0; j < wmaPeriod; j++) {
        const idx = i - wmaPeriod + 1 + j
        if (rocSum[idx] === null) {
          valid = false
          break
        }
        // 权重从 1（最旧）到 wmaPeriod（最新）
        weighted += (rocSum[idx] as number) * (j + 1)
      }

      if (!valid) {
        result.push({ coppock: undefined })
      } else {
        result.push({ coppock: weighted / weightSum })
      }
    }

    return result
  }
}

export default coppockCurve
