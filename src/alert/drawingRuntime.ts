import {createOpaqueId} from '../ids'
import type {ChartDataState,Period,SymbolInfo} from '../types'
import type {ConfirmedSeries} from '../core/engineDataLoader'
import type {DrawingSnapshot,DrawingParameters,DrawingParameterPrimitive} from '../drawing/types'
import type {DrawingSourceInvalidation} from '../drawing/history'
import {copyDrawingCatalog,validateDrawingParameters,type DrawingToolDescriptor} from '../drawing/catalog'
import {isDrawingLevelSet,resolveDrawingLevels,type DrawingLevelPresetInput} from '../drawing/levels'
import {validateDrawingAlertAnchors} from './drawingAnchors'
import {createDrawingAlertResolverMap,validateDrawingAlertLevelResolution} from './drawingLevelResolvers'
import {evaluateDrawingAlert} from './drawingEvaluator'
import {drawingAlertTools,sameDrawingAlertIdentity,sameDrawingAlertPeriod,validateDrawingAlertDocument,validateDrawingAlertRule,migrateDrawingAlertDocument} from './drawingDocument'
import type {DrawingAlertCommand,DrawingAlertCommandResult,DrawingAlertDocument,DrawingAlertDocumentV2,DrawingAlertEvent,DrawingAlertGeometry,DrawingAlertIdentity,DrawingAlertMarkers,DrawingAlertRule,DrawingAlertSample,DrawingAlertState,DrawingAlertStatus,DrawingAlertTarget,DrawingAlertLevelResolver,DrawingAlertAnchor} from './drawingTypes'

