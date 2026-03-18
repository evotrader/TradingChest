/**
 * 自定义技术指标注册入口
 * 汇总所有分类下的指标，统一导出供图表组件注册使用
 */
import trendIndicators from './trend'
import volatilityIndicators from './volatility'
import volumeIndicators from './volume'
import momentumIndicators from './momentum'
import otherIndicators from './other'

const customIndicators = [
  ...trendIndicators,
  ...volatilityIndicators,
  ...volumeIndicators,
  ...momentumIndicators,
  ...otherIndicators
]

export default customIndicators

// 指标分类映射（用于 UI 分类显示）
// 名称必须与 IndicatorTemplate.name 完全一致
export const indicatorCategories: Record<string, { names: string[], label_zh: string, label_en: string }> = {
  trend: {
    names: ['MA', 'EMA', 'SMA', 'BOLL', 'SAR', 'BBI', 'ATR', 'SUPERTREND', 'ICHIMOKU', 'ALLIGATOR', 'DEMA', 'TEMA', 'WMA', 'HMA', 'KAMA', 'VWMA', 'ZLEMA', 'MCGINLEY', 'LINEARREGRESSION', 'ENVELOPES', 'T3'],
    label_zh: '趋势',
    label_en: 'Trend'
  },
  volatility: {
    names: ['BOLL', 'KC', 'DC', 'HV', 'STDDEV', 'CV', 'MI', 'UI', 'BBW'],
    label_zh: '波动率',
    label_en: 'Volatility'
  },
  volume: {
    names: ['VOL', 'OBV', 'PVT', 'VR', 'VWAP', 'MFI', 'CMF', 'AD', 'VROC', 'KVO', 'FI', 'ELDER_RAY'],
    label_zh: '成交量',
    label_en: 'Volume'
  },
  momentum: {
    names: ['MACD', 'KDJ', 'RSI', 'BIAS', 'BRAR', 'CCI', 'DMI', 'CR', 'PSY', 'DMA', 'TRIX', 'WR', 'MTM', 'EMV', 'ROC', 'AO', 'StochRSI', 'ADX', 'AROON', 'UO', 'FISHER', 'COPPOCK', 'PPO', 'DPO', 'KST', 'TMF'],
    label_zh: '动量',
    label_en: 'Momentum'
  },
  other: {
    names: ['PIVOTPOINTS', 'ZIGZAG'],
    label_zh: '其他',
    label_en: 'Other'
  }
}
