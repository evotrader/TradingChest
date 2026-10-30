import type {ChartPro} from '../types'
import type {ReplayWindow} from '../replay/history'
import type {ReplayHistoryQuery,ReplayRequestContext,ReplayParticipantRecord} from '../replay/types'
import type {AnalysisEvent} from '../analysis/types'
import type {TimestampLocation} from '../core/locateTimestamp'

/** Internal capability registered on actual library instances, never on provider objects. */
export interface ReplayPrepared {
  window:ReplayWindow
  record:Omit<ReplayParticipantRecord,'cellId'>
  assertCurrent():void
  release():void
  begin():ReplayTransaction
}
export interface ReplayTransaction {
  apply(cursor:number,incremental:boolean,signal:AbortSignal):Promise<void>
  rollback():Promise<void>
  /** All seals run synchronously before any callbacks are delivered. */
  seal():void
  finalize?(signal:AbortSignal):Promise<void>
  publish():void
}
export interface ReplayParticipant {
  claim():void
  release():void
  prepare(query:ReplayHistoryQuery,context:ReplayRequestContext,record?:ReplayParticipantRecord):Promise<ReplayPrepared>
  prepareLive(signal:AbortSignal):Promise<{assertCurrent():void;begin():ReplayTransaction;release():void}>
  summary():{timestamp?:number;barCount:number}
  events():Array<{layerId:string;label:string;events:AnalysisEvent[];error?:string}>
  navigate(timestamp:number):TimestampLocation
  selectEvent(layerId:string,eventId:string):void
  restoreLiveComparisons(record:ReplayParticipantRecord,signal:AbortSignal):Promise<void>
  setRecordGuard?(guard?:{assert:()=>void;request:()=>Promise<void>}):void
}
const participants=new WeakMap<ChartPro,ReplayParticipant>()
export const registerReplayParticipant=(chart:ChartPro,participant:ReplayParticipant)=>{participants.set(chart,participant);return()=>{if(participants.get(chart)===participant)participants.delete(chart)}}
export const replayParticipant=(chart:ChartPro):ReplayParticipant|undefined=>participants.get(chart)
