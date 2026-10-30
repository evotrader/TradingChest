import { KLineData } from 'klinecharts'
import type {HistoryMetadata} from '../types'
import type {SeriesIdentity} from '../datafeed/session'

export type ReplaySpeed = 1 | 2 | 4 | 8 | 16

export interface ReplayState {
  active: boolean
  playing: boolean
  speed: ReplaySpeed
  position: number
  totalBars: number
}

export interface ReplayCallbacks {
  onDataChange: (data: KLineData[]) => void
  onBarUpdate: (bar: KLineData) => void
  onStateChange: (state: ReplayState) => void
}

export interface ReplayHistoryQuery {from:number;to:number;warmupBars:number}
export interface ReplayBarClock {timestamp:number;completedAt:number;availableAt?:number}
export interface ReplayHistoryResult {
  bars:KLineData[]
  clocks:ReplayBarClock[]
  identity:SeriesIdentity
  basis?:string
  historyKind:'current-history'
  metadata:HistoryMetadata
  coverage:{from:number;to:number;warmupBars:number}
}
export interface ReplayRequestContext {signal:AbortSignal;reason:'enter'|'restore'}
export type WorkspaceReplayErrorCode='UNSUPPORTED'|'IDENTITY_MISMATCH'|'TIMING_UNAVAILABLE'|'INVALID_HISTORY'|'PARTIAL_HISTORY'|'EMPTY_DRIVER'|'OUT_OF_RANGE'|'BUSY'|'REPLAY_OWNED'|'RESTORE_FAILED'|'DISPOSED'
export class WorkspaceReplayError extends Error {
  readonly cellId?:string
  readonly status?:number
  constructor(readonly code:WorkspaceReplayErrorCode,message:string,options:{cellId?:string;cause?:unknown;status?:number}={}){
    super(message,{cause:options.cause});this.name='WorkspaceReplayError';this.cellId=options.cellId;this.status=options.status
  }
}

export interface WorkspaceReplayState {
  mode:'live'|'replay'
  phase:'idle'|'loading'|'paused'|'playing'|'seeking'|'resuming'|'error'
  from?:number
  to?:number
  cursor?:number
  driverCellId?:string
  speed:ReplaySpeed
  availabilityAssumed:boolean
  cells:Array<{cellId:string;timestamp?:number;barCount:number;error?:{code:string;message:string;status?:number}}>
  error?:{code:string;message:string;cellId?:string;status?:number}
}
export interface ReplayBookmark {
  id:string
  timestamp:number
  title:string
  note:string
  cellId?:string
  eventRef?:{layerId:string;eventId:string;timestamp:number}
}
export interface ReplayComparisonRecord {symbol:import('../types').SymbolInfo;period:import('../types').Period;identity:SeriesIdentity;basis?:string}
export interface ReplayParticipantRecord {cellId:string;identity:SeriesIdentity;basis?:string;comparisons:ReplayComparisonRecord[]}
export interface WorkspaceReplayRecord {
  version:1
  mode:'live'|'paused'
  historyKind:'current-history'
  from:number
  to:number
  cursor:number
  driverCellId:string
  speed:ReplaySpeed
  participants:ReplayParticipantRecord[]
  notes:string
  bookmarks:ReplayBookmark[]
}
