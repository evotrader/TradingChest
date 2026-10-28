// @vitest-environment jsdom
import {describe,it,expect,vi} from 'vitest'
import {DrawingAlertRuntime} from '../drawingRuntime'
import {evaluateDrawingAlert} from '../drawingEvaluator'
import {fibonacciLevelPrice} from '../../drawing/fibonacciMath'
import {fibonacciLevelFigures} from '../../extension/fibonacciLevels'
import {copyDrawingCatalog,drawingToolDefinition,type DrawingToolDescriptor} from '../../drawing/catalog'
import type {DrawingSnapshot} from '../../drawing/types'
import type {DrawingAlertLevelResolver,DrawingAlertRule,DrawingAlertGeometry} from '../drawingTypes'

const symbol={ticker:'AUDIT'},period={multiplier:1,timespan:'minute',text:'1m'}
const bars=[0,1000,2000,3000].map(timestamp=>({timestamp,close:99}))
const adjacent=(value:number,direction:-1|1)=>{const data=new DataView(new ArrayBuffer(8));data.setFloat64(0,value);data.setBigUint64(0,data.getBigUint64(0)+BigInt(direction));return data.getFloat64(0)}
const source=(kind='fibonacciLine',ratio=0,mode='log',reverse=false):DrawingSnapshot=>({logicalId:'d',owner:'local',parameters:{levels:{version:1,items:[{id:'stable',value:ratio,visible:true}]},calculationMode:mode,reverse,extendLeft:true,extendRight:true},anchors:[10,100,...(kind==='fibonacciExtension'?[100]:[])].map((value,index)=>({kind:'market',timestamp:index*1000,value})),overlay:{id:'d',name:kind,points:[],styles:null,extendData:null,visible:true,lock:false}})
function setup(object:DrawingSnapshot,catalog?:DrawingToolDescriptor[],resolvers?:DrawingAlertLevelResolver[],restoring=()=>false){
 let revision=0
 const trigger=vi.fn(),replayTrigger=vi.fn(),runtime=new DrawingAlertRuntime({scope:'audit',catalog,levelResolvers:resolvers,source:()=>structuredClone(object),uncertain:()=>false,restoring,trigger,replayTrigger})
 const consume=(close:number,timestamp=3000,replay=false,axis:'linear'|'log'='linear')=>runtime.consume({symbol,period,epoch:1,revision:1,contentRevision:++revision,contentChange:'tail',confirmed:true,replay},{symbol,period,dataStatus:'ready',replay,restoring:false,connection:'connected',revisionRequired:false},[...bars.filter(bar=>bar.timestamp<timestamp),{timestamp,close}],axis,'default')
 consume(99)
 const create=()=>runtime.execute({type:'create',id:'rule',drawingLogicalId:'d',target:{kind:'level',levelId:'stable'},frequency:'once-per-bar'})
 return {runtime,consume,create,trigger,replayTrigger}
}
function figures(object:DrawingSnapshot,tool:DrawingToolDescriptor){
 const values=object.anchors!.map(anchor=>(anchor as {value:number}).value)
 return fibonacciLevelFigures({chart:{getLocale:()=> 'zh-CN',getSymbol:()=>({pricePrecision:6}),getStyles:()=>({overlay:{line:{color:'#123456',size:2,style:'solid',dashedValue:[3,3]},text:{color:'#123456',size:12},polygon:{color:'#123456'}}})},overlay:{...object.overlay,points:values.map((value,index)=>({timestamp:index*1000,value})),extendData:{drawingParameters:object.parameters}},coordinates:values.map((value,index)=>({x:30+index*60,y:value})),bounding:{width:300,height:200},yAxis:{name:'normal',convertToPixel:(value:number)=>value},[drawingToolDefinition]:tool} as any,object.overlay.name as 'fibonacciLine'|'fibonacciExtension')
}

