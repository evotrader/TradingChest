/** The same validators used by the production history loader; no UI runtime. */
export {HistoryError,validateHistoryQuery,validateHistoryResult} from './datafeed/history'
export {validateReplayQuery,prepareReplayHistory} from './replay/history'
export type {ReplayHistoryQuery,ReplayHistoryResult,ReplayBarClock} from './replay/types'
export type {HistoryQuery,HistoryResult,HistorySnapshot,HistoryMetadata,DatafeedRequestContext,Datafeed,SymbolInfo,Period} from './types'
