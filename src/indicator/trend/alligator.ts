/**
 * Williams Alligator - 威廉鳄鱼指标
 * 由鳄鱼颚（Jaw）、牙齿（Teeth）、嘴唇（Lips）三条平滑移动均线组成
 * 各线有不同的周期和前移偏移量
 */
import { IndicatorTemplate, KLineData } from 'klinecharts'

const alligator: IndicatorTemplate = {
  name: 'ALLIGATOR',
  shortName: 'Alligator',
  calcParams: [13, 8, 5],
  figures: [
    { key: 'jaw', title: '颚线: ', type: 'line' },
    { key: 'teeth', title: '齿线: ', type: 'line' },
    { key: 'lips', title: '唇线: ', type: 'line' }
  ],
  calc: (dataList: KLineData[], indicator) => {
    const params = indicator.calcParams
    const jawPeriod = params[0] as number
    const teethPeriod = params[1] as number
    const lipsPeriod = params[2] as number

    // 偏移量
    const jawOffset = 8
    const teethOffset = 5
    const lipsOffset = 3

    /**
     * 计算 SMMA（平滑移动平均线）
     * SMMA(i) = (SMMA(i-1) * (period - 1) + close(i)) / period
     * 使用 (high + low) / 2 作为数据源（Median Price）
     */
    function calcSmma(period: number): (number | undefined)[] {
      const values: (number | undefined)[] = []
      let smma = 0
      for (let i = 0; i < dataList.length; i++) {
        const median = (dataList[i].high + dataList[i].low) / 2
        if (i < period) {
          smma += median
          if (i === period - 1) {
            smma = smma / period
            values.push(smma)
          } else {
            values.push(undefined)
          }
        } else {
          smma = (smma * (period - 1) + median) / period
          values.push(smma)
        }
      }
      return values
    }

    const jawSmma = calcSmma(jawPeriod)
    const teethSmma = calcSmma(teethPeriod)
    const lipsSmma = calcSmma(lipsPeriod)

    // 应用偏移后组装结果
    const totalLength = dataList.length + Math.max(jawOffset, teethOffset, lipsOffset)
    const result: any[] = []

    for (let i = 0; i < totalLength; i++) {
      const item: any = {}

      // 颚线：前移 jawOffset
      const jawSrcIdx = i - jawOffset
      if (jawSrcIdx >= 0 && jawSrcIdx < dataList.length) {
        item.jaw = jawSmma[jawSrcIdx]
      }

      // 齿线：前移 teethOffset
      const teethSrcIdx = i - teethOffset
      if (teethSrcIdx >= 0 && teethSrcIdx < dataList.length) {
        item.teeth = teethSmma[teethSrcIdx]
      }

      // 唇线：前移 lipsOffset
      const lipsSrcIdx = i - lipsOffset
      if (lipsSrcIdx >= 0 && lipsSrcIdx < dataList.length) {
        item.lips = lipsSmma[lipsSrcIdx]
      }

      result.push(item)
    }

    return result
  }
}

export default alligator
