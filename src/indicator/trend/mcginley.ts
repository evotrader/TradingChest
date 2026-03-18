/**
 * McGinley Dynamic - 麦金利动态指标
 * MD = MD_prev + (close - MD_prev) / (N * (close / MD_prev)^4)
 * 自动调整速度以适应市场节奏，避免大部分均线的假突破问题
 */
import { IndicatorTemplate, KLineData } from 'klinecharts'

const mcginley: IndicatorTemplate = {
  name: 'MCGINLEY',
  shortName: 'McGinley',
  calcParams: [14],
  figures: [
    { key: 'md', title: 'MD: ', type: 'line' }
  ],
  calc: (dataList: KLineData[], indicator) => {
    const params = indicator.calcParams
    const period = params[0] as number

    const result: any[] = []
    let prevMd = 0

    for (let i = 0; i < dataList.length; i++) {
      const close = dataList[i].close

      if (i === 0) {
        // 初始值使用第一根 K 线的收盘价
        prevMd = close
        result.push({ md: undefined })
      } else if (i < period - 1) {
        // 数据不足，继续迭代但不输出
        prevMd = prevMd + (close - prevMd) / (period * Math.pow(close / prevMd, 4))
        result.push({ md: undefined })
      } else {
        // MD = MD_prev + (close - MD_prev) / (N * (close / MD_prev)^4)
        prevMd = prevMd + (close - prevMd) / (period * Math.pow(close / prevMd, 4))
        result.push({ md: prevMd })
      }
    }

    return result
  }
}

export default mcginley
