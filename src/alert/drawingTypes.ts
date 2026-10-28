/** Portable contracts: no chart engine, UI framework or storage dependency. */
export type DrawingAlertTool='horizontalStraightLine'|'straightLine'|'segment'|'rayLine'
export type DrawingAlertCondition='crossing'|'crossing-up'|'crossing-down'
export type DrawingAlertFrequency='once'|'once-per-bar'
export interface DrawingAlertIdentity {ticker:string;market?:string;exchange?:string;priceCurrency?:string;basis?:string}
export interface DrawingAlertPeriod {multiplier:number;timespan:string}
export interface DrawingAlertAnchor {kind:'market';timestamp:number;value:number;interpolation?:{nextTimestamp:number;fraction:number}}
export type DrawingAlertTarget={kind:'line'}|{kind:'level';resolverId:string;parameterKey:string;levelId:string}
export type DrawingAlertGeometry=
  | {kind:'line';toolId:DrawingAlertTool;anchors:readonly DrawingAlertAnchor[]}
  | {kind:'level';toolId:string;target:Extract<DrawingAlertTarget,{kind:'level'}>;anchors:readonly DrawingAlertAnchor[];referencePrice:number;from?:number;to?:number;comparisonKey:string;levelValue:number;levelText?:string}
export interface DrawingAlertLevelResolverInput {
  toolId:string
  anchors:readonly DrawingAlertAnchor[]
  level:import('../drawing/levels').DrawingLevel
  parameters:import('../drawing/types').DrawingParameters
}
export type DrawingAlertLevelResolution=
  | {status:'ready';referencePrice:number;from?:number;to?:number;comparisonKey:string}
  | {status:'unavailable';reason:string}
export interface DrawingAlertLevelResolver {id:string;resolve:(input:DrawingAlertLevelResolverInput)=>DrawingAlertLevelResolution}
export interface DrawingAlertSample {timestamp:number;close:number}
export interface DrawingAlertRuleV1 {
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
export type DrawingAlertRule=Omit<DrawingAlertRuleV1,'toolId'>&(
  | {toolId:DrawingAlertTool;target:{kind:'line'}}
  | {toolId:string;target:Extract<DrawingAlertTarget,{kind:'level'}>}
)
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
  level?:{resolverId:string;parameterKey:string;levelId:string;value:number;text?:string}
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
  rules:Array<{rule:DrawingAlertRuleV1;hasTriggered:boolean;lastBarTimestamp?:number}>
}
export interface DrawingAlertDocumentV2 {version:2;scope:string;rules:Array<{rule:DrawingAlertRule;hasTriggered:boolean;lastBarTimestamp?:number}>}
export type DrawingAlertDocument=DrawingAlertDocumentV1|DrawingAlertDocumentV2
export type DrawingAlertCommand=
  | {type:'create';drawingLogicalId:string;target?:{kind:'level';levelId:string};id?:string;condition?:DrawingAlertCondition;frequency?:DrawingAlertFrequency;message?:string}
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
  /** Ephemeral caller-owned history across replay seeks; add returned event timestamps. */
  triggeredBarTimestamps?:ReadonlySet<number>
}
export interface DrawingAlertEvaluationResult {
  state:DrawingAlertMarkers
  status:'waiting'|'monitoring'|'triggered'
  reason?:string
  event?:DrawingAlertEvent
  /** Absent when either observation is outside the supported geometry. */
  comparison?:DrawingAlertSample
}
