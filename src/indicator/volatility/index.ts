import keltnerChannels from './keltnerChannels'
import donchianChannels from './donchianChannels'
import historicalVolatility from './historicalVolatility'
import standardDeviation from './standardDeviation'
import chaikinVolatility from './chaikinVolatility'
import massIndex from './massIndex'
import ulcerIndex from './ulcerIndex'
import bollingerBandWidth from './bollingerBandWidth'

const volatilityIndicators = [
  keltnerChannels,
  donchianChannels,
  historicalVolatility,
  standardDeviation,
  chaikinVolatility,
  massIndex,
  ulcerIndex,
  bollingerBandWidth
]

export default volatilityIndicators
