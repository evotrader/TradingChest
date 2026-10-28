import type {DrawingAlertDocument,DrawingAlertDocumentV2,DrawingAlertRule,DrawingAlertIdentity,DrawingAlertPeriod} from './drawingTypes'
export const drawingAlertTools=['horizontalStraightLine','straightLine','segment','rayLine'] as const
export const drawingAlertIdentityKeys=['ticker','market','exchange','priceCurrency','basis'] as const
const object=(value:unknown):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value)
const text=(value:unknown):value is string=>typeof value==='string'&&value.length>0
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)
const keys=(value:Record<string,any>,allowed:readonly string[])=>Object.keys(value).every(key=>allowed.includes(key))
export const sameDrawingAlertIdentity=(a:DrawingAlertIdentity,b:DrawingAlertIdentity):boolean=>drawingAlertIdentityKeys.every(key=>a[key]===b[key])
export const sameDrawingAlertPeriod=(a:DrawingAlertPeriod,b:DrawingAlertPeriod):boolean=>a.multiplier===b.multiplier&&a.timespan===b.timespan
export function validateDrawingAlertRule(rule:DrawingAlertRule):void {
  if(!object(rule)||!keys(rule,['id','drawingLogicalId','sourceOwner','backendId','toolId','identity','period','condition','frequency','message','target'])||!text(rule.id)||!text(rule.drawingLogicalId)||!['local','backend'].includes(rule.sourceOwner)||rule.sourceOwner==='backend'&&!text(rule.backendId)||rule.sourceOwner==='local'&&rule.backendId!==undefined||!text(rule.toolId)||!['crossing','crossing-up','crossing-down'].includes(rule.condition)||!['once','once-per-bar'].includes(rule.frequency)||rule.message!==undefined&&typeof rule.message!=='string')throw Error('画线提醒规则无效或包含不支持的工具／参数')
  const target=rule.target
  if(!object(target)||(target.kind==='line'? !keys(target,['kind'])||!drawingAlertTools.includes(rule.toolId as any):target.kind==='level'? !keys(target,['kind','resolverId','parameterKey','levelId'])||![target.resolverId,target.parameterKey,target.levelId].every(text):true))throw Error('画线提醒目标无效或包含不支持的工具／参数')
  const {identity,period}=rule
  if(!object(identity)||!keys(identity,drawingAlertIdentityKeys)||!text(identity.ticker)||drawingAlertIdentityKeys.some(key=>key!=='ticker'&&identity[key]!==undefined&&!text(identity[key])))throw Error('画线提醒行情身份无效')
  if(!object(period)||!keys(period,['multiplier','timespan'])||!Number.isSafeInteger(period.multiplier)||period.multiplier<=0||!['second','minute','hour','day','week','month','year'].includes(period.timespan))throw Error('画线提醒周期无效')
}
/** Validate the complete document before the caller changes any existing instance. */
export function validateDrawingAlertDocument(value:unknown,scope?:string):asserts value is DrawingAlertDocument {
  if(!object(value)||!keys(value,['version','scope','rules'])||![1,2].includes(value.version)||!text(value.scope)||scope!==undefined&&value.scope!==scope||!Array.isArray(value.rules))throw Error('画线提醒文档版本或 scope 无效')
  const ids=new Set<string>()
  for(const entry of value.rules){
    if(!object(entry)||!keys(entry,['rule','hasTriggered','lastBarTimestamp'])||typeof entry.hasTriggered!=='boolean'||entry.lastBarTimestamp!==undefined&&!finite(entry.lastBarTimestamp)||entry.hasTriggered!==(entry.lastBarTimestamp!==undefined))throw Error('画线提醒去重标记无效')
    if(value.version===1){if(!object(entry.rule)||Object.hasOwn(entry.rule,'target'))throw Error('v1 提醒不能包含级别目标');validateDrawingAlertRule({...entry.rule,target:{kind:'line'}} as DrawingAlertRule)}
    else validateDrawingAlertRule(entry.rule)
    if(ids.has(entry.rule.id))throw Error('画线提醒包含重复 ID')
    ids.add(entry.rule.id)
  }
}
/** Reading never upgrades storage or enables restored rules. */
export function migrateDrawingAlertDocument(value:DrawingAlertDocument):DrawingAlertDocumentV2 {
  validateDrawingAlertDocument(value)
  if(value.version===2)return structuredClone(value)
  return {version:2,scope:value.scope,rules:value.rules.map(({rule,...markers})=>({...markers,rule:{...structuredClone(rule),target:{kind:'line'}}}))}
}
