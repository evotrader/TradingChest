/**
 * Heikin Ashi（平均K线）指标
 *
 * 通过平均价格平滑K线波动，更容易识别趋势方向。
 * 作为主图叠加指标注册，配合 draw 回调自定义渲染蜡烛形态。
 *
 * 计算公式：
 *   HA Close = (Open + High + Low + Close) / 4
 *   HA Open  = (前一根 HA Open + 前一根 HA Close) / 2（首根取 (Open + Close) / 2）
 *   HA High  = max(High, HA Open, HA Close)
 *   HA Low   = min(Low, HA Open, HA Close)
 */
import { IndicatorTemplate, KLineData } from 'klinecharts'

const heikinAshi: IndicatorTemplate = {
  name: 'HeikinAshi',
  shortName: 'HA',
  calcParams: [],
  figures: [
    { key: 'haOpen', title: 'O: ', type: 'line' },
    { key: 'haHigh', title: 'H: ', type: 'line' },
    { key: 'haLow', title: 'L: ', type: 'line' },
    { key: 'haClose', title: 'C: ', type: 'line' }
  ],
  calc: (dataList: KLineData[]) => {
    const result: any[] = []
    let prevHaOpen = 0
    let prevHaClose = 0

    for (let i = 0; i < dataList.length; i++) {
      const d = dataList[i]
      // HA 收盘价：四价平均
      const haClose = (d.open + d.high + d.low + d.close) / 4
      // HA 开盘价：首根取原始开收均值，后续取前一根 HA 开收均值
      const haOpen = i === 0 ? (d.open + d.close) / 2 : (prevHaOpen + prevHaClose) / 2
      // HA 最高价/最低价：取 HA 值与原始极值的极值
      const haHigh = Math.max(d.high, haOpen, haClose)
      const haLow = Math.min(d.low, haOpen, haClose)

      result.push({ haOpen, haHigh, haLow, haClose })
      prevHaOpen = haOpen
      prevHaClose = haClose
    }
    return result
  }
}

export default heikinAshi
