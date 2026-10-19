import type {OverlaySnapshot,SymbolInfo,Period} from '../types'

export type DrawingOwner='local'|'backend'
export type DrawingSource='drawing-bar'|'property-bar'|'keyboard'|'manual'|'history'|'programmatic'
export interface DrawingSnapshot {
  logicalId:string
  owner:DrawingOwner
  overlay:OverlaySnapshot
  backendId?:string
  anchors?:DrawingAnchor[]
  yAxisId?:string
  parameters?:Record<string,number|string|boolean|number[]>
  presentation?:DrawingPresentation
}

export type DrawingScope='chart'|'workspace'|'host'
export type DrawingAnchor=
  | {kind:'market';timestamp:number;value:number;interpolation?:{nextTimestamp:number;fraction:number}}
  | {kind:'logical';referenceTimestamp:number;offsetBars:number;period:Pick<Period,'multiplier'|'timespan'>;value:number}
  | {kind:'viewport';x:number;y:number}
export type DrawingIntervalFilter=
  | {kind:'all'}
  | {kind:'current'|'higher'|'lower';period:Pick<Period,'multiplier'|'timespan'>}
  | {kind:'list';periods:Array<Pick<Period,'multiplier'|'timespan'>>}
export interface DrawingPresentation {
  name?:string
  groupId?:string
  groupName?:string
  order?:number
  intervals?:DrawingIntervalFilter
  scope?:DrawingScope
}
export interface DrawingGroup {id:string;name:string;paneId:string}
export interface DrawingItemResult {
  logicalId:string
  status:'confirmed'|'rejected'|'uncertain'|'not-attempted'
  message?:string
}
export interface DrawingCommandResult {
  status:'completed'|'cancelled'|'rejected'|'partial'|'uncertain'
  items:DrawingItemResult[]
  message?:string
}
export type DrawingCommand=
  | {type:'tool';toolId:string|null;continuous?:boolean}
  | {type:'select';ids:string[];additive?:boolean}
  | {type:'cancel'}
  | {type:'update';ids:string[];patch:Partial<Pick<DrawingSnapshot,'anchors'|'parameters'|'yAxisId'>> & {overlay?:Partial<OverlaySnapshot>;text?:string}}
  | {type:'delete'|'duplicate'|'copy';ids:string[]}
  | {type:'paste';paneId?:string}
  | {type:'group';ids:string[];name:string}
  | {type:'ungroup';ids:string[]}
  | {type:'reorder';ids:string[];direction:'front'|'back'|'up'|'down'}
  | {type:'presentation';ids:string[];patch:Partial<DrawingPresentation>}
  | {type:'view';hidden?:boolean;preventDragging?:boolean}
  | {type:'undo'}
  | {type:'redo'}
export interface DrawingState {
  toolId:string|null
  step:number
  continuous:boolean
  selectedIds:string[]
  scope:DrawingScope
  objects:DrawingSnapshot[]
  groups:DrawingGroup[]
  hidden:boolean
  preventDragging:boolean
  history:DrawingHistoryState
  lastResult?:DrawingCommandResult
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
  projectionErrors?:Record<string,string>
}
