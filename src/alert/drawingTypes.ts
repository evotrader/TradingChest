/** Portable contracts: no chart engine, UI framework or storage dependency. */
export type DrawingAlertTool='horizontalStraightLine'|'straightLine'|'segment'|'rayLine'
export type DrawingAlertCondition='crossing'|'crossing-up'|'crossing-down'
export type DrawingAlertFrequency='once'|'once-per-bar'
export interface DrawingAlertIdentity {ticker:string;market?:string;exchange?:string;priceCurrency?:string;basis?:string}
export interface DrawingAlertPeriod {multiplier:number;timespan:string}
export interface DrawingAlertAnchor {kind:'market';timestamp:number;value:number;interpolation?:{nextTimestamp:number;fraction:number}}
export interface DrawingAlertGeometry {toolId:DrawingAlertTool;anchors:readonly DrawingAlertAnchor[]}
export interface DrawingAlertSample {timestamp:number;close:number}
export interface DrawingAlertRule {
  id:string
  drawingLogicalId:string
  sourceOwner:'local'|'backend'
  backendId?:string
  toolId:DrawingAlertTool
  identity:DrawingAlertIdentity
  period:DrawingAlertPeriod
  condition:DrawingAlertCondition
  frequency:DrawingAlertFrequency
  message?:string
}
export interface DrawingAlertMarkers {hasTriggered:boolean;lastBarTimestamp?:number}
export type DrawingAlertStatus='paused'|'waiting'|'monitoring'|'triggered'|'source-missing'|'unsupported'|'data-unavailable'|'context-mismatch'
export interface DrawingAlertEvent {
  ruleId:string
  drawingLogicalId:string
  identity:DrawingAlertIdentity
  period:DrawingAlertPeriod
  barTimestamp:number
  triggerPrice:number
  referencePrice:number
  condition:DrawingAlertCondition
  mode:'live'|'replay'
  message?:string
}
export interface DrawingAlertState extends DrawingAlertMarkers {
  rule:DrawingAlertRule
  enabled:boolean
  status:DrawingAlertStatus
  reason?:string
  records:DrawingAlertEvent[]
  replay:DrawingAlertMarkers&{status:DrawingAlertStatus;reason?:string;records:DrawingAlertEvent[]}
}
export interface DrawingAlertDocumentV1 {
  version:1
  scope:string
  rules:Array<{rule:DrawingAlertRule;hasTriggered:boolean;lastBarTimestamp?:number}>
}
export type DrawingAlertCommand=
  | {type:'create';drawingLogicalId:string;id?:string;condition?:DrawingAlertCondition;frequency?:DrawingAlertFrequency;message?:string}
  | {type:'update';id:string;patch:Partial<Pick<DrawingAlertRule,'condition'|'frequency'|'message'>>}
  | {type:'pause'|'resume'|'rearm'|'delete';id:string}
export interface DrawingAlertCommandResult {status:'completed'|'rejected';id?:string;message?:string}
export interface DrawingAlertEvaluation {
  rule:DrawingAlertRule
  geometry:DrawingAlertGeometry
  bars:readonly {timestamp:number}[]
  previous?:DrawingAlertSample
  current:DrawingAlertSample
  state:DrawingAlertMarkers
  axis?:'linear'|'percentage'|'log'
  mode?:'live'|'replay'
}
export interface DrawingAlertEvaluationResult {
  state:DrawingAlertMarkers
  status:'waiting'|'monitoring'|'triggered'
  reason?:string
  event?:DrawingAlertEvent
  /** Absent when either observation is outside the supported geometry. */
  comparison?:DrawingAlertSample
}
