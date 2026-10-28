import {describe,it,expect,vi} from 'vitest'
import {DrawingAlertRuntime} from '../drawingRuntime'
import {DrawingHistory} from '../../drawing/history'
import type {DrawingSnapshot} from '../../drawing/types'
import type {ConfirmedSeries} from '../../core/engineDataLoader'
import type {ChartDataState} from '../../types'
const symbol={ticker:'A',market:'test',exchange:'X',priceCurrency:'USD'},period={multiplier:1,timespan:'minute',text:'1m'}
const snapshot=(owner:'local'|'backend'='local'):DrawingSnapshot=>({logicalId:'d',owner,...(owner==='backend'?{backendId:'opaque backend'}:{}),anchors:[{kind:'market',timestamp:0,value:10}],overlay:{id:'d',name:'horizontalStraightLine',points:[{timestamp:0,value:10}],styles:null,extendData:null,lock:false,visible:true}})
function setup(owner:'local'|'backend'='local'){
 const trigger=vi.fn(),replayTrigger=vi.fn(),changed=vi.fn(),error=vi.fn()
 const history=new DrawingHistory({context:()=>({symbol,period}),apply:(_id,value)=>value,commit:async change=>({status:'confirmed',snapshot:change.after})});history.reconcile(owner,[snapshot(owner)])
 let restoring=false,revision=0,epoch=1
 const runtime=new DrawingAlertRuntime({scope:'test scope',source:id=>history.getDrawing(id),uncertain:id=>history.getState().uncertainLogicalIds.includes(id),restoring:()=>restoring,trigger,replayTrigger,changed,error})
 const consume=(close:number,timestamp=100,patch:Partial<ChartDataState>={},seriesPatch:Partial<ConfirmedSeries>={})=>{
  const series:ConfirmedSeries={symbol,period,confirmed:true,basis:'raw',epoch,revision:1,contentRevision:++revision,contentChange:'tail',replay:false,...seriesPatch}
  const state:ChartDataState={symbol,period,basis:'raw',dataStatus:'ready',restoring:false,replay:series.replay,connection:'connected',revisionRequired:false,...patch}
  runtime.consume(series,state,[{timestamp:0,close:9},{timestamp,close}],'linear','main')
 }
 consume(9)
 const create=(frequency:'once'|'once-per-bar'='once-per-bar')=>runtime.execute({type:'create',id:'r',drawingLogicalId:'d',frequency})
 return {runtime,history,trigger,replayTrigger,changed,error,consume,create,setRestoring:(value:boolean)=>restoring=value,newEpoch:()=>++epoch}
}
describe('drawing alert confirmed runtime',()=>{
 it.each(['local','backend'] as const)('binds a confirmed %s source, without editing it or writing backend annotations',owner=>{
  const s=setup(owner),before=s.history.getDrawings();expect(s.create().status).toBe('completed');s.consume(9);s.consume(11)
  expect(s.trigger).toHaveBeenCalledTimes(1);expect(s.history.getDrawings()).toEqual(before);expect(s.runtime.getState()[0].rule.sourceOwner).toBe(owner)
 })
 it('preserves deduplication on pause/resume/update, but explicitly rearms',()=>{
  const s=setup();s.create();s.consume(9);s.consume(11);expect(s.trigger).toHaveBeenCalledTimes(1)
  s.runtime.execute({type:'pause',id:'r'});s.runtime.execute({type:'resume',id:'r'});s.consume(9);s.consume(11);expect(s.trigger).toHaveBeenCalledTimes(1)
  s.runtime.execute({type:'update',id:'r',patch:{condition:'crossing-up'}});s.consume(9);s.consume(11);expect(s.trigger).toHaveBeenCalledTimes(1)
  s.consume(9,200);s.consume(11,200);expect(s.trigger).toHaveBeenCalledTimes(2)
  s.runtime.execute({type:'rearm',id:'r'});s.consume(9,200);s.consume(11,200);expect(s.trigger).toHaveBeenCalledTimes(3);expect(s.runtime.getState()[0].records).toHaveLength(3)
 })
 it('requires rearm rather than resume for an already triggered once rule',()=>{
  const s=setup();s.create('once');s.consume(9);s.consume(11);s.runtime.execute({type:'pause',id:'r'})
  expect(s.runtime.execute({type:'resume',id:'r'}).status).toBe('rejected');s.runtime.execute({type:'rearm',id:'r'});s.consume(11);s.consume(9);expect(s.trigger).toHaveBeenCalledTimes(2)
 })
 it('preserves the active comparison and status when only the message changes',()=>{
  const s=setup();s.create();s.consume(9);expect(s.runtime.getState()[0].status).toBe('monitoring')
  s.runtime.execute({type:'update',id:'r',patch:{message:'新的消息'}})
  expect(s.runtime.getState()[0].status).toBe('monitoring');s.consume(11);expect(s.trigger).toHaveBeenCalledTimes(1);expect(s.trigger.mock.calls[0][0].message).toBe('新的消息')
  s.consume(11,100,{error:'读取失败'});s.runtime.execute({type:'update',id:'r',patch:{message:'再次编辑'}})
  expect(s.runtime.getState()[0]).toMatchObject({status:'data-unavailable',reason:'读取失败'})
  s.runtime.execute({type:'update',id:'r',patch:{condition:'crossing-down'}})
  expect(s.runtime.getState()[0]).toMatchObject({status:'data-unavailable',reason:'读取失败'})
 })
 it('keeps the live comparison seed when attached text or label appearance changes',()=>{
  const s=setup();s.create();s.consume(9)
  const before=s.history.getDrawing('d')!,label={...before,parameters:{labelVisible:true,labelAlign:'right',labelPosition:'below'},overlay:{...before.overlay,extendData:{text:'附着正文',metadata:{source:'host'}},styles:{text:{color:'#123456',size:18}}}} as DrawingSnapshot
  s.history.reconcile('local',[label]);s.runtime.refreshSources();expect(s.runtime.getState()[0].status).toBe('monitoring')
  s.consume(11);expect(s.trigger).toHaveBeenCalledTimes(1);expect(s.history.getDrawing('d')!.anchors).toEqual(before.anchors)
 })
 it.each([{connection:'disconnected'},{connection:'reconnecting'},{connection:'failed'},{error:'读取失败'},{revisionRequired:true},{dataStatus:'unconfirmed'},{dataStatus:'empty'}] as const)('clears the comparison for unavailable data %o',patch=>{
  const s=setup();s.create();s.consume(9);s.consume(11,100,patch);s.consume(11);expect(s.trigger).not.toHaveBeenCalled();s.consume(9);expect(s.trigger).toHaveBeenCalledTimes(1)
 })
 it('seeds replacements, context switches and multi-bar snapshots without replaying history',()=>{
  const s=setup();s.create();s.consume(9);s.consume(11,100,{}, {contentChange:'replace'});expect(s.trigger).not.toHaveBeenCalled()
  s.consume(9,100,{}, {symbol:{...symbol,exchange:'other'}});s.consume(11);expect(s.trigger).not.toHaveBeenCalled()
  s.newEpoch();s.consume(9);expect(s.trigger).not.toHaveBeenCalled();s.consume(11);expect(s.trigger).toHaveBeenCalledTimes(1)
 })
 it('reconfirms unchanged content after a successful reload without retaining the old error or inventing a cross',()=>{
  const s=setup();s.create();s.consume(9,100,{}, {contentRevision:20,revision:1})
  s.consume(9,100,{error:'读取失败'},{contentRevision:20,revision:1})
  expect(s.runtime.getState()[0].status).toBe('data-unavailable')
  s.consume(9,100,{}, {contentRevision:20,revision:2,writer:'reload',contentChange:'replace'})
  expect(s.runtime.getState()[0].status).toBe('monitoring');expect(s.runtime.getState()[0].reason).toBeUndefined();expect(s.trigger).not.toHaveBeenCalled()
  s.consume(11,100,{}, {contentRevision:21,revision:2});expect(s.trigger).toHaveBeenCalledTimes(1)
  s.consume(9,100,{error:'再次读取失败'},{contentRevision:21,revision:2})
  s.consume(9,100,{}, {contentRevision:21,revision:3,writer:'reload',contentChange:'replace'})
  s.consume(11,100,{}, {contentRevision:22,revision:3})
  expect(s.trigger).toHaveBeenCalledTimes(1);expect(s.runtime.getState()[0].lastBarTimestamp).toBe(100)
 })
 it('keeps live and replay markers, records and callbacks separate',()=>{
  const s=setup();s.create('once');s.consume(9);s.consume(11);expect(s.trigger).toHaveBeenCalledTimes(1)
  s.consume(9,100,{}, {replay:true,contentChange:'replace'});s.consume(11,100,{}, {replay:true});expect(s.replayTrigger).toHaveBeenCalledTimes(1)
  s.consume(9);s.consume(11);expect(s.trigger).toHaveBeenCalledTimes(1)
  expect(s.runtime.getState()[0].records).toHaveLength(1);expect(s.runtime.getState()[0].replay.records).toHaveLength(1)
 })
 it('keeps existing line monitoring enabled while replay has not reached its market anchor',()=>{
  const s=setup(),drawing=s.history.getDrawing('d')!
  drawing.anchors![0]={kind:'market',timestamp:100,value:10};s.history.reconcile('local',[drawing])
  expect(s.create().status).toBe('completed');s.consume(9,200);s.consume(11,200)
  const live=s.runtime.capture()
  s.consume(9,10,{}, {replay:true,contentChange:'replace'})
  expect(s.runtime.getState()[0]).toMatchObject({enabled:true,replay:{status:'waiting',records:[]}})
  expect(s.runtime.capture()).toEqual(live);expect(s.replayTrigger).not.toHaveBeenCalled()
  s.consume(9,100,{}, {replay:true});expect(s.replayTrigger).not.toHaveBeenCalled()
  s.consume(11,200,{}, {replay:true});expect(s.replayTrigger).toHaveBeenCalledTimes(1)
  s.consume(9,10,{}, {replay:true,contentChange:'replace'});s.consume(9,100,{}, {replay:true});s.consume(11,200,{}, {replay:true})
  expect(s.replayTrigger).toHaveBeenCalledTimes(1);expect(s.runtime.capture()).toEqual(live)
  s.consume(11,200);expect(s.trigger).toHaveBeenCalledTimes(1)
  s.runtime.dispose();s.history.dispose()
 })
 it('retains once-per-bar markers through confirmed geometry changes but not previews',()=>{
  const s=setup();s.create();s.consume(9);s.consume(11)
  const geometry=s.history.getDrawing('d')!;geometry.anchors![0]={kind:'market',timestamp:0,value:12};s.history.reconcile('local',[geometry]);s.runtime.refreshSources();s.consume(11);s.consume(13)
  expect(s.trigger).toHaveBeenCalledTimes(1);s.consume(11,200);s.consume(13,200);expect(s.trigger).toHaveBeenCalledTimes(2)
 })
 it('deduplicates every replay bar across seeks and pause/resume until explicit replay rearm',()=>{
  const s=setup();s.create()
  const replay=(close:number,timestamp:number,replace=false)=>s.consume(close,timestamp,{}, {replay:true,contentChange:replace?'replace':'tail'})
  replay(9,200,true);replay(11,300);replay(9,400)
  replay(9,200,true);replay(11,300)
  expect(s.replayTrigger.mock.calls.map(([event])=>event.barTimestamp)).toEqual([300,400])
  s.runtime.execute({type:'pause',id:'r'});s.runtime.execute({type:'resume',id:'r'})
  replay(9,200,true);replay(11,300);expect(s.replayTrigger).toHaveBeenCalledTimes(2)
  s.runtime.execute({type:'rearm',id:'r'});replay(9,200,true);replay(11,300)
  expect(s.replayTrigger.mock.calls.map(([event])=>event.barTimestamp)).toEqual([300,400,300])
  expect(s.trigger).not.toHaveBeenCalled();expect(s.runtime.getState()[0].hasTriggered).toBe(false)
 })
 it('retains replay deduplication beyond the bounded display history without serializing its set',()=>{
  const s=setup();s.create()
  for(let i=1;i<=120;i++){s.consume(9,i*100,{}, {replay:true,contentChange:'replace'});s.consume(11,i*100+1,{}, {replay:true})}
  expect(s.runtime.getState()[0].replay.records).toHaveLength(100)
  s.consume(9,100,{}, {replay:true,contentChange:'replace'});s.consume(11,101,{}, {replay:true})
  expect(s.replayTrigger).toHaveBeenCalledTimes(120)
  expect(s.runtime.getState()[0]).not.toHaveProperty('replayTriggeredBars')
  expect(JSON.parse(JSON.stringify(s.runtime.capture())).rules[0]).toEqual({rule:s.runtime.getState()[0].rule,hasTriggered:false})
 })
 it('keeps deleted source rules disabled after undo until an explicit resume',async()=>{
  const s=setup();s.create();s.consume(9);await s.history.submit('delete','d',null,'manual');s.runtime.refreshSources();expect(s.runtime.getState()[0]).toMatchObject({enabled:false,status:'source-missing'})
  await s.history.undo();s.runtime.refreshSources();s.consume(11);expect(s.trigger).not.toHaveBeenCalled();expect(s.runtime.execute({type:'resume',id:'r'}).status).toBe('completed');s.consume(9);s.consume(11);expect(s.trigger).toHaveBeenCalledTimes(1)
 })
 it('restores paused rules with markers and atomically rejects malformed documents or scopes',()=>{
  const s=setup();s.create();s.consume(9);s.consume(11);const doc=s.runtime.capture();s.runtime.restore(doc)
  expect(s.runtime.getState()[0]).toMatchObject({enabled:false,hasTriggered:true,lastBarTimestamp:100})
  s.runtime.execute({type:'resume',id:'r'});s.consume(9);s.consume(11);expect(s.trigger).toHaveBeenCalledTimes(1)
  const before=s.runtime.getState();for(const change of [(d:any)=>d.scope='wrong',(d:any)=>d.rules.push(d.rules[0])]){const invalid=structuredClone(doc);change(invalid);expect(()=>s.runtime.restore(invalid)).toThrow();expect(s.runtime.getState()).toEqual(before)}
  s.runtime.restore(doc);s.runtime.execute({type:'rearm',id:'r'});s.consume(9);s.consume(11);expect(s.trigger).toHaveBeenCalledTimes(2)
 })
 it('commits an event before a callback throws and keeps returned values isolated',()=>{
  const s=setup();s.create();s.trigger.mockImplementation(()=>{throw Error('host callback')});s.consume(9);s.consume(11);s.consume(9);s.consume(11)
  expect(s.trigger).toHaveBeenCalledTimes(1);expect(s.error).toHaveBeenCalledTimes(1)
  const state=s.runtime.getState();state[0].rule.identity.ticker='changed';state[0].records.length=0;expect(s.runtime.getState()[0].records).toHaveLength(1);expect(s.runtime.getState()[0].rule.identity.ticker).toBe('A')
 })
 it('caps each instance history at 100 events and releases entries on disposal',()=>{
  const s=setup();s.create();s.consume(9)
  for(let i=1;i<=105;i++){s.consume(9,100+i);s.consume(11,100+i)}
  expect(s.runtime.getState()[0].records).toHaveLength(100);s.runtime.dispose();expect(s.runtime.getState()).toEqual([]);expect(s.runtime.execute({type:'resume',id:'r'}).status).toBe('rejected')
 })
})
