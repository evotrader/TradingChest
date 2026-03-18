/**
 * 趋势类指标集合
 * 包含 ATR、SuperTrend、Ichimoku、Alligator 等 15 个趋势指标
 */
import atr from './atr'
import superTrend from './superTrend'
import ichimoku from './ichimoku'
import alligator from './alligator'
import dema from './dema'
import tema from './tema'
import wma from './wma'
import hma from './hma'
import kama from './kama'
import vwma from './vwma'
import zlema from './zlema'
import mcginley from './mcginley'
import linearRegression from './linearRegression'
import envelopes from './envelopes'
import t3 from './t3'

const trendIndicators = [
  atr,
  superTrend,
  ichimoku,
  alligator,
  dema,
  tema,
  wma,
  hma,
  kama,
  vwma,
  zlema,
  mcginley,
  linearRegression,
  envelopes,
  t3
]

export default trendIndicators
