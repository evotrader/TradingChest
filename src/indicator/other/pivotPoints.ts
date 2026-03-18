/**
 * Pivot Points (Standard) - 标准轴心点
 * 基于前一根 K 线的最高价、最低价、收盘价计算支撑与阻力位
 *
 * 计算公式：
 *   Pivot (P)  = (H + L + C) / 3
 *   R1 = 2P - L
 *   S1 = 2P - H
 *   R2 = P + (H - L)
 *   S2 = P - (H - L)
 *   R3 = H + 2(P - L)
 *   S3 = L - 2(H - P)
 */
import { IndicatorTemplate, KLineData } from 'klinecharts'

const pivotPoints: IndicatorTemplate = {
  name: 'PIVOTPOINTS',
  shortName: 'PivotPoints',
  calcParams: [],
  figures: [
    { key: 'pivot', title: 'P: ', type: 'line' },
    { key: 'r1', title: 'R1: ', type: 'line' },
    { key: 'r2', title: 'R2: ', type: 'line' },
    { key: 'r3', title: 'R3: ', type: 'line' },
    { key: 's1', title: 'S1: ', type: 'line' },
    { key: 's2', title: 'S2: ', type: 'line' },
    { key: 's3', title: 'S3: ', type: 'line' }
  ],
  calc: (dataList: KLineData[], _indicator) => {
    const result: any[] = []

    for (let i = 0; i < dataList.length; i++) {
      if (i === 0) {
        // 第一根 K 线无前一根数据，无法计算
        result.push({
          pivot: undefined,
          r1: undefined,
          r2: undefined,
          r3: undefined,
          s1: undefined,
          s2: undefined,
          s3: undefined
        })
        continue
      }

      // 使用前一根 K 线的 H / L / C
      const prev = dataList[i - 1]
      const h = prev.high
      const l = prev.low
      const c = prev.close

      const p = (h + l + c) / 3
      const r1 = 2 * p - l
      const s1 = 2 * p - h
      const r2 = p + (h - l)
      const s2 = p - (h - l)
      const r3 = h + 2 * (p - l)
      const s3 = l - 2 * (h - p)

      result.push({ pivot: p, r1, r2, r3, s1, s2, s3 })
    }

    return result
  }
}

export default pivotPoints
