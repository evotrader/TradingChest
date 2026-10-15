import type {OverlaySnapshot,SymbolInfo,Period} from '../types'

export type DrawingOwner='local'|'backend'
export type DrawingSource='drawing-bar'|'property-bar'|'keyboard'|'manual'|'history'|'programmatic'
export interface DrawingSnapshot {
  logicalId:string
  owner:DrawingOwner
  overlay:OverlaySnapshot
  backendId?:string
}
export interface DrawingChange {
  kind:'create'|'update'|'delete'
  logicalId:string
  before:DrawingSnapshot|null
  after:DrawingSnapshot|null
  source:DrawingSource
  context:{symbol:SymbolInfo;period:Period}
}
export type DrawingCommitResult=
  | {status:'confirmed';snapshot:DrawingSnapshot|null}
  | {status:'rejected';message:string}
  | {status:'uncertain';message:string;snapshot?:DrawingSnapshot|null}
export interface DrawingHistoryState {
  pending:number
  canUndo:boolean
  canRedo:boolean
  error?:string
  uncertainLogicalIds:string[]
}
