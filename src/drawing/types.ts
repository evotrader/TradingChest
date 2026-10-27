import type {OverlaySnapshot,SymbolInfo,Period} from '../types'

export type DrawingOwner='local'|'backend'
export type DrawingSource='drawing-bar'|'property-bar'|'keyboard'|'manual'|'history'|'programmatic'
export type DrawingParameterPrimitive=number|string|boolean|number[]
export type DrawingParameters=Record<string,DrawingParameterPrimitive|import('./levels').DrawingLevelSet>
export interface DrawingSnapshot {
  logicalId:string
  owner:DrawingOwner
  overlay:OverlaySnapshot
  backendId?:string
  anchors?:DrawingAnchor[]
  yAxisId?:string
  migration?:{target:import('./session').DrawingSharedReference;status:'prepared'|'uncertain';direction?:'from-host'}
  parameters?:DrawingParameters
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
  | {type:'tool';toolId:string|null;continuous?:boolean;templateId?:string}
  | {type:'select';ids:string[];additive?:boolean}
  | {type:'cancel'}
  | {type:'finish'}
  | {type:'move';ids:string[];dx:number;dy:number;clone?:boolean}
  | {type:'translate';ids:string[];bars?:number;price?:{unit:'price'|'tick';amount:number}}
  | {type:'scope';scope:DrawingScope}
  | {type:'transfer';ids:string[];scope:DrawingScope}
  | {type:'recover-transfer';id:string;scope:DrawingScope}
  | {type:'shared';action:'save-as'|'save'|'refresh'|'discard-refresh';scope:'workspace'|'host'}
  | {type:'update';ids:string[];patch:Partial<Pick<DrawingSnapshot,'anchors'|'parameters'|'yAxisId'|'presentation'>> & {overlay?:Partial<OverlaySnapshot>;text?:string}}
  | {type:'delete'|'duplicate'|'copy';ids:string[]}
  | {type:'paste';paneId?:string}
  | {type:'group';ids:string[];name:string}
  | {type:'ungroup';ids:string[]}
  | {type:'reorder';ids:string[];direction:'front'|'back'|'up'|'down'}
  | {type:'reorder';ids:string[];targetId:string;position:'before'|'after'}
  | {type:'presentation';ids:string[];patch:Partial<DrawingPresentation>}
  | {type:'view';hidden?:boolean;preventDragging?:boolean;magnet?:import('./snap').DrawingMagnetMode}
  | {type:'preferences';patch:import('./preferences').DrawingPreferencesPatch}
  | {type:'preferences-retry'}
  | {type:'template';action:'save'|'overwrite'|'rename'|'delete'|'apply'|'default';templateId?:string;name?:string;ids?:string[];styleOnly?:boolean}
  | {type:'undo'}
  | {type:'redo'}
export interface DrawingState {
  analytics?:Record<string,import('./analytics').DrawingAnalyticsState>
  origin?:'user'|'history'|'projection'
  toolId:string|null
  step:number
  continuous:boolean
  selectedIds:string[]
  scope:DrawingScope
  historyScope?:DrawingScope
  sharing?:{canSaveAs?:boolean;workspace?:import('./session').DrawingSessionState;host?:import('./session').DrawingSessionState;reason?:string}
  objects:DrawingSnapshot[]
  groups:DrawingGroup[]
  magnet:import('./snap').DrawingMagnetMode
  snapping:import('./preferences').DrawingSnappingOptions
  hidden:boolean
  preventDragging:boolean
  history:DrawingHistoryState
  preferences?:import('./preferences').DrawingPreferencesState
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
