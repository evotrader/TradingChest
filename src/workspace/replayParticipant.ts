import type {ChartPro} from '../types'
import type {ReplayWindow} from '../replay/history'
import type {ReplayHistoryQuery,ReplayRequestContext,ReplayParticipantRecord} from '../replay/types'
import type {AnalysisEvent} from '../analysis/types'
import type {TimestampLocation} from '../core/locateTimestamp'

/** Internal capability registered on actual library instances, never on provider objects. */
export interface ReplayPrepared {
  window:ReplayWindow
  availabilityAssumed:boolean
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
const binding=Symbol.for('trading-chest.replay-participant')
type BoundChart=ChartPro&{[binding]?:ReplayParticipant}
// The legacy root bundle and framework subentries have separate module scopes.
// Carry the same instance capability across them, like drawingBindings does.
export const registerReplayParticipant=(chart:ChartPro,participant:ReplayParticipant)=>{
  participants.set(chart,participant);Object.defineProperty(chart,binding,{value:participant,configurable:true})
  return()=>{if(participants.get(chart)===participant)participants.delete(chart);if((chart as BoundChart)[binding]===participant)delete (chart as BoundChart)[binding]}
}
export const replayParticipant=(chart:ChartPro):ReplayParticipant|undefined=>participants.get(chart)??(chart as BoundChart)[binding]
