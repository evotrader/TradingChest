import {fibonacciLevelPrice,fibonacciLevelDomain,type FibonacciKind} from '../drawing/fibonacciMath'
import {drawingAlertTimestamp} from './drawingAnchors'
import type {DrawingAlertLevelResolution,DrawingAlertLevelResolver} from './drawingTypes'

function fibonacciResolver(kind:FibonacciKind):DrawingAlertLevelResolver {
 return Object.freeze<DrawingAlertLevelResolver>({id:`tradingchest/${kind}`,resolve:({anchors,level,parameters})=>{
  const {calculationMode,reverse,extendLeft,extendRight}=parameters
  if(!['linear','log'].includes(calculationMode as string)||[reverse,extendLeft,extendRight].some(value=>typeof value!=='boolean'))return {status:'unavailable',reason:'Fib 计算或延伸参数无效'}
  const times=anchors.map(drawingAlertTimestamp),values=anchors.map(anchor=>anchor.value)
  const referencePrice=fibonacciLevelPrice(kind,values,level.value,calculationMode as 'linear'|'log',reverse as boolean)
  const domain=fibonacciLevelDomain(kind,times,extendLeft as boolean,extendRight as boolean)
  return {status:'ready',referencePrice,...domain,comparisonKey:JSON.stringify([kind,anchors,level.value,calculationMode,reverse,extendLeft,extendRight])}
 }})
}
export const builtinDrawingAlertLevelResolvers:readonly DrawingAlertLevelResolver[]=Object.freeze([fibonacciResolver('fibonacciLine'),fibonacciResolver('fibonacciExtension')])
export function createDrawingAlertResolverMap(custom:readonly DrawingAlertLevelResolver[]=[]):Map<string,DrawingAlertLevelResolver> {
 if(!Array.isArray(custom))throw Error('级别提醒解析器必须为数组')
 const result=new Map<string,DrawingAlertLevelResolver>()
 for(const resolver of [...builtinDrawingAlertLevelResolvers,...custom]){
  if(!resolver||typeof resolver.id!=='string'||!resolver.id.trim()||typeof resolver.resolve!=='function'||result.has(resolver.id))throw Error('级别提醒解析器 ID 为空、重复或不可调用')
  result.set(resolver.id,Object.freeze({id:resolver.id,resolve:resolver.resolve}))
 }
 return result
}
export function validateDrawingAlertLevelResolution(value:unknown):asserts value is DrawingAlertLevelResolution {
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('级别提醒解析器返回无效结果')
 const result=value as Record<string,unknown>
 if(result.status==='unavailable'){
  if(Object.keys(result).some(key=>!['status','reason'].includes(key))||typeof result.reason!=='string'||!result.reason.trim())throw Error('级别提醒解析器缺少不可用原因')
  return
 }
 if(result.status!=='ready'||Object.keys(result).some(key=>!['status','referencePrice','from','to','comparisonKey'].includes(key))||typeof result.referencePrice!=='number'||!Number.isFinite(result.referencePrice)||typeof result.comparisonKey!=='string'||!result.comparisonKey.trim()||[result.from,result.to].some(value=>value!==undefined&&(typeof value!=='number'||!Number.isFinite(value)))||result.from!==undefined&&result.to!==undefined&&(result.from as number)>(result.to as number))throw Error('级别提醒解析器必须同步返回有限价格、有效时间域和比较键')
}
