import type {Datafeed,HistoryResult,Period,SymbolInfo} from '../types'
export interface ComparisonDatafeed extends Datafeed {
  mode?:'http-snapshot'|'static'|'stream'
  subscribeSnapshots?:(symbol:SymbolInfo,period:Period,onSnapshot:(snapshot:HistoryResult)=>void,onError:(reason:unknown)=>void)=>void
}
export interface ComparisonHandle {id:string;symbol:SymbolInfo;period:Period;indicatorId:string;readAt?:number;sourceTimestamp?:number;basis?:string;mode?:ComparisonDatafeed['mode'];plottedTimestamp?:number;plottedReturn?:number}
export interface ComparisonState {
  handles:ComparisonHandle[]
  pending:Array<{id:string;symbol:SymbolInfo}>
  baseTimestamp?:number
  notice?:string
  error?:string
  replay:boolean
  restoring:boolean
  mainTimestamp?:number
  mainReturn?:number
}
