import { IndicatorTemplate } from 'klinecharts'

type IndicatorLoader = () => Promise<IndicatorTemplate>

export const indicatorLoaders: Record<string, IndicatorLoader> = {
  // Trend
  ATR:              () => import('./trend/atr').then(m => m.default),
  SUPERTREND:       () => import('./trend/superTrend').then(m => m.default),
  ICHIMOKU:         () => import('./trend/ichimoku').then(m => m.default),
  ALLIGATOR:        () => import('./trend/alligator').then(m => m.default),
  DEMA:             () => import('./trend/dema').then(m => m.default),
  TEMA:             () => import('./trend/tema').then(m => m.default),
  WMA:              () => import('./trend/wma').then(m => m.default),
  HMA:              () => import('./trend/hma').then(m => m.default),
  KAMA:             () => import('./trend/kama').then(m => m.default),
  VWMA:             () => import('./trend/vwma').then(m => m.default),
  ZLEMA:            () => import('./trend/zlema').then(m => m.default),
  MCGINLEY:         () => import('./trend/mcginley').then(m => m.default),
  LINEARREGRESSION: () => import('./trend/linearRegression').then(m => m.default),
  ENVELOPES:        () => import('./trend/envelopes').then(m => m.default),
  T3:               () => import('./trend/t3').then(m => m.default),
  // Volatility
  KC:     () => import('./volatility/keltnerChannels').then(m => m.default),
  DC:     () => import('./volatility/donchianChannels').then(m => m.default),
  HV:     () => import('./volatility/historicalVolatility').then(m => m.default),
  STDDEV: () => import('./volatility/standardDeviation').then(m => m.default),
  CV:     () => import('./volatility/chaikinVolatility').then(m => m.default),
  MI:     () => import('./volatility/massIndex').then(m => m.default),
  UI:     () => import('./volatility/ulcerIndex').then(m => m.default),
  BBW:    () => import('./volatility/bollingerBandWidth').then(m => m.default),
  // Volume
  VWAP:      () => import('./volume/vwap').then(m => m.default),
  MFI:       () => import('./volume/mfi').then(m => m.default),
  CMF:       () => import('./volume/chaikinMoneyFlow').then(m => m.default),
  AD:        () => import('./volume/adLine').then(m => m.default),
  VROC:      () => import('./volume/vroc').then(m => m.default),
  KVO:       () => import('./volume/klingerOscillator').then(m => m.default),
  FI:        () => import('./volume/forceIndex').then(m => m.default),
  ELDER_RAY: () => import('./volume/elderRay').then(m => m.default),
  // Momentum
  StochRSI: () => import('./momentum/stochasticRsi').then(m => m.default),
  ADX:      () => import('./momentum/adx').then(m => m.default),
  AROON:    () => import('./momentum/aroon').then(m => m.default),
  UO:       () => import('./momentum/ultimateOscillator').then(m => m.default),
  FISHER:   () => import('./momentum/fisherTransform').then(m => m.default),
  COPPOCK:  () => import('./momentum/coppockCurve').then(m => m.default),
  PPO:      () => import('./momentum/ppo').then(m => m.default),
  DPO:      () => import('./momentum/dpo').then(m => m.default),
  KST:      () => import('./momentum/kst').then(m => m.default),
  TMF:      () => import('./momentum/twiggsMf').then(m => m.default),
  // Other
  PIVOTPOINTS: () => import('./other/pivotPoints').then(m => m.default),
  ZIGZAG:      () => import('./other/zigzag').then(m => m.default),
}