describe('exact Fib logarithmic alert prices',()=>{
 for(const kind of ['fibonacciLine','fibonacciExtension'] as const)for(const reverse of [false,true])for(const ratio of [0,1])it(`${kind} reverse=${reverse} ratio=${ratio} preserves exact endpoints and adjacent prices`,()=>{
  const price=kind==='fibonacciLine'?(reverse?ratio===0?10:100:ratio===0?100:10):ratio===0?100:reverse?10:1000
  expect(fibonacciLevelPrice(kind,kind==='fibonacciLine'?[10,100]:[10,100,100],ratio,'log',reverse)).toBe(price)
  for(const [before,after,fires] of [[adjacent(price,-1),price,true],[price,adjacent(price,1),false],[adjacent(price,1),price,true],[price,adjacent(price,-1),false]] as const){
   const s=setup(source(kind,ratio,'log',reverse));expect(s.create().status).toBe('completed');s.consume(before);s.consume(after)
   expect(s.trigger).toHaveBeenCalledTimes(Number(fires));if(fires)expect(s.trigger.mock.calls[0][0].referencePrice).toBe(price);s.runtime.dispose()
  }
 })
 it('preserves non-endpoint exact geometric prices and flat anchors without host Decimal settings',async()=>{
  const {default:Decimal}=await import('decimal.js'),previous={precision:Decimal.precision,rounding:Decimal.rounding,minE:Decimal.minE,maxE:Decimal.maxE}
  try{
   Decimal.set({precision:3,rounding:Decimal.ROUND_UP,minE:-2,maxE:2})
   for(const [kind,values,ratio,reverse,price] of [['fibonacciLine',[49,81],.5,false,63],['fibonacciExtension',[49,81,49],.5,false,63],['fibonacciExtension',[49,81,81],.5,true,63],['fibonacciLine',[100,100],.236,true,100],['fibonacciExtension',[10,10,100],.236,false,100]] as const){
    expect(fibonacciLevelPrice(kind,values,ratio,'log',reverse)).toBe(price)
    const object=source(kind,ratio,'log',reverse);object.anchors=values.map((value,index)=>({kind:'market',timestamp:index*1000,value}))
    const s=setup(object);expect(s.create().status).toBe('completed');s.consume(adjacent(price,-1));s.consume(price);expect(s.trigger).toHaveBeenCalledTimes(1);expect(s.trigger.mock.calls[0][0].referencePrice).toBe(price);s.runtime.dispose()
   }
  }finally{Decimal.set(previous)}
 })
})

describe('portable level source completeness',()=>{
 for(const kind of ['fibonacciLine','fibonacciExtension'] as const)it(`${kind} requires the complete built-in resolver source, including aliases`,()=>{
  for(const name of [kind,'Host/Fib']){
   const target={kind:'level' as const,resolverId:`tradingchest/${kind}`,parameterKey:'levels',levelId:'stable'},rule:DrawingAlertRule={id:'r',drawingLogicalId:'d',sourceOwner:'local',toolId:name,target,identity:symbol,period,condition:'crossing',frequency:'once-per-bar'}
   const full=source(kind).anchors! as any
   for(let length=1;length<full.length;length++){
    const geometry:DrawingAlertGeometry={kind:'level',toolId:name,target,anchors:full.slice(0,length),referencePrice:15,comparisonKey:'source',levelValue:.5}
    const result=evaluateDrawingAlert({rule,geometry,bars,previous:{timestamp:3000,close:14},current:{timestamp:3000,close:16},state:{hasTriggered:false}})
    expect(result).toMatchObject({status:'waiting',state:{hasTriggered:false}});expect(result.event).toBeUndefined();expect(result.comparison).toBeUndefined()
   }
  }
 })
 it('keeps a third-party single-anchor resolver valid even on the original overlay name',()=>{
  const catalog=copyDrawingCatalog();catalog.find(tool=>tool.toolId==='fibonacciLine')!.alertLevels!.resolverId='host/single';catalog.find(tool=>tool.toolId==='fibonacciLine')!.minPoints=1
  const object=source('fibonacciLine',.5,'linear');object.anchors=object.anchors!.slice(0,1)
  const s=setup(object,catalog,[{id:'host/single',resolve:()=>({status:'ready',referencePrice:15,comparisonKey:'single'})}]);expect(s.create().status).toBe('completed');s.consume(14);s.consume(16);expect(s.trigger).toHaveBeenCalledTimes(1)
  s.runtime.dispose()
 })
})