type Mode='live'|'replay'
type Track=DrawingAlertMarkers&{status:DrawingAlertStatus;reason?:string;records:DrawingAlertEvent[];previous?:DrawingAlertSample}
type Entry={rule:DrawingAlertRule;enabled:boolean;live:Track;replay:Track;replayTriggeredBars:Set<number>;geometryKey?:string}
type Round={sources:Map<string,DrawingSnapshot|undefined>;geometries:Map<string,DrawingAlertGeometry|Error>}
const round=():Round=>({sources:new Map(),geometries:new Map()})
interface Context {series:ConfirmedSeries;state:ChartDataState;bars:readonly DrawingAlertSample[];axis:'linear'|'percentage'|'log';axisId?:string}
interface Options {
  scope?:string
  catalog?:DrawingToolDescriptor[]
  levelResolvers?:readonly DrawingAlertLevelResolver[]
  source:(id:string)=>DrawingSnapshot|undefined
  uncertain:(id:string)=>boolean
  restoring:()=>boolean
  changed?:(state:DrawingAlertState[])=>void
  invalidated?:(read:()=>DrawingAlertState[])=>void
  trigger?:(event:DrawingAlertEvent)=>void
  replayTrigger?:(event:DrawingAlertEvent)=>void
  error?:(error:unknown)=>void
}
const clone=<T>(value:T):T=>structuredClone(value)
const track=():Track=>({hasTriggered:false,status:'waiting',records:[]})
const identity=(symbol:SymbolInfo,basis?:string):DrawingAlertIdentity=>({ticker:symbol.ticker,...Object.fromEntries(['market','exchange','priceCurrency'].filter(key=>symbol[key as keyof SymbolInfo]!==undefined).map(key=>[key,symbol[key as keyof SymbolInfo]])),...(basis!==undefined?{basis}:{})})
const period=(value:Period)=>({multiplier:value.multiplier,timespan:value.timespan})
class SourceError extends Error {constructor(message:string,readonly status:'source-missing'|'unsupported'='unsupported'){super(message)}}
/** Consumes the loader's paired commit/state seam, never unconfirmed engine previews. */
export class DrawingAlertRuntime {
  readonly scope:string
  private entries=new Map<string,Entry>()
  private rulesBySource=new Map<string,Set<string>>()
  private catalog:DrawingToolDescriptor[]
  private resolvers:Map<string,DrawingAlertLevelResolver>
  private context?:Context
  private consumed?:string
  private currentMode:Mode='live'
  private disposed=false
  constructor(private options:Options){this.scope=options.scope??createOpaqueId();if(typeof this.scope!=='string'||!this.scope)throw Error('画线提醒 scope 不能为空');this.catalog=copyDrawingCatalog(options.catalog);this.resolvers=createDrawingAlertResolverMap(options.levelResolvers)}
  private safely(callback:(()=>void)|undefined):void{try{callback?.()}catch(error){try{this.options.error?.(error)}catch{}}}
  private emit():void{if(this.disposed)return;if(this.options.changed)this.safely(()=>this.options.changed!(this.getState()));if(this.options.invalidated)this.safely(()=>this.options.invalidated!(()=>this.getState()))}
  private clear(entry:Entry):void{entry.live.previous=undefined;entry.replay.previous=undefined}
  private readSource(id:string,cache:Round):DrawingSnapshot|undefined {
    if(!cache.sources.has(id))cache.sources.set(id,this.options.source(id))
    return cache.sources.get(id)
  }
  private index(rule:DrawingAlertRule):void{let ids=this.rulesBySource.get(rule.drawingLogicalId);if(!ids)this.rulesBySource.set(rule.drawingLogicalId,ids=new Set());ids.add(rule.id)}
  private getSource(rule:DrawingAlertRule,cache=round()):DrawingSnapshot {
    const source=this.readSource(rule.drawingLogicalId,cache)
    if(!source||source.owner!==rule.sourceOwner||source.backendId!==rule.backendId)throw Error('提醒来源已删除或身份已改变，请重新选择来源')
    if(source.overlay.name!==rule.toolId)throw Error('提醒来源工具已改变')
    return source
  }
  private resolve(rule:DrawingAlertRule,cache:Round):DrawingAlertGeometry {
    const source=this.getSource(rule,cache),id=JSON.stringify([rule.drawingLogicalId,rule.target])
    if(!cache.geometries.has(id)){try{cache.geometries.set(id,this.geometry(source,rule.target))}catch(error){cache.geometries.set(id,error instanceof Error?error:Error(String(error)))}}
    const value=cache.geometries.get(id)!
    if(value instanceof Error)throw value
    return value
  }
  private anchors(source:DrawingSnapshot):DrawingAlertAnchor[] {
    if(source.presentation?.scope&&source.presentation.scope!=='chart'||source.migration)throw Error('画线提醒仅支持本图作用域的已确认来源')
    if(source.owner==='backend'&&!source.backendId)throw Error('后端来源缺少已确认身份，请刷新原来源')
    if((source.overlay.paneId??'candle_pane')!=='candle_pane'||source.yAxisId&&source.yAxisId!==this.context?.axisId)throw Error('画线提醒只支持主价格窗格的默认价格轴')
    const anchors=source.anchors
    if(!anchors||anchors.some(anchor=>anchor.kind!=='market'))throw Error('画线提醒需要完整的市场时间锚点；后续根数／视口锚点暂不支持')
    if(this.context?.axis==='log'&&anchors.some(anchor=>anchor.kind==='market'&&anchor.value<=0))throw Error('当前对数价格轴不能投影此来源')
    return clone(anchors) as DrawingAlertAnchor[]
  }
  private capability(source:DrawingSnapshot){
    const tool=this.catalog.find(tool=>tool.overlayName===source.overlay.name),capability=tool?.alertLevels
    if(!tool||!capability)throw Error('此工具未声明级别提醒能力')
    const resolver=this.resolvers.get(capability.resolverId)
    if(!resolver)throw Error(`缺少级别提醒解析器：${capability.resolverId}`)
    return {tool,capability,resolver}
  }
  private geometry(source:DrawingSnapshot,target:DrawingAlertTarget={kind:'line'}):DrawingAlertGeometry {
    const anchors=this.anchors(source),toolId=source.overlay.name
    if(target.kind==='line'){
      if(!drawingAlertTools.includes(toolId as any))throw Error('此工具需要选择一个级别创建提醒')
      if(anchors.length!==(toolId==='horizontalStraightLine'?1:2))throw Error('提醒来源锚点数量无效')
      return {kind:'line',toolId:toolId as import('./drawingTypes').DrawingAlertTool,anchors}
    }
    const {tool,capability,resolver}=this.capability(source)
    if(target.resolverId!==capability.resolverId||target.parameterKey!==capability.parameterKey)throw Error('级别提醒能力绑定已改变，请重新创建提醒')
    if(anchors.length<tool.minPoints||tool.maxPoints!==null&&anchors.length>tool.maxPoints)throw Error('提醒来源锚点数量无效')
    const levels=source.parameters?.[target.parameterKey]
    if(!isDrawingLevelSet(levels))throw Error('请先显式初始化级别，确认后重新选择')
    const level=levels.items.find(level=>level.id===target.levelId)
    if(!level)throw new SourceError('提醒级别已删除，请恢复原级别或重新创建提醒','source-missing')
    if(!level.visible)throw Error('提醒级别已关闭，请开启后手动继续监控')
    validateDrawingParameters(tool,source.parameters??{})
    validateDrawingAlertAnchors(anchors,this.context?.bars??[])
    const parameters:DrawingParameters=Object.fromEntries(tool.parameters.map(parameter=>[parameter.key,source.parameters?.[parameter.key]??(parameter.kind==='level-set'?resolveDrawingLevels(undefined,parameter.defaultValue as Exclude<DrawingLevelPresetInput,undefined>):parameter.defaultValue as DrawingParameterPrimitive)]))
    const result=resolver.resolve(clone({toolId,anchors,level,parameters}))
    validateDrawingAlertLevelResolution(result)
    if(result.status!=='ready')throw Error(result.reason)
    if(this.context?.axis==='log'&&result.referencePrice<=0)throw Error('当前对数价格轴不能投影此级别')
    return {kind:'level',toolId,target:clone(target),anchors,referencePrice:result.referencePrice,from:result.from,to:result.to,comparisonKey:result.comparisonKey,levelValue:level.value,...(level.text!==undefined?{levelText:level.text}:{})}
  }
  private geometryKey(geometry:DrawingAlertGeometry):string {
    if(geometry.kind==='line')return JSON.stringify([geometry,this.context?.axis,this.context?.axisId])
    const {levelValue,levelText,...comparison}=geometry
    return JSON.stringify([comparison,this.context?.axis,this.context?.axisId])
  }
  getState():DrawingAlertState[]{
    return [...this.entries.values()].map(entry=>{
      const {previous:ignored,...live}=entry.live,{previous:ignoredReplay,...replay}=entry.replay
      return clone({rule:entry.rule,enabled:entry.enabled,...live,replay})
    })
  }
  capture():DrawingAlertDocumentV2 {
    return clone({version:2,scope:this.scope,rules:[...this.entries.values()].map(({rule,live})=>({rule,hasTriggered:live.hasTriggered,...(live.lastBarTimestamp!==undefined?{lastBarTimestamp:live.lastBarTimestamp}:{})}))})
  }
  sourceReason(id:string,levelId?:string):string|undefined {
    try{
      if(!this.context?.series.confirmed||this.context.state.dataStatus!=='ready')throw Error('请先加载已确认行情')
      const source=this.options.source(id)
      if(!source||this.options.uncertain(id)||this.options.restoring())throw Error('绘图来源尚未确认，请等待或刷新原来源')
      if(source.owner==='backend'&&!source.backendId)throw Error('后端来源缺少已确认身份，请刷新原来源')
      if(drawingAlertTools.includes(source.overlay.name as any)&&levelId===undefined)this.geometry(source)
      else {this.anchors(source);const {capability}=this.capability(source);if(levelId!==undefined)this.geometry(source,{kind:'level',...capability,levelId})}
    }catch(error){return error instanceof Error?error.message:String(error)}
  }
  restore(value:DrawingAlertDocument):void {
    if(this.disposed)throw Error('图表已关闭')
    validateDrawingAlertDocument(value,this.scope)
    const document=migrateDrawingAlertDocument(value)
    const next=new Map<string,Entry>()
    const cache=round()
    for(const item of document.rules){
      // Rules for another series remain paused; only current-context rules can bind here.
      const matches=this.context&&sameDrawingAlertIdentity(item.rule.identity,identity(this.context.series.symbol,this.context.series.basis))&&sameDrawingAlertPeriod(item.rule.period,this.context.series.period)
      const entry:Entry={rule:clone(item.rule),enabled:false,live:{...track(),hasTriggered:item.hasTriggered,lastBarTimestamp:item.lastBarTimestamp,status:'paused',reason:matches?'已恢复为暂停；继续监控保留去重，重置并启用会清除去重':'已恢复为暂停，请切回创建时的标的、口径和周期'},replay:{...track(),status:'paused'},replayTriggeredBars:new Set()}
      if(matches)try{entry.geometryKey=this.geometryKey(this.resolve(entry.rule,cache))}catch(error){for(const mode of ['live','replay'] as const){entry[mode].status=this.sourceStatus(error,entry.rule,cache);entry[mode].reason=error instanceof Error?error.message:String(error)}}
      next.set(item.rule.id,entry)
    }
    cache.sources.clear();cache.geometries.clear()
    this.entries=next;this.rulesBySource.clear();for(const entry of next.values())this.index(entry.rule);this.emit()
  }
  execute(command:DrawingAlertCommand):DrawingAlertCommandResult {
    if(this.disposed)return {status:'rejected',message:'图表已关闭'}
    try {
      if(command.type==='create'){
        const context=this.context
        if(!context||!context.series.confirmed||context.state.dataStatus!=='ready')throw Error('请先加载已确认行情再添加提醒')
        const source=this.options.source(command.drawingLogicalId)
        if(!source||this.options.uncertain(command.drawingLogicalId)||this.options.restoring())throw Error('绘图来源尚未确认，请等待或刷新原来源')
        if(command.target&&(command.target.kind!=='level'||Object.keys(command.target).some(key=>!['kind','levelId'].includes(key))||typeof command.target.levelId!=='string'||!command.target.levelId))throw Error('提醒级别目标无效')
        const target:DrawingAlertTarget=command.target?{kind:'level',...this.capability(source).capability,levelId:command.target.levelId}:{kind:'line'}
        const geometry=this.geometry(source,target),id=command.id??createOpaqueId()
        const rule={id,drawingLogicalId:source.logicalId,sourceOwner:source.owner,...(source.owner==='backend'?{backendId:source.backendId}:{}),toolId:geometry.toolId,target,identity:identity(context.series.symbol,context.series.basis),period:period(context.series.period),condition:command.condition??'crossing',frequency:command.frequency??'once',...(command.message!==undefined?{message:command.message}:{})} as DrawingAlertRule
        validateDrawingAlertRule(rule)
        if(this.entries.has(id))throw Error('画线提醒 ID 已存在')
        this.entries.set(id,{rule,enabled:true,live:track(),replay:track(),replayTriggeredBars:new Set(),geometryKey:this.geometryKey(geometry)});this.index(rule);this.emit()
        return {status:'completed',id}
      }
      const entry=this.entries.get(command.id)
      if(!entry)throw Error('画线提醒不存在')
      if(command.type==='delete'){this.entries.delete(command.id);const ids=this.rulesBySource.get(entry.rule.drawingLogicalId);ids?.delete(command.id);if(!ids?.size)this.rulesBySource.delete(entry.rule.drawingLogicalId)}
      else if(command.type==='update'){
        if(!command.patch||Object.keys(command.patch).some(key=>!['condition','frequency','message'].includes(key)))throw Error('不能通过更新更换提醒来源或身份')
        const next={...entry.rule,...clone(command.patch)};validateDrawingAlertRule(next)
        this.resolve(next,round())
        const comparisonChanged=next.condition!==entry.rule.condition||next.frequency!==entry.rule.frequency
        if(comparisonChanged)this.clear(entry)
        entry.rule=next
        if(entry.enabled&&comparisonChanged){const current=entry[this.currentMode];if(['monitoring','waiting','triggered'].includes(current.status))current.status=next.frequency==='once'&&current.hasTriggered?'triggered':'waiting'}
      }else if(command.type==='pause'){
        entry.enabled=false;this.clear(entry);for(const mode of ['live','replay'] as const){entry[mode].status='paused';entry[mode].reason='已暂停'}
      }else if(command.type==='resume'||command.type==='rearm'){
        const context=this.context
        if(!context||!sameDrawingAlertIdentity(entry.rule.identity,identity(context.series.symbol,context.series.basis))||!sameDrawingAlertPeriod(entry.rule.period,context.series.period))throw Error('请先切回提醒创建时的标的、行情口径和周期')
        if(this.options.uncertain(entry.rule.drawingLogicalId)||this.options.restoring())throw Error('绘图来源尚未确认，请刷新原来源')
        const geometry=this.resolve(entry.rule,round()),current=entry[this.currentMode]
        if(command.type==='resume'&&entry.rule.frequency==='once'&&current.hasTriggered)throw Error('此提醒已触发，请使用“重置并启用”')
        if(command.type==='rearm'){current.hasTriggered=false;delete current.lastBarTimestamp;if(this.currentMode==='replay')entry.replayTriggeredBars.clear()}
        this.clear(entry);entry.enabled=true;entry.geometryKey=this.geometryKey(geometry);current.status='waiting';current.reason='等待下一个有效样本建立比较点'
      }else throw Error('画线提醒命令无效')
      this.emit();return {status:'completed',id:command.id}
    }catch(error){return {status:'rejected',message:error instanceof Error?error.message:String(error)}}
  }
  /** Source confirmation is independent of price content revisions. */
  private sourceStatus(error:unknown,rule:DrawingAlertRule,cache:Round):'source-missing'|'unsupported'{return error instanceof SourceError?error.status:this.readSource(rule.drawingLogicalId,cache)?'unsupported':'source-missing'}
  refreshSources(sources:DrawingSourceInvalidation='all'):void {
    const cache=round(),changed=this.refresh(sources,cache)
    cache.sources.clear();cache.geometries.clear()
    if(changed)this.emit()
  }
  private refresh(sources:DrawingSourceInvalidation,cache:Round):boolean {
    if(this.disposed||!this.entries.size||!this.context?.series.confirmed)return false
    const entries=sources==='all'?this.entries.values():[...new Set(sources.flatMap(id=>[...(this.rulesBySource.get(id)??[])]))].map(id=>this.entries.get(id)!)
    if(this.options.restoring()){
      let changed=false
      for(const entry of entries){this.clear(entry);for(const mode of ['live','replay'] as const){if(entry[mode].status!=='data-unavailable')changed=true;entry[mode].status='data-unavailable';entry[mode].reason='绘图布局正在恢复'}}
      return changed
    }
    let changed=false
    for(const entry of entries){
      if(!sameDrawingAlertIdentity(entry.rule.identity,identity(this.context.series.symbol,this.context.series.basis))||!sameDrawingAlertPeriod(entry.rule.period,this.context.series.period))continue
      try{
        if(this.options.uncertain(entry.rule.drawingLogicalId)){this.clear(entry);for(const mode of ['live','replay'] as const){entry[mode].status='data-unavailable';entry[mode].reason='来源提交结果待确认，请刷新原绘图'}changed=true;continue}
        const geometry=this.resolve(entry.rule,cache),key=this.geometryKey(geometry)
        if(key!==entry.geometryKey){entry.geometryKey=key;this.clear(entry);changed=true}
      }catch(error){
        const status=this.sourceStatus(error,entry.rule,cache),reason=error instanceof Error?error.message:String(error)
        if(entry.enabled||entry.live.status!==status||entry.live.reason!==reason){entry.enabled=false;this.clear(entry);for(const mode of ['live','replay'] as const){entry[mode].status=status;entry[mode].reason=reason}changed=true}
      }
    }
    return changed
  }
  axisChanged(axis:Context['axis'],axisId?:string):boolean {
    const context=this.context
    if(this.disposed||!context||context.axis===axis&&context.axisId===axisId)return false
    this.context={...context,axis,axisId}
    for(const entry of this.entries.values())this.clear(entry)
    const cache=round()
    let changed=this.refresh('all',cache)
    for(const entry of this.entries.values()){
      if(!entry.enabled||!sameDrawingAlertIdentity(entry.rule.identity,identity(context.series.symbol,context.series.basis))||!sameDrawingAlertPeriod(entry.rule.period,context.series.period))continue
      for(const mode of ['live','replay'] as const){
        const current=entry[mode]
        if(current.status==='data-unavailable'||entry.rule.frequency==='once'&&current.hasTriggered)continue
        current.status='waiting';current.reason='价格轴已改变，等待下一个有效样本建立比较点';changed=true
      }
    }
    cache.sources.clear();cache.geometries.clear()
    if(changed)this.emit()
    return true
  }
  contextChanging():void {
    this.context=undefined;this.consumed=undefined
    for(const entry of this.entries.values())this.clear(entry)
  }
  consume(series:ConfirmedSeries,state:ChartDataState,bars:readonly DrawingAlertSample[],axis:'linear'|'percentage'|'log',axisId?:string):void {
    if(this.disposed)return
    const previousContext=this.context,mode=series.replay?'replay':'live'
    const contextChanged=!previousContext||previousContext.series.epoch!==series.epoch||previousContext.series.revision!==series.revision||!sameDrawingAlertIdentity(identity(previousContext.series.symbol,previousContext.series.basis),identity(series.symbol,series.basis))||!sameDrawingAlertPeriod(previousContext.series.period,series.period)||previousContext.axis!==axis||previousContext.axisId!==axisId||this.currentMode!==mode
    this.context={series,state,bars,axis,axisId};this.currentMode=mode
    if(contextChanged){this.consumed=undefined;for(const entry of this.entries.values())this.clear(entry)}
    if(!this.entries.size)return
    const cache=round()
    let changed=this.refresh('all',cache)
    const unavailable=!series.confirmed||state.dataStatus!=='ready'||!!state.error||state.revisionRequired||['disconnected','reconnecting','failed'].includes(state.connection)||this.options.restoring()
    const key=JSON.stringify([series.epoch,series.contentRevision,mode])
    const fresh=key!==this.consumed
    if(!state.restoring)this.consumed=key
    const deliveries:DrawingAlertEvent[]=[]
    for(const entry of this.entries.values()){
      const current=entry[mode],before=JSON.stringify([current.status,current.reason,current.hasTriggered,current.lastBarTimestamp])
      if(!entry.enabled)continue
      if(!sameDrawingAlertIdentity(entry.rule.identity,identity(series.symbol,series.basis))||!sameDrawingAlertPeriod(entry.rule.period,series.period)){
        current.previous=undefined;current.status='context-mismatch';current.reason='标的、行情口径或周期不匹配，已暂停等待原上下文'
      }else if(unavailable||this.options.uncertain(entry.rule.drawingLogicalId)){
        current.previous=undefined;current.status='data-unavailable';current.reason=state.error??'行情或来源尚未确认，等待恢复'
      }else if(state.restoring){
        // A regular snapshot may briefly load. Real reloads cannot bridge observations.
        if(series.writer!=='snapshot')current.previous=undefined
        current.status='data-unavailable';current.reason='行情正在读取'
      }else if(fresh){
        try{
          const geometry=this.resolve(entry.rule,cache),sample=bars.at(-1)
          if(!sample)throw Error('暂无已确认行情')
          if(series.contentChange!=='tail'||contextChanged)current.previous=undefined
          const result=evaluateDrawingAlert({rule:entry.rule,geometry,bars,previous:current.previous,current:sample,state:current,axis,mode,triggeredBarTimestamps:mode==='replay'?entry.replayTriggeredBars:undefined})
          current.previous=result.comparison;current.hasTriggered=result.state.hasTriggered;current.lastBarTimestamp=result.state.lastBarTimestamp;current.status=result.status;current.reason=result.reason
          if(!result.reason&&state.connection==='unknown')current.reason='连接状态未声明；按已确认输入监控'
          if(!result.reason&&series.basis===undefined)current.reason=[current.reason,'行情口径未声明；恢复后需手动继续'].filter(Boolean).join('；')
          if(result.event){if(mode==='replay')entry.replayTriggeredBars.add(result.event.barTimestamp);current.records.push(result.event);if(current.records.length>100)current.records.shift();deliveries.push(result.event);changed=true}
        }catch(error){current.previous=undefined;current.status='waiting';current.reason=error instanceof Error?error.message:String(error)}
      }
      if(before!==JSON.stringify([current.status,current.reason,current.hasTriggered,current.lastBarTimestamp]))changed=true
    }
    // Commit markers and records before any host callback can reenter or throw.
    cache.sources.clear();cache.geometries.clear()
    if(changed)this.emit()
    for(const event of deliveries)this.safely(()=>event.mode==='replay'?this.options.replayTrigger?.(clone(event)):this.options.trigger?.(clone(event)))
  }
  dispose():void{this.disposed=true;this.entries.clear();this.rulesBySource.clear();this.resolvers.clear();this.catalog=[];this.context=undefined;this.consumed=undefined}
}
