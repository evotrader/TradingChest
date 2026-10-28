import {describe,it,expect,vi} from 'vitest'
import {DrawingHistory} from '../../drawing/history'
import type {DrawingCommitResult,DrawingSnapshot} from '../../drawing/types'
import {DrawingAlertRuntime} from '../drawingRuntime'

const symbol={ticker:'A'},period={multiplier:1,timespan:'minute',text:'1m'}
const drawing=(id:string,owner:'local'|'backend'='local'):DrawingSnapshot=>({logicalId:id,owner,...(owner==='backend'?{backendId:id}:{}),anchors:[{kind:'market',timestamp:0,value:10}],overlay:{id,name:'horizontalStraightLine',points:[{timestamp:0,value:10}],styles:null,extendData:null,lock:false,visible:true}})
function setup(){
 let runtime:DrawingAlertRuntime|undefined,revision=0,commit:DrawingCommitResult|undefined
 const confirmed=vi.fn(),trigger=vi.fn(),changed=vi.fn()
 const history=new DrawingHistory({context:()=>({symbol,period}),apply:(_id,value)=>value,commit:async change=>commit??{status:'confirmed',snapshot:change.after},onChange:(_state,sources)=>runtime?.refreshSources(sources),onConfirmed:confirmed})
 const source=vi.fn((id:string)=>history.getDrawing(id))
 runtime=new DrawingAlertRuntime({scope:'scope',source,uncertain:id=>history.isUncertain(id),restoring:()=>history.isLayoutRestoring(),trigger,changed})
 const consume=(close=9,timestamp=100)=>runtime!.consume({symbol,period,epoch:1,revision:1,contentRevision:++revision,contentChange:'tail',confirmed:true,replay:false},{symbol,period,dataStatus:'ready',restoring:false,replay:false,connection:'connected',revisionRequired:false},[{timestamp:0,close:9},{timestamp,close}],'linear')
 consume()
 const create=(id:string,sourceId='d')=>expect(runtime!.execute({type:'create',id,drawingLogicalId:sourceId,frequency:'once-per-bar'}).status).toBe('completed')
 return {runtime,history,source,consume,create,confirmed,trigger,changed,setCommit:(value:DrawingCommitResult)=>{commit=value}}
}
describe('confirmed history invalidates only referenced alert sources',()=>{
 it('reads a shared source once per consume and once per real confirmation, never for 1002 unrelated confirmations',async()=>{
  const s=setup();s.history.reconcile('local',[drawing('d')]);for(let i=0;i<100;i++)s.create(`r${i}`)
  s.source.mockClear();s.consume();expect(s.source).toHaveBeenCalledTimes(1)
  s.source.mockClear();s.runtime.refreshSources(['d']);expect(s.source).toHaveBeenCalledTimes(1)
  s.source.mockClear();const value=s.history.getDrawing('d')!;value.anchors![0].value=12
  await s.history.submit('update','d',value,'manual');expect(s.source).toHaveBeenCalledTimes(1);expect(s.confirmed).toHaveBeenCalledTimes(1)
  s.source.mockClear()
  await s.history.submitBatch(Array.from({length:1002},(_,i)=>({kind:'create',logicalId:`other${i}`,after:drawing(`other${i}`)})),'manual')
  expect(s.source).not.toHaveBeenCalled();expect(s.confirmed).toHaveBeenCalledTimes(1003)
  await s.history.undo();expect(s.source).not.toHaveBeenCalled();expect(s.history.getDrawings()).toHaveLength(1)
  s.runtime.dispose();s.history.dispose()
 })
 it('reads 100 distinct sources at most once each and maintains the index on delete and atomic restore',async()=>{
  const s=setup();s.history.reconcile('local',Array.from({length:100},(_,i)=>drawing(`d${i}`)));for(let i=0;i<100;i++)s.create(`r${i}`,`d${i}`)
  s.source.mockClear();s.consume();expect(s.source).toHaveBeenCalledTimes(100)
  const doc=s.runtime.capture();s.runtime.execute({type:'delete',id:'r0'});s.source.mockClear()
  await s.history.submit('delete','d0',null,'manual');expect(s.source).not.toHaveBeenCalled()
  await s.history.undo();s.runtime.restore(doc);s.source.mockClear();await s.history.submit('delete','d0',null,'manual')
  expect(s.source).toHaveBeenCalledTimes(1);expect(s.runtime.getState().find(s=>s.rule.id==='r0')!.status).toBe('source-missing')
  s.runtime.dispose();s.source.mockClear();await s.history.undo();expect(s.source).not.toHaveBeenCalled();s.history.dispose()
 })
 it('retains enabled intent during uncertainty and same-instance layout restore, clears observations even when geometry is unchanged',async()=>{
  const s=setup();s.history.reconcile('backend',[drawing('d','backend')]);s.create('r');s.consume()
  s.setCommit({status:'uncertain',message:'等待确认'})
  await s.history.submit('update','d',{...drawing('d','backend'),parameters:{labelVisible:false}},'manual')
  expect(s.runtime.getState()[0]).toMatchObject({enabled:true,status:'data-unavailable'})
  s.history.reconcile('backend',[drawing('d','backend')]);s.consume(11);expect(s.trigger).not.toHaveBeenCalled();s.consume(9,200);expect(s.trigger).toHaveBeenCalledTimes(1)
  const before=s.runtime.capture(),lease=s.history.beginRestore('layout')
  s.consume(11,300);expect(s.trigger).toHaveBeenCalledTimes(1);expect(s.runtime.getState()[0].enabled).toBe(true)
  s.history.reconcile('backend',[drawing('d','backend')],lease.token);lease.release();s.consume(11,300)
  expect(s.trigger).toHaveBeenCalledTimes(1);expect(s.runtime.capture()).toEqual(before)
  s.consume(9,400);expect(s.trigger).toHaveBeenCalledTimes(2);s.runtime.dispose();s.history.dispose()
 })
 it('commits every marker before notifications and discards the source cache before a callback reenters',()=>{
  const s=setup();s.history.reconcile('local',[drawing('d')]);s.create('r1');s.create('r2');s.consume()
  let reentered=false
  s.changed.mockImplementation(()=>{if(reentered||!s.runtime.getState()[0].hasTriggered)return;reentered=true;expect(s.runtime.getState().every(s=>s.hasTriggered)).toBe(true);const value=drawing('d');value.anchors![0].value=20;s.history.reconcile('local',[value]);s.consume(19,200)})
  s.consume(11);expect(s.trigger).toHaveBeenCalledTimes(2);s.consume(21,300);expect(s.trigger).toHaveBeenCalledTimes(4)
  s.runtime.dispose();s.history.dispose()
 })
})