describe('resolver boundaries and actual instance defaults',()=>{
 it.each(['promise','thenable'])('isolates rejected %s results without a global unhandled rejection',async kind=>{
  const errors:unknown[]=[],onUnhandled=(error:unknown)=>errors.push(error);process.on('unhandledRejection',onUnhandled)
  const catalog=copyDrawingCatalog();catalog.find(tool=>tool.toolId==='fibonacciLine')!.alertLevels!.resolverId='host/async'
  const resolve=()=>kind==='promise'?Promise.reject(Error('resolver rejected')):{then:(_resolve:unknown,reject:(error:unknown)=>void)=>reject(Error('thenable rejected'))}
  const s=setup(source(),catalog,[{id:'host/async',resolve:resolve as any}])
  try{expect(s.create().status).toBe('rejected');await new Promise(resolve=>setTimeout(resolve,0));expect(errors).toEqual([]);expect(s.runtime.getState()).toEqual([])}finally{s.runtime.dispose();process.removeListener('unhandledRejection',onUnhandled)}
 })
 for(const kind of ['fibonacciLine','fibonacciExtension'] as const)for(const reversed of [false,true])it(`${kind} shares renderer defaults with omitted controls and reverse=${reversed}`,()=>{
  const catalog=copyDrawingCatalog().filter(tool=>tool.toolId===kind),tool=catalog[0]
  tool.parameters=tool.parameters.filter(parameter=>parameter.key==='levels'||reversed&&parameter.key==='reverse');if(reversed)tool.parameters.find(parameter=>parameter.key==='reverse')!.defaultValue=true
  const object=source(kind,.25,'linear');object.parameters={levels:object.parameters!.levels};object.anchors=[10,20,...(kind==='fibonacciExtension'?[30]:[])].map((value,index)=>({kind:'market',timestamp:index*1000,value}))
  const expected=kind==='fibonacciLine'?reversed?12.5:17.5:reversed?27.5:32.5
  const s=setup(object,catalog);expect(s.create().status).toBe('completed');s.consume(expected-1,2000);s.consume(expected+1,2000);expect(s.trigger.mock.calls[0][0].referencePrice).toBe(expected)
  const level=figures(object,tool).find(figure=>figure.key==='fibonacci-level:stable')!;expect((level.attrs as any).coordinates[0].y).toBe(expected);s.runtime.dispose()
 })
})

describe('axis invalidation without manufacturing price observations',()=>{
 it('retains both markers, ignores the consumed content and seeds only on the next confirmation',()=>{
  const s=setup(source('fibonacciLine',.5,'linear'));s.create();s.runtime.execute({type:'update',id:'rule',patch:{condition:'crossing-up'}})
  s.consume(54,3000,true);s.consume(56,3000,true);s.consume(54);s.consume(56);s.consume(54,4000)
  const document=s.runtime.capture(),replay=s.runtime.getState()[0].replay.records
  expect(s.runtime.axisChanged('log','default')).toBe(true);expect(s.runtime.axisChanged('linear','default')).toBe(true);expect(s.runtime.axisChanged('linear','default')).toBe(false)
  expect(s.runtime.capture()).toEqual(document);expect(s.runtime.getState()[0]).toMatchObject({enabled:true,status:'waiting'});expect(s.runtime.getState()[0].replay.records).toEqual(replay)
  s.runtime.consume({symbol,period,epoch:1,revision:1,contentRevision:6,contentChange:'tail',confirmed:true,replay:false},{symbol,period,dataStatus:'ready',replay:false,restoring:false,connection:'connected',revisionRequired:false},[...bars,{timestamp:4000,close:54}],'linear','default')
  s.consume(56,4000);expect(s.trigger).toHaveBeenCalledTimes(1);s.consume(54,5000);s.consume(56,5000);expect(s.trigger).toHaveBeenCalledTimes(2);expect(s.replayTrigger).toHaveBeenCalledTimes(1);s.runtime.dispose()
 })
 it.each(['line','level'])('disables an unprojectable %s immediately and never enables it on axis recovery',kind=>{
  const object=source('fibonacciLine',3,'linear');if(kind==='line'){object.overlay.name='horizontalStraightLine';object.anchors=[{kind:'market',timestamp:0,value:-10}]}
  const s=setup(object);expect(s.runtime.execute({type:'create',drawingLogicalId:'d',...(kind==='level'?{target:{kind:'level' as const,levelId:'stable'}}:{})}).status).toBe('completed')
  s.runtime.axisChanged('log','default');expect(s.runtime.getState()[0]).toMatchObject({enabled:false,status:'unsupported'});s.runtime.axisChanged('linear','default');expect(s.runtime.getState()[0].enabled).toBe(false);s.runtime.dispose()
 })
 it('does not disable a temporary axis in a restore lease, but checks the final axis on release',()=>{
  let restoring=false
  const s=setup(source('fibonacciLine',3,'linear'),undefined,undefined,()=>restoring);s.create();const document=s.runtime.capture()
  restoring=true;s.runtime.axisChanged('log','default');expect(s.runtime.getState()[0]).toMatchObject({enabled:true,status:'data-unavailable'})
  s.runtime.axisChanged('linear','default');restoring=false;s.runtime.refreshSources();expect(s.runtime.getState()[0].enabled).toBe(true);expect(s.runtime.capture()).toEqual(document)
  restoring=true;s.runtime.axisChanged('log','default');restoring=false;s.runtime.refreshSources();expect(s.runtime.getState()[0]).toMatchObject({enabled:false,status:'unsupported'});expect(s.runtime.capture()).toEqual(document);s.runtime.dispose()
 })
})
