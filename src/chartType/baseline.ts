/**
 * Baseline（基准线图）指标
 *
 * 以第一根K线的收盘价作为基准线，将收盘价走势与基准线对比显示。
 * 高于基准线的区域和低于基准线的区域可通过不同颜色区分多空态势。
 */
import { IndicatorTemplate, KLineData } from 'klinecharts'

const baseline: IndicatorTemplate = {
  name: 'Baseline',
  shortName: 'BL',
  calcParams: [],
  figures: [
    { key: 'close', title: 'Close: ', type: 'line' },
    { key: 'baseline', title: 'Base: ', type: 'line' }
  ],
  calc: (dataList: KLineData[]) => {
    if (dataList.length === 0) return []
    // 默认基准价：第一根K线的收盘价
    const basePrice = dataList[0].close
    return dataList.map(d => ({
      close: d.close,
      baseline: basePrice
    }))
  }
}

export default baseline
