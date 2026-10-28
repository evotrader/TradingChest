import {marketIndex} from '../core/marketIndex'
import {drawingLogPrice} from './drawingLogPrice'
import {validateDrawingAlertRule,drawingAlertTools} from './drawingDocument'
import {drawingAlertTimestamp,validateDrawingAlertAnchors} from './drawingAnchors'
import {validateDrawingAlertLevelResolution} from './drawingLevelResolvers'
import type {DrawingAlertEvaluation,DrawingAlertEvaluationResult,DrawingAlertSample} from './drawingTypes'

/** Evaluate only observed closes. A bar's high/low never invents a price path. */
export function evaluateDrawingAlert(input:DrawingAlertEvaluation):DrawingAlertEvaluationResult {
  const state={...input.state},waiting=(reason:string):DrawingAlertEvaluationResult=>({state,status:'waiting',reason})
  const {rule,geometry,bars,current,previous}=input
  try {
    validateDrawingAlertRule(rule)
    if(!geometry||geometry.kind!==rule.target.kind||geometry.toolId!==rule.toolId)throw Error('提醒来源工具或目标不匹配')
    validateDrawingAlertAnchors(geometry.anchors,bars)
    const count=geometry.toolId==='horizontalStraightLine'?1:2
    if(geometry.kind==='line'&&(!drawingAlertTools.includes(geometry.toolId)||geometry.anchors.length!==count))throw Error('提醒来源工具或锚点数量无效')
    if(geometry.kind==='level'){
      if(rule.target.kind!=='level'||!geometry.target||geometry.target.kind!=='level'||geometry.target.resolverId!==rule.target.resolverId||geometry.target.parameterKey!==rule.target.parameterKey||geometry.target.levelId!==rule.target.levelId||!Number.isFinite(geometry.levelValue)||geometry.levelText!==undefined&&typeof geometry.levelText!=='string')throw Error('提醒级别目标或事件快照无效')
      const required=geometry.target.resolverId==='tradingchest/fibonacciLine'?2:geometry.target.resolverId==='tradingchest/fibonacciExtension'?3:undefined
      if(required!==undefined&&geometry.anchors.length!==required)throw Error('提醒来源锚点数量无效')
      validateDrawingAlertLevelResolution({status:'ready',referencePrice:geometry.referencePrice,from:geometry.from,to:geometry.to,comparisonKey:geometry.comparisonKey})
    }
    if(rule.frequency==='once'&&state.hasTriggered)return {state,status:'triggered',reason:'此提醒已触发，请重置并启用'}
    const logarithmic=input.axis==='log',value=(v:number)=>{
      if(!Number.isFinite(v)||logarithmic&&v<=0)throw Error('价格不适用于当前价格轴')
      return logarithmic?Math.log(v):v
    }
    const points=geometry.anchors.map(anchor=>{
      if(anchor.kind!=='market')throw Error('提醒只支持市场时间锚点')
      // Match projectAnchors: interpolate the market instant, then locate it in actual bars.
      const timestamp=drawingAlertTimestamp(anchor)
      return {x:marketIndex(timestamp,bars),y:value(anchor.value),price:anchor.value}
    })
    const reference=(sample:DrawingAlertSample)=>{
      value(sample.close)
      const x=marketIndex(sample.timestamp,bars)
      if(geometry.kind==='level'){
        value(geometry.referencePrice)
        if(geometry.from!==undefined&&sample.timestamp<geometry.from||geometry.to!==undefined&&sample.timestamp>geometry.to)throw Error('观测价格位于级别有效时间范围之外')
        return {price:geometry.referencePrice,level:geometry.referencePrice,observed:sample.close}
      }
      let y=points[0].y
      let exact:number|undefined=points[0].price
      if(count===2){
        const dx=points[1].x-points[0].x
        if(!Number.isFinite(dx)||dx===0)throw Error('垂直线不能用作价格穿越提醒')
        const u=(x-points[0].x)/dx
        if(!Number.isFinite(u))throw Error('参考位置超出可表示范围')
        if(geometry.toolId==='segment'&&(u<0||u>1)||geometry.toolId==='rayLine'&&u<0)throw Error('观测价格位于绘图有效范围之外，请使用直线或射线持续监控')
        exact=u===0?points[0].price:u===1?points[1].price:points[0].price===points[1].price?points[0].price:undefined
        if(exact===undefined)y=logarithmic?drawingLogPrice(points[0].price,points[1].price,x-points[0].x,dx,sample.close):(1-u)*points[0].y+u*points[1].y
      }
      const price=exact??y
      if(!Number.isFinite(price)||logarithmic&&price<=0)throw Error('参考价格超出可表示范围')
      return {price,level:price,observed:sample.close}
    }
    const now=reference(current)
    if(!previous)return {state,status:'monitoring',comparison:{...current}}
    if(current.timestamp<previous.timestamp)return waiting('观测时标已回退，请重新建立比较点')
    const before=reference(previous),up=before.observed<before.level&&now.observed>=now.level,down=before.observed>before.level&&now.observed<=now.level
    const crosses=rule.condition==='crossing'?up||down:rule.condition==='crossing-up'?up:rule.condition==='crossing-down'?down:false
    if(!crosses||rule.frequency==='once-per-bar'&&(state.lastBarTimestamp===current.timestamp||input.triggeredBarTimestamps?.has(current.timestamp)))return {state,status:'monitoring',comparison:{...current}}
    state.hasTriggered=true;state.lastBarTimestamp=current.timestamp
    return {state,status:rule.frequency==='once'?'triggered':'monitoring',comparison:{...current},event:{ruleId:rule.id,drawingLogicalId:rule.drawingLogicalId,identity:{...rule.identity},period:{...rule.period},barTimestamp:current.timestamp,triggerPrice:current.close,referencePrice:now.price,condition:rule.condition,mode:input.mode??'live',...(rule.message!==undefined?{message:rule.message}:{}),...(geometry.kind==='level'?{level:{resolverId:geometry.target.resolverId,parameterKey:geometry.target.parameterKey,levelId:geometry.target.levelId,value:geometry.levelValue,...(geometry.levelText!==undefined?{text:geometry.levelText}:{})}}:{})}}
  } catch(error) {return waiting(error instanceof Error?error.message:String(error))}
}
