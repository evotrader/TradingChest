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
 it.each([{connection:'disconnected'},{connection:'reconnecting'},{connection:'failed'},{error:'读取失败'},{revisionRequired:true},{dataStatus:'unconfirmed'},{dataStatus:'empty'}] as const)('clears the comparison for unavailable data %o',patch=>{
  const s=setup();s.create();s.consume(9);s.consume(11,100,patch);s.consume(11);expect(s.trigger).not.toHaveBeenCalled();s.consume(9);expect(s.trigger).toHaveBeenCalledTimes(1)
 })
 it('seeds replacements, context switches and multi-bar snapshots without replaying history',()=>{
  const s=setup();s.create();s.consume(9);s.consume(11,100,{}, {contentChange:'replace'});expect(s.trigger).not.toHaveBeenCalled()
  s.consume(9,100,{}, {symbol:{...symbol,exchange:'other'}});s.consume(11);expect(s.trigger).not.toHaveBeenCalled()
  s.newEpoch();s.consume(9);expect(s.trigger).not.toHaveBeenCalled();s.consume(11);expect(s.trigger).toHaveBeenCalledTimes(1)
 })
 it('keeps live and replay markers, records and callbacks separate',()=>{
  const s=setup();s.create('once');s.consume(9);s.consume(11);expect(s.trigger).toHaveBeenCalledTimes(1)
  s.consume(9,100,{}, {replay:true,contentChange:'replace'});s.consume(11,100,{}, {replay:true});expect(s.replayTrigger).toHaveBeenCalledTimes(1)
  s.consume(9);s.consume(11);expect(s.trigger).toHaveBeenCalledTimes(1)
  expect(s.runtime.getState()[0].records).toHaveLength(1);expect(s.runtime.getState()[0].replay.records).toHaveLength(1)
 })
 it('retains once-per-bar markers through confirmed geometry changes but not previews',()=>{
  const s=setup();s.create();s.consume(9);s.consume(11)
  const geometry=s.history.getDrawing('d')!;geometry.anchors![0]={kind:'market',timestamp:0,value:12};s.history.reconcile('local',[geometry]);s.runtime.refreshSources();s.consume(11);s.consume(13)
  expect(s.trigger).toHaveBeenCalledTimes(1);s.consume(11,200);s.consume(13,200);expect(s.trigger).toHaveBeenCalledTimes(2)
 })
 it('keeps deleted source rules disabled after undo until an explicit resume',async()=>{
  const s=setup();s.create();s.consume(9);await s.history.submit('delete','d',null,'manual');s.runtime.refreshSources();expect(s.runtime.getState()[0]).toMatchObject({enabled:false,status:'source-missing'})
  await s.history.undo();s.runtime.refreshSources();s.consume(11);expect(s.trigger).not.toHaveBeenCalled();expect(s.runtime.execute({type:'resume',id:'r'}).status).toBe('completed');s.consume(9);s.consume(11);expect(s.trigger).toHaveBeenCalledTimes(1)
 })
 it('restores paused rules with markers and atomically rejects invalid bindings or scopes',()=>{
  const s=setup();s.create();s.consume(9);s.consume(11);const doc=s.runtime.capture();s.runtime.restore(doc)
  expect(s.runtime.getState()[0]).toMatchObject({enabled:false,hasTriggered:true,lastBarTimestamp:100})
  s.runtime.execute({type:'resume',id:'r'});s.consume(9);s.consume(11);expect(s.trigger).toHaveBeenCalledTimes(1)
  const before=s.runtime.getState();for(const change of [(d:any)=>d.scope='wrong',(d:any)=>d.rules[0].rule.drawingLogicalId='missing',(d:any)=>d.rules.push(d.rules[0])]){const invalid=structuredClone(doc);change(invalid);expect(()=>s.runtime.restore(invalid)).toThrow();expect(s.runtime.getState()).toEqual(before)}
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
