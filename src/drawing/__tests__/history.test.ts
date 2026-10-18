import {describe,expect,it,vi} from 'vitest'
import {DrawingHistory} from '../history'
import type {DrawingChange,DrawingCommitResult,DrawingSnapshot} from '../types'

const context=()=>({symbol:{ticker:'A.X'},period:{multiplier:1,timespan:'minute',text:'1m'}})
const snapshot=(price:number,owner:'local'|'backend'='local',backendId?:string):DrawingSnapshot=>({logicalId:'drawing-1',owner,backendId,overlay:{id:'drawing-1',groupId:'drawings',name:'segment',points:[{timestamp:100,value:price}],styles:{line:{color:'#fff'}},extendData:null,lock:false,visible:true}})
function setup(commit?:(change:DrawingChange)=>Promise<DrawingCommitResult>,validate?:(value:DrawingSnapshot)=>void){
  const visible=new Map<string,DrawingSnapshot>(),states:any[]=[]
  const apply=vi.fn((id:string,value:DrawingSnapshot|null)=>{if(value)visible.set(id,value);else visible.delete(id);return value})
  const history=new DrawingHistory({context,apply,commit,validate,onChange:state=>states.push(state)})
  return {history,visible,apply,states}
}
describe('confirmed drawing history',()=>{
  it('retains unknown write ownership when restoring its canonical drawing fails',async()=>{
    let failRender=false
    const commit=vi.fn(async():Promise<DrawingCommitResult>=>({status:'uncertain',message:'Response lost'}))
    const history=new DrawingHistory({context,commit,apply:(_id,value)=>{if(failRender)throw Error('Pane removed');return value}})
    history.reconcile('backend',[snapshot(10,'backend','server-1')]);failRender=true
    await expect(history.submit('delete','drawing-1',null,'keyboard')).rejects.toThrow('Pane removed')
    expect(history.getState()).toMatchObject({pending:0,canUndo:false,uncertainLogicalIds:['drawing-1'],error:'Response lost'})
    await expect(history.submit('delete','drawing-1',null,'keyboard')).rejects.toThrow('Pane removed');expect(commit).toHaveBeenCalledTimes(1)
    failRender=false;history.reconcile('backend',[]);expect(history.getState().uncertainLogicalIds).toEqual([])
  })
  it('rechecks queued intents and undo targets before host writes without making the result uncertain',async()=>{
    let blocked=false
    const commit=vi.fn(async(change:DrawingChange):Promise<DrawingCommitResult>=>({status:'confirmed',snapshot:change.after}))
    const {history,visible}=setup(commit,()=>{if(blocked)throw Error('Transient pane')})
    const pending=history.submit('create','drawing-1',snapshot(10,'backend','server-1'),'manual');blocked=true
    await expect(pending).rejects.toThrow('Transient pane');expect(commit).not.toHaveBeenCalled();expect(visible.size).toBe(0)
    blocked=false;await history.submit('create','drawing-1',snapshot(10,'backend','server-1'),'manual')
    blocked=true;await history.submit('delete','drawing-1',null,'keyboard')
    await expect(history.undo()).rejects.toThrow('Transient pane');expect(commit).toHaveBeenCalledTimes(2);expect(visible.size).toBe(0)
    expect(history.getState()).toMatchObject({pending:0,canUndo:true,canRedo:false,uncertainLogicalIds:[]})
  })
  it('preflights an entire canonical batch before removing or applying any drawings',()=>{
    const {history,visible,apply}=setup(undefined,value=>{if(value.overlay.paneId==='transient')throw Error('Transient pane')})
    history.reconcile('local',[snapshot(10)]);apply.mockClear()
    const valid={...snapshot(20),logicalId:'new',overlay:{...snapshot(20).overlay,id:'new'}}
    const invalid={...snapshot(30),logicalId:'bad',overlay:{...snapshot(30).overlay,id:'bad',paneId:'transient'}}
    expect(()=>history.reconcile('local',[valid,invalid])).toThrow('Transient pane');expect(apply).not.toHaveBeenCalled()
    expect([...visible.values()]).toEqual([snapshot(10)]);expect(history.getDrawings()).toEqual([snapshot(10)])
  })
  it('freezes an intent before the queue runs and compares canonical objects independently of key order',async()=>{
    const {history}=setup();const intent=snapshot(10),pending=history.submit('create','drawing-1',intent,'manual');intent.overlay.points[0].value=99;await pending
    expect(history.getDrawings()[0].overlay.points[0].value).toBe(10)
    const original=history.getDrawings()[0];history.reconcile('local',[{overlay:original.overlay,owner:original.owner,logicalId:original.logicalId}])
    expect(history.getState().canUndo).toBe(true)
  })
  it('supports create, move, property, delete and complete undo/redo without a backend',async()=>{
    const {history,visible}=setup();await history.submit('create','drawing-1',snapshot(10),'drawing-bar')
    await history.submit('update','drawing-1',snapshot(11),'drawing-bar')
    const property=snapshot(11);property.overlay.styles={line:{color:'#f00'}}
    await history.submit('update','drawing-1',property,'property-bar');await history.submit('delete','drawing-1',null,'keyboard')
    expect(visible.size).toBe(0);await history.undo();expect(visible.get('drawing-1')!.overlay.styles).toEqual(property.overlay.styles)
    await history.undo();expect(visible.get('drawing-1')!.overlay.styles).toEqual(snapshot(11).overlay.styles)
    await history.undo();expect(visible.get('drawing-1')!.overlay.points[0].value).toBe(10)
    await history.undo();expect(visible.size).toBe(0)
    for(let i=0;i<4;i++)await history.redo();expect(visible.size).toBe(0)
  })
  it('serializes fast operations and does not advance history while a create is pending',async()=>{
    let resolve!:(r:DrawingCommitResult)=>void;const commit=vi.fn((change:DrawingChange):Promise<DrawingCommitResult>=>commit.mock.calls.length===1?new Promise(done=>resolve=done):Promise.resolve({status:'confirmed',snapshot:change.after?{...change.after,backendId:'server-1'}:null}))
    const {history}=setup(commit);const creating=history.submit('create','drawing-1',snapshot(10,'backend'),'manual'),moving=history.submit('update','drawing-1',snapshot(11,'backend'),'drawing-bar')
    await Promise.resolve();await Promise.resolve();expect(commit).toHaveBeenCalledTimes(1);expect(history.getState().canUndo).toBe(false)
    resolve({status:'confirmed',snapshot:snapshot(10,'backend','server-1')});await creating;await moving
    expect(commit.mock.calls[1][0].before?.backendId).toBe('server-1');expect(history.getDrawings()[0].overlay.points[0].value).toBe(11)
  })
  it('uses a new backend id after undoing a delete and targets that id in later operations',async()=>{
    let next=0;const calls:DrawingChange[]=[]
    const {history}=setup(async change=>{calls.push(change);return {status:'confirmed',snapshot:change.after?{...change.after,backendId:change.kind==='create'?`server-${++next}`:change.before!.backendId}:null}})
    await history.submit('create','drawing-1',snapshot(10,'backend'),'manual');await history.submit('delete','drawing-1',null,'keyboard');await history.undo()
    expect(history.getDrawings()[0].backendId).toBe('server-2');await history.redo();expect(calls.at(-1)!.before!.backendId).toBe('server-2')
  })
  it('rolls back a definite rejection and retains the undo pointer',async()=>{
    let reject=false;const {history,visible}=setup(async change=>reject?{status:'rejected',message:'HTTP 409'}:{status:'confirmed',snapshot:change.after})
    await history.submit('create','drawing-1',snapshot(10,'backend','server-1'),'manual');reject=true
    await history.submit('update','drawing-1',snapshot(12,'backend','server-1'),'property-bar');expect(visible.get('drawing-1')!.overlay.points[0].value).toBe(10)
    await history.undo();expect(history.getState().canUndo).toBe(true);expect(history.getState().canRedo).toBe(false)
  })
  it('never turns an unexpected rejection into a definite failed write or automatic retry',async()=>{
    const commit=vi.fn(async()=>{throw Error('response lost')});const {history}=setup(commit)
    await history.submit('create','drawing-1',snapshot(10,'backend'),'manual');expect(history.getState().uncertainLogicalIds).toEqual(['drawing-1']);expect(history.getState().canUndo).toBe(false)
    await history.submit('create','drawing-1',snapshot(10,'backend'),'manual');expect(commit).toHaveBeenCalledTimes(1)
    history.reconcile('backend',[snapshot(10,'backend','server-actual')]);expect(history.getState().uncertainLogicalIds).toEqual([]);expect(history.getState().canUndo).toBe(false)
  })
  it('clears an uncertain absent object only after a fresh canonical read',async()=>{
    const {history}=setup(async()=>({status:'uncertain',message:'response lost',snapshot:null}));
    await history.submit('create','drawing-1',snapshot(10,'backend'),'manual');expect(history.getState().uncertainLogicalIds).toEqual(['drawing-1']);
    history.reconcile('backend',[]);expect(history.getState().uncertainLogicalIds).toEqual([]);expect(history.getState().error).toBeUndefined();
  })
  it('does not re-create an object when its queued update follows a rejected create',async()=>{
    const commit=vi.fn(async():Promise<DrawingCommitResult>=>({status:'rejected',message:'HTTP 422'})),{history}=setup(commit)
    await Promise.all([history.submit('create','drawing-1',snapshot(10,'backend'),'manual'),history.submit('update','drawing-1',snapshot(12,'backend'),'drawing-bar')])
    expect(commit).toHaveBeenCalledTimes(1);expect(history.getDrawings()).toEqual([])
  })
  it('invalidates old callbacks on reset and leaves canonical external objects editable',async()=>{
    let resolve!:(r:DrawingCommitResult)=>void;const {history,visible}=setup(()=>new Promise(done=>resolve=done))
    const pending=history.submit('create','drawing-1',snapshot(10,'backend'),'manual');await Promise.resolve();await Promise.resolve();history.reset(true)
    resolve({status:'confirmed',snapshot:snapshot(10,'backend','server-old')});await expect(pending).rejects.toMatchObject({name:'AbortError'});expect(visible.size).toBe(0)
    history.reconcile('local',[snapshot(20)]);expect(history.getState().canUndo).toBe(false);await history.submit('update','drawing-1',snapshot(21),'property-bar');await history.undo();expect(visible.get('drawing-1')!.overlay.points[0].value).toBe(20)
  })
  it('retains history on unchanged canonical reads and rejects cross-owner identity collisions',async()=>{
    const {history}=setup();await history.submit('create','drawing-1',snapshot(10),'manual');history.reconcile('local',[snapshot(10)]);expect(history.getState().canUndo).toBe(true)
    expect(()=>history.reconcile('backend',[snapshot(11,'backend','server-1')])).toThrow('归属冲突')
  })
})
