import {describe,it,expect,vi} from 'vitest'
import {DrawingAlertRuntime} from '../drawingRuntime'
import {DrawingHistory} from '../../drawing/history'
import {builtinDrawingCatalog,copyDrawingCatalog,type DrawingToolDescriptor} from '../../drawing/catalog'
import {evaluateDrawingAlert} from '../drawingEvaluator'
import {migrateDrawingAlertDocument} from '../drawingDocument'
import {builtinDrawingAlertLevelResolvers} from '../drawingLevelResolvers'
import type {DrawingSnapshot} from '../../drawing/types'
import type {DrawingAlertLevelResolver,DrawingAlertGeometry,DrawingAlertRule,DrawingAlertDocumentV1} from '../drawingTypes'
import type {DrawingLevelSet} from '../../drawing/levels'
const symbol={ticker:'A'},period={multiplier:1,timespan:'minute',text:'1m'}
const bars=[0,10,1000,2000,4000].map(timestamp=>({timestamp,close:10}))
const levels=():DrawingLevelSet=>({version:1,items:[{id:'legacy-valid',value:.5,visible:true,text:'原正文'},{id:'other',value:.5,visible:true}]})
function source(kind='fibonacciLine'):DrawingSnapshot {return {logicalId:'d',owner:'local',parameters:{levels:levels()},anchors:[{kind:'market',timestamp:0,value:10},{kind:'market',timestamp:1000,value:20},...(kind==='fibonacciExtension'?[{kind:'market' as const,timestamp:2000,value:30}]:[])],overlay:{id:'d',name:kind,points:[],styles:null,extendData:null,visible:true,lock:false}}}
function setup(options:{source?:DrawingSnapshot;catalog?:DrawingToolDescriptor[];resolvers?:DrawingAlertLevelResolver[]}={}){
 let runtime:DrawingAlertRuntime|undefined,revision=0
 const trigger=vi.fn(),replayTrigger=vi.fn(),reads=vi.fn((id:string)=>history.getDrawing(id))
 const history=new DrawingHistory({apply:(_id,value)=>value,context:()=>({symbol,period}),onChange:(_state,ids)=>runtime?.refreshSources(ids)})
 const initial=options.source??source();history.reconcile(initial.owner,[initial])
 runtime=new DrawingAlertRuntime({scope:'scope',catalog:options.catalog,levelResolvers:options.resolvers,source:reads,uncertain:id=>history.isUncertain(id),restoring:()=>history.isLayoutRestoring(),trigger,replayTrigger})
 const consume=(close:number,timestamp=4000,patch:{replay?:boolean;axis?:'linear'|'log';bars?:typeof bars;confirmed?:boolean}={})=>{const confirmed=patch.confirmed??true;runtime!.consume({symbol,period,epoch:1,revision:1,contentRevision:++revision,contentChange:'tail',confirmed,replay:patch.replay??false},{symbol,period,dataStatus:confirmed?'ready':'unconfirmed',replay:patch.replay??false,restoring:false,connection:'connected',revisionRequired:false},[...(patch.bars??bars).filter(bar=>bar.timestamp<timestamp),{timestamp,close}],patch.axis??'linear')}
 consume(14)
 const create=(id='r',levelId='legacy-valid')=>runtime!.execute({type:'create',id,drawingLogicalId:'d',target:{kind:'level',levelId},frequency:'once-per-bar'})
 const change=(fn:(value:DrawingSnapshot)=>void)=>{const value=history.getDrawing('d')!;fn(value);history.reconcile(value.owner,[value])}
 return {runtime,history,trigger,replayTrigger,reads,consume,create,change,dispose:()=>{runtime!.dispose();history.dispose()}}
}
describe('level alert portable mathematics',()=>{
 for(const kind of ['fibonacciLine','fibonacciExtension'] as const)for(const mode of ['linear','log'] as const)for(const reverse of [false,true])it(`${kind} ${mode} reverse=${reverse} matches independent formulas and irregular-time domains`,()=>{
  const resolver=builtinDrawingAlertLevelResolvers.find(r=>r.id===`tradingchest/${kind}`)!,anchors=source(kind).anchors! as any
  anchors[1].interpolation={nextTimestamp:2000,fraction:.25}
  for(const ratio of [-1,0,.5,1,2]){
   const result=resolver.resolve({toolId:kind,anchors,level:{id:'x',value:ratio,visible:true},parameters:{calculationMode:mode,reverse,extendLeft:false,extendRight:false}})
   const a=10,b=20,c=30,sign=reverse?-1:1,start=reverse?b:a,end=reverse?a:b
   const expected=kind==='fibonacciLine'?(mode==='log'?end*(start/end)**ratio:end+(start-end)*ratio):(mode==='log'?c*(b/a)**(ratio*sign):c+(b-a)*ratio*sign)
   expect(result.status).toBe('ready');if(result.status!=='ready')throw Error(result.reason)
   expect(result.referencePrice).toBeCloseTo(expected,10);expect([result.from,result.to]).toEqual(kind==='fibonacciLine'?[0,1250]:[1250,2000])
  }
 })
 it('validates unsafe pure inputs and preserves closed domains and trigger-time snapshots',()=>{
  const target={kind:'level' as const,resolverId:'host',parameterKey:'zones',levelId:'level'},rule:DrawingAlertRule={id:'r',drawingLogicalId:'d',sourceOwner:'local',toolId:'Host',target,identity:{ticker:'A'},period:{multiplier:1,timespan:'minute'},condition:'crossing',frequency:'once-per-bar'}
  const geometry:DrawingAlertGeometry={kind:'level',toolId:'Host',target,anchors:[{kind:'market',timestamp:10,value:15}],referencePrice:15,from:10,to:2000,comparisonKey:'geometry',levelValue:.5,levelText:'触发正文'}
  const input={rule,geometry,bars,previous:{timestamp:10,close:14},current:{timestamp:2000,close:16},state:{hasTriggered:false}}
  expect(evaluateDrawingAlert(input).event).toMatchObject({referencePrice:15,level:{resolverId:'host',parameterKey:'zones',levelId:'level',value:.5,text:'触发正文'}})
  for(const patch of [{geometry:{...geometry,anchors:[]}},{geometry:{...geometry,target:{...target,levelId:'wrong'}}},{geometry:{...geometry,referencePrice:Infinity}},{geometry:{...geometry,from:3000,to:10}},{geometry:{...geometry,anchors:[{kind:'market',timestamp:5000,value:15}]}},{geometry:{...geometry,kind:'line',toolId:'Host'},rule:{...rule,target:{kind:'line'}}},{current:{timestamp:4000,close:16}},{previous:{timestamp:0,close:14}}]){const result=evaluateDrawingAlert({...input,...patch} as any);expect(result.status).toBe('waiting');expect(result.event).toBeUndefined();expect(result.comparison).toBeUndefined()}
  expect(evaluateDrawingAlert({...input,previous:undefined}).comparison).toEqual(input.current)
 })
})
describe('confirmed level rules',()=>{
 it.each(['fibonacciLine','fibonacciExtension'])('creates %s by stable IDs, rejects missing selection and observes its real domain',kind=>{
  const s=setup({source:source(kind)});expect(s.runtime.execute({type:'create',drawingLogicalId:'d'}).status).toBe('rejected');expect(s.create().status).toBe('completed')
  if(kind==='fibonacciExtension'){s.consume(34,2000);s.consume(36,2000)}else {s.consume(14);s.consume(16)}
  expect(s.trigger).toHaveBeenCalledTimes(1);expect(s.trigger.mock.calls[0][0]).toMatchObject({referencePrice:kind==='fibonacciLine'?15:35,level:{levelId:'legacy-valid',value:.5,text:'原正文'}});s.dispose()
 })
 it('keeps comparisons for text/style/reorder/whole-drawing visibility and resets confirmed geometry only',()=>{
  const s=setup();s.create();s.consume(14)
  s.change(value=>{value.overlay.visible=false;value.parameters!.showLevelText=false;const set=value.parameters!.levels as DrawingLevelSet;set.items.reverse();set.items[1].text='新正文';set.items[1].color='#123456'})
  s.consume(16);expect(s.trigger).toHaveBeenCalledTimes(1);expect(s.trigger.mock.calls[0][0].level.text).toBe('新正文')
  s.change(value=>{(value.parameters!.levels as DrawingLevelSet).items.find(l=>l.id==='legacy-valid')!.value=.2});s.consume(19,4000);expect(s.trigger).toHaveBeenCalledTimes(1)
  s.consume(17,5000);s.consume(19,5000);expect(s.trigger).toHaveBeenCalledTimes(2);expect(s.runtime.getState()[0].records[0].level?.value).toBe(.5);s.dispose()
 })
 it.each(['deleted','hidden','array','tool','scope','axis','future','viewport'] as const)('disables an unavailable %s source without losing markers or rebinding',kind=>{
  const s=setup();s.create();s.consume(14);s.consume(16);const before=s.runtime.capture()
  s.change(value=>{if(kind==='deleted')(value.parameters!.levels as DrawingLevelSet).items.shift();if(kind==='hidden')(value.parameters!.levels as DrawingLevelSet).items[0].visible=false;if(kind==='array')value.parameters!.levels=[.5,1];if(kind==='tool')value.overlay.name='fibonacciExtension';if(kind==='scope')value.presentation={scope:'workspace'};if(kind==='axis')value.yAxisId='other';if(kind==='future')value.anchors![0]={kind:'market',timestamp:99999,value:10};if(kind==='viewport')value.anchors![0]={kind:'viewport',x:.1,y:.2}})
  expect(s.runtime.getState()[0].enabled).toBe(false);expect(s.runtime.capture()).toEqual(before);s.consume(14,5000);s.consume(16,5000);expect(s.trigger).toHaveBeenCalledTimes(1);s.dispose()
 })
 it('separates live/replay markers, checks all anchors against replay history, and resumes explicitly after recovery',()=>{
  const s=setup();s.create();s.consume(14);s.consume(16);s.consume(14,500, {replay:true,bars:bars.slice(0,2)})
  expect(s.runtime.getState()[0]).toMatchObject({enabled:false,status:'unsupported'});s.consume(14,4000,{replay:true});expect(s.runtime.execute({type:'resume',id:'r'}).status).toBe('completed')
  s.consume(14,4000,{replay:true});s.consume(16,4000,{replay:true});expect(s.replayTrigger).toHaveBeenCalledTimes(1);expect(s.trigger).toHaveBeenCalledTimes(1);s.dispose()
 })
 it('uses instance defaults and an arbitrary parameter key without inferring capability from names',()=>{
  const builtin=builtinDrawingCatalog.find(t=>t.toolId==='fibonacciLine')!,custom={...structuredClone(builtin),toolId:'Catalog/Other',overlayName:'Host/Bands',alertLevels:{resolverId:'host/bands',parameterKey:'zones'},parameters:[{key:'zones',label:'区域',kind:'level-set' as const,defaultValue:[.5]},{key:'offset',label:'偏移',kind:'number' as const,defaultValue:3}]}
  const object=source('Host/Bands');object.parameters={zones:levels()};object.anchors=object.anchors!.slice(0,2)
  const resolver:DrawingAlertLevelResolver={id:'host/bands',resolve:vi.fn(input=>{const price=input.anchors[0].value+Number(input.parameters.offset)+input.level.value;input.anchors[0].value=999;input.level.text='不可泄漏';return {status:'ready',referencePrice:price,comparisonKey:JSON.stringify([price])}})}
  const s=setup({source:object,catalog:[custom],resolvers:[resolver]});s.create();s.reads.mockClear();s.consume(13);s.consume(14);expect(s.trigger.mock.calls[0][0]).toMatchObject({referencePrice:13.5,level:{parameterKey:'zones',text:'原正文'}});expect(s.history.getDrawing('d')).toEqual(object)
  const other=setup({source:object,catalog:[{...custom,parameters:custom.parameters.map(p=>p.key==='offset'?{...p,defaultValue:10}:p)}],resolvers:[resolver]});other.create();s.dispose();other.consume(20);other.consume(21);expect(other.trigger.mock.calls[0][0].referencePrice).toBe(20.5);other.dispose()
  const missing=setup({source:object,catalog:[{...custom,alertLevels:undefined}],resolvers:[resolver]});expect(missing.create().status).toBe('rejected');missing.dispose()
 })
 it('resolves a shared level target only once per round and isolates copied registration entries',()=>{
  const resolver:DrawingAlertLevelResolver={id:'host',resolve:vi.fn(()=>({status:'ready',referencePrice:15,comparisonKey:'a'}))},catalog=copyDrawingCatalog();catalog.find(t=>t.toolId==='fibonacciLine')!.alertLevels!.resolverId='host'
  const resolvers=[resolver],s=setup({catalog,resolvers});for(let i=0;i<100;i++)s.create(`r${i}`)
  const original=resolver.resolve;resolver.resolve=()=>{throw Error('mutated')};resolvers.length=0;(original as any).mockClear();s.reads.mockClear();s.consume(14)
  expect(original).toHaveBeenCalledTimes(1);expect(s.reads).toHaveBeenCalledTimes(1);s.dispose()
 })
 it.each([()=>{throw Error('解析失败')},()=>Promise.resolve({status:'ready',referencePrice:15,comparisonKey:'x'}),()=>({status:'ready',referencePrice:NaN,comparisonKey:'x'}),()=>({status:'ready',referencePrice:15,comparisonKey:''}),()=>({status:'ready',referencePrice:15,from:2,to:1,comparisonKey:'x'}),()=>({status:'ready',referencePrice:15,comparisonKey:'x',extra:true})])('rejects invalid synchronous resolver output without fallback',resolve=>{
  const catalog=copyDrawingCatalog();catalog.find(t=>t.toolId==='fibonacciLine')!.alertLevels!.resolverId='host';const s=setup({catalog,resolvers:[{id:'host',resolve:resolve as any}]});expect(s.create().status).toBe('rejected');expect(s.runtime.getState()).toEqual([]);s.dispose()
 })
 it('rejects duplicate or blank registrations and retains rules when a resolver is absent',()=>{
  for(const resolvers of [[{id:'',resolve:()=>({status:'unavailable',reason:'x'})}],[...builtinDrawingAlertLevelResolvers]])expect(()=>setup({resolvers:resolvers as any})).toThrow('解析器')
  const s=setup();s.create();const doc=s.runtime.capture();doc.rules[0].rule.target={kind:'level',levelId:'legacy-valid',parameterKey:'levels',resolverId:'missing'};s.runtime.restore(doc);expect(s.runtime.getState()[0]).toMatchObject({enabled:false,status:'unsupported'});s.dispose()
 })
})
describe('v2 persistence',()=>{
 it('migrates v1 by value, preserves every identity and marker, and never changes its input',()=>{
  const doc:DrawingAlertDocumentV1={version:1,scope:'opaque',rules:[{rule:{id:'r',drawingLogicalId:'d',sourceOwner:'backend',backendId:'b',toolId:'segment',identity:{ticker:'A',market:'X',exchange:'Y',priceCurrency:'USD',basis:'raw'},period:{multiplier:3,timespan:'hour'},condition:'crossing-down',frequency:'once',message:'消息'},hasTriggered:true,lastBarTimestamp:1000}]},before=structuredClone(doc),next=migrateDrawingAlertDocument(doc)
  expect(next).toEqual({...before,version:2,rules:[{...before.rules[0],rule:{...before.rules[0].rule,target:{kind:'line'}}}]});next.rules[0].rule.identity.ticker='mutated';expect(doc).toEqual(before)
 })
 it('restores all structurally valid missing sources paused and rejects every malformed document atomically',()=>{
  const s=setup();s.create();s.consume(14);s.consume(16);const document=s.runtime.capture()
  for(const change of [(d:any)=>d.version=3,(d:any)=>d.scope='other',(d:any)=>d.rules.push(d.rules[0]),(d:any)=>d.rules[0].lastBarTimestamp=Infinity,(d:any)=>delete d.rules[0].rule.target.levelId,(d:any)=>d.rules[0].rule.target.kind='unknown',(d:any)=>d.rules[0].rule.unknown=true]){const bad=structuredClone(document),before=s.runtime.getState();change(bad);expect(()=>s.runtime.restore(bad)).toThrow();expect(s.runtime.getState()).toEqual(before)}
  const missing=structuredClone(document);missing.rules[0].rule.drawingLogicalId='missing';s.runtime.restore(missing);expect(s.runtime.getState()[0]).toMatchObject({enabled:false,status:'source-missing',hasTriggered:true,lastBarTimestamp:4000})
  s.runtime.restore(document);document.rules[0].rule.identity.ticker='mutated';expect(s.runtime.getState()[0]).toMatchObject({enabled:false,status:'paused'});expect(s.runtime.getState()[0].rule.identity.ticker).toBe('A');expect(s.trigger).toHaveBeenCalledTimes(1);s.dispose()
 })
})
