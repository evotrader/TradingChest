import {describe,it,expect,vi} from 'vitest'
import {DrawingSessionRegistry} from '../session'
import {DrawingHistory} from '../history'
import {DrawingCoordinator} from '../coordinator'
import {DrawingStoreError,type DrawingDocumentStore,type StoredDrawingDocument} from '../documentStore'
import type {DrawingSnapshot} from '../types'
const identity={namespace:'test',symbol:{ticker:'A.X',market:'equity',exchange:'X',priceCurrency:'USD'},priceBasisKey:'raw'}
const context=()=>({symbol:{ticker:'A.X'},period:{multiplier:1,timespan:'day',text:'1D'}})
const value=(id='a',scope:'chart'|'workspace'|'host'='chart'):DrawingSnapshot=>({logicalId:id,owner:'local',overlay:{id,name:'segment',groupId:'drawing_tools',paneId:'candle_pane',lock:false,visible:true,extendData:null,styles:null,points:[{timestamp:1,value:10},{timestamp:2,value:11}]},anchors:[{kind:'market',timestamp:1,value:10},{kind:'market',timestamp:2,value:11}],presentation:{scope}})
function store(){let row:StoredDrawingDocument|null=null;let lost=false;const adapter:DrawingDocumentStore={read:vi.fn(async()=>structuredClone(row)),write:vi.fn(async(_namespace,input)=>{if((row?.revision??null)!==input.expectedRevision)throw new DrawingStoreError('DRAWING_CONFLICT','conflict');row={documentId:input.documentId,revision:crypto.randomUUID(),document:structuredClone(input.document)};if(lost)throw Error('response lost');return structuredClone(row)})};return {adapter,lose:()=>lost=true,restore:()=>lost=false,row:()=>row}}
describe('shared drawing ownership and durable confirmation',()=>{
  it('borrows one session across charts, survives removal, and never owns a renderer',async()=>{
    const registry=new DrawingSessionRegistry({scope:'workspace'}),session=await registry.bind({identity})
    const a=new DrawingHistory({context,apply:(_id,v)=>v}),b=new DrawingHistory({context,apply:(_id,v)=>v}),renderA=vi.fn(),renderB=vi.fn()
    const ca=new DrawingCoordinator(a,{project:renderA,validate:()=>{},changed:()=>{}}),cb=new DrawingCoordinator(b,{project:renderB,validate:()=>{},changed:()=>{}})
    ca.bind(session);cb.bind(session);await a.submit('create','a',value(),'programmatic');await ca.transfer(['a'],'workspace')
    expect(a.getDrawings()).toEqual([]);expect(cb.getDrawing('a')?.presentation?.scope).toBe('workspace');expect(registry.capture()[0].drawings).toHaveLength(1)
    await session.history.undo();expect(a.getDrawing('a')?.presentation?.scope).toBe('chart');expect(session.history.getDrawing('a')).toBeUndefined()
    await session.history.redo();ca.dispose();a.dispose();await session.history.submit('update','a',{...value('a','workspace'),parameters:{textAlign:'center'}},'programmatic')
    expect(cb.getDrawing('a')?.parameters).toEqual({textAlign:'center'});expect(renderB).toHaveBeenCalled();cb.dispose();b.dispose();registry.dispose()
  })
  it('waits for one initial read for concurrent borrowers and isolates identities',async()=>{
    const s=store(),registry=new DrawingSessionRegistry({scope:'host',store:s.adapter})
    const [a,b]=await Promise.all([registry.bind({identity,documentId:'fixed'}),registry.bind({identity,documentId:'fixed'})]);expect(a).toBe(b);expect(s.adapter.read).toHaveBeenCalledTimes(1)
    const different=await registry.bind({identity:{...identity,priceBasisKey:'adjusted'},documentId:'other'});expect(different).not.toBe(a);registry.dispose()
  })
  it('preserves source and fixed destination after lost write; refresh verifies without replay',async()=>{
    const s=store(),registry=new DrawingSessionRegistry({scope:'host',store:s.adapter}),session=await registry.bind({identity,documentId:'fixed'})
    const local=new DrawingHistory({context,apply:(_id,v)=>v}),coordinator=new DrawingCoordinator(local,{project:()=>{},changed:()=>{},validate:()=>{}});coordinator.bind(undefined,session)
    await local.submit('create','a',value(),'programmatic');s.lose();await expect(coordinator.transfer(['a'],'host')).rejects.toThrow('response lost')
    expect(local.getDrawing('a')?.migration?.target.documentId).toBe('fixed');expect(session.history.getDrawings()).toHaveLength(0);expect(session.getState().status).toBe('uncertain')
    await session.refresh();expect(session.getState().status).toBe('saved');expect(s.adapter.write).toHaveBeenCalledTimes(1)
    await coordinator.transfer(['a'],'host');expect(local.getDrawings()).toEqual([]);expect(s.adapter.write).toHaveBeenCalledTimes(1)
    coordinator.dispose();local.dispose();registry.dispose()
  })
  it('keeps a local draft on CAS conflict and requires an explicit discard for refresh',async()=>{
    const s=store(),aRegistry=new DrawingSessionRegistry({scope:'host',store:s.adapter}),bRegistry=new DrawingSessionRegistry({scope:'host',store:s.adapter})
    const a=await aRegistry.bind({identity,documentId:'fixed'}),b=await bRegistry.bind({identity,documentId:'fixed'})
    await a.history.submit('create','a',value('a','host'),'programmatic');await a.save()
    await b.history.submit('create','b',value('b','host'),'programmatic');await expect(b.save()).rejects.toThrow('conflict');expect(b.history.getDrawing('b')).toBeDefined()
    await expect(b.refresh()).rejects.toThrow('本地');await b.refresh({discardLocal:true});expect(b.history.getDrawing('a')).toBeDefined();expect(b.history.getDrawing('b')).toBeUndefined();aRegistry.dispose();bRegistry.dispose()
  })
  it('rejects backend, future, viewport and secondary-pane sharing before mutation',async()=>{
    const registry=new DrawingSessionRegistry({scope:'workspace'}),session=await registry.bind({identity})
    for(const v of [{...value('b','workspace'),owner:'backend'},{...value('c','workspace'),anchors:[{kind:'viewport',x:.5,y:.5}]},{...value('d','workspace'),overlay:{...value().overlay,id:'d',paneId:'sub'}}])expect(()=>session.validate(v as any)).toThrow('仅主价格')
    registry.dispose()
  })
  it('preserves a newer confirmed draft when an earlier lost save is verified',async()=>{
    let resolve!:()=>void;let row:StoredDrawingDocument|null=null
    const adapter:DrawingDocumentStore={read:async()=>structuredClone(row),write:async(_namespace,input)=>{row={documentId:input.documentId,revision:'r1',document:structuredClone(input.document)};await new Promise<void>(r=>resolve=r);throw Error('lost')}}
    const registry=new DrawingSessionRegistry({scope:'host',store:adapter}),session=await registry.bind({identity,documentId:'fixed'})
    await session.history.submit('create','a',value('a','host'),'programmatic');const saving=session.save().catch(()=>{});await Promise.resolve()
    await session.history.submit('update','a',{...value('a','host'),parameters:{textAlign:'right'}},'programmatic');resolve();await saving;await session.refresh()
    expect(session.history.getDrawing('a')?.parameters?.textAlign).toBe('right');expect(session.getState().status).toBe('dirty');expect(session.getState().revision).toBe('r1');registry.dispose()
  })
  it('does not leak store I/O when a history lease cannot be acquired',async()=>{
    const s=store(),registry=new DrawingSessionRegistry({scope:'host',store:s.adapter}),session=await registry.bind({identity,documentId:'fixed'})
    const writing=session.history.submit('create','a',value('a','host'),'programmatic')
    await expect(session.refresh()).rejects.toThrow('绘图提交');await writing;await session.save();expect(session.getState().status).toBe('saved');registry.dispose()
  })
  it('blocks a lost migration from changing its fixed destination and exposes its responsibility',async()=>{
    const s=store(),registry=new DrawingSessionRegistry({scope:'host',store:s.adapter}),host=await registry.bind({identity,documentId:'fixed'}),workspace=await new DrawingSessionRegistry({scope:'workspace'}).bind({identity})
    const local=new DrawingHistory({context,apply:(_id,v)=>v}),coordinator=new DrawingCoordinator(local,{project:()=>{},changed:()=>{},validate:()=>{}});coordinator.bind(workspace,host)
    await local.submit('create','a',value(),'programmatic');s.lose();await expect(coordinator.transfer(['a'],'host')).rejects.toThrow('response lost')
    await expect(coordinator.transfer(['a'],'workspace')).rejects.toThrow('固定目标');expect(coordinator.state().uncertainLogicalIds).toContain('a');expect(local.getDrawing('a')).toBeDefined();coordinator.dispose();registry.dispose();workspace.dispose();local.dispose()
  })
  it('retains the destination and durable recovery when leaving host has a lost response',async()=>{
    const s=store(),registry=new DrawingSessionRegistry({scope:'host',store:s.adapter}),host=await registry.bind({identity,documentId:'fixed'})
    await host.history.submit('create','a',value('a','host'),'programmatic');await host.save()
    const local=new DrawingHistory({context,apply:(_id,v)=>v}),coordinator=new DrawingCoordinator(local,{project:()=>{},changed:()=>{},validate:()=>{}});coordinator.bind(undefined,host)
    s.lose();await expect(coordinator.transfer(['a'],'chart')).rejects.toThrow('response lost');expect(local.getDrawing('a')?.migration?.direction).toBe('from-host')
    await host.refresh();expect(host.history.getDrawing('a')).toBeUndefined();expect(local.getDrawing('a')).toBeDefined();expect(host.getRecoveries()[0].drawings[0].logicalId).toBe('a');expect(s.row()?.document.transfers).toHaveLength(1)
    coordinator.dispose();registry.dispose();local.dispose()
    const reopened=new DrawingSessionRegistry({scope:'host',store:s.adapter}),restored=await reopened.bind({identity,documentId:'fixed'});expect(restored.getRecoveries()[0].drawings[0].logicalId).toBe('a');reopened.dispose()
  })
  it('invalidates transfer undo after canonical content changes and releases operations on reset',async()=>{
    const registry=new DrawingSessionRegistry({scope:'workspace'}),session=await registry.bind({identity}),local=new DrawingHistory({context,apply:(_id,v)=>v}),coordinator=new DrawingCoordinator(local,{project:()=>{},changed:()=>{},validate:()=>{}});coordinator.bind(session)
    await local.submit('create','a',value(),'programmatic');await coordinator.transfer(['a'],'workspace')
    const canonical=value('a','workspace');canonical.anchors![0]={kind:'market',timestamp:1,value:777};canonical.overlay.points[0].value=777
    session.history.reconcile('local',[canonical]);expect(session.history.getState().canUndo).toBe(false);await session.history.undo();expect(local.getDrawing('a')).toBeUndefined();expect(session.history.getDrawing('a')?.overlay.points[0].value).toBe(777)
    session.history.reset();expect((session.history as any).operations.size).toBe(0);coordinator.dispose();registry.dispose();local.dispose()
  })
  it('invalidates only the unavailable transfer history when the source chart is disposed',async()=>{
    const registry=new DrawingSessionRegistry({scope:'workspace'}),session=await registry.bind({identity}),local=new DrawingHistory({context,apply:(_id,v)=>v}),coordinator=new DrawingCoordinator(local,{project:()=>{},changed:()=>{},validate:()=>{}});coordinator.bind(session)
    await local.submit('create','a',value(),'programmatic');await coordinator.transfer(['a'],'workspace');coordinator.dispose();local.dispose()
    expect(session.history.getState().canUndo).toBe(false);await expect(session.history.undo()).resolves.toBeUndefined();expect((session.history as any).operations.size).toBe(0);expect(session.history.getDrawing('a')).toBeDefined();registry.dispose()
  })
  it('preserves the source intent when the binding changes during an awaited migration',async()=>{
    let finish!:()=>void;const s=store(),baseWrite=s.adapter.write;s.adapter.write=async(namespace,input,signal)=>{await new Promise<void>(r=>finish=r);return baseWrite(namespace,input,signal)}
    const registry=new DrawingSessionRegistry({scope:'host',store:s.adapter}),host=await registry.bind({identity,documentId:'fixed'}),other=await registry.bind({identity:{...identity,priceBasisKey:'other'},documentId:'other'})
    const local=new DrawingHistory({context,apply:(_id,v)=>v}),coordinator=new DrawingCoordinator(local,{project:()=>{},changed:()=>{},validate:()=>{}});coordinator.bind(undefined,host)
    await local.submit('create','a',value(),'programmatic');const moving=coordinator.transfer(['a'],'host');await Promise.resolve();coordinator.bind(undefined,other);finish();await expect(moving).rejects.toThrow('共享绑定')
    expect(local.getDrawing('a')?.migration?.target.documentId).toBe('fixed');expect(coordinator.getDrawing('a')).toBeDefined();coordinator.dispose();registry.dispose();local.dispose()
  })

  it('cleans recovery durably and records recovered migration undo/redo once',async()=>{
    const s=store(),registry=new DrawingSessionRegistry({scope:'host',store:s.adapter}),host=await registry.bind({identity,documentId:'fixed'})
    await host.history.submit('create','a',value('a','host'),'programmatic');await host.save()
    const local=new DrawingHistory({context,apply:(_id,v)=>v}),coordinator=new DrawingCoordinator(local,{project:()=>{},changed:()=>{},validate:()=>{}});coordinator.bind(undefined,host)
    s.lose();await expect(coordinator.transfer(['a'],'chart')).rejects.toThrow('response lost');await host.refresh();s.restore()
    const recovery=host.getRecoveries()[0];await coordinator.recover(recovery.id,'chart')
    expect(host.getRecoveries()).toEqual([]);expect(s.row()?.document.transfers).toBeUndefined();expect(local.getDrawing('a')?.migration).toBeUndefined();expect(local.getState().canUndo).toBe(true)
    await local.undo();expect(local.getDrawing('a')).toBeUndefined();expect(host.history.getDrawing('a')).toEqual(value('a','host'));expect(host.getRecoveries()).toEqual([])
    await expect(coordinator.recover(recovery.id,'chart')).rejects.toThrow('不存在');await local.redo();expect(local.getDrawing('a')?.presentation?.scope).toBe('chart');expect(host.history.getDrawing('a')).toBeUndefined();coordinator.dispose();registry.dispose();local.dispose()
  })
  it('removes stale recovery records when undo returns an object to its host authority',async()=>{
    const s=store(),registry=new DrawingSessionRegistry({scope:'host',store:s.adapter}),host=await registry.bind({identity,documentId:'fixed'})
    await host.history.submit('create','a',value('a','host'),'programmatic');await host.save()
    const local=new DrawingHistory({context,apply:(_id,v)=>v}),coordinator=new DrawingCoordinator(local,{project:()=>{},changed:()=>{},validate:()=>{}});coordinator.bind(undefined,host)
    await coordinator.transfer(['a'],'chart');const id=host.getRecoveries()[0].id;await local.undo()
    expect(host.getRecoveries()).toEqual([]);expect(s.row()?.document.transfers).toBeUndefined();await expect(coordinator.recover(id,'chart')).rejects.toThrow('不存在');expect(local.getDrawing('a')).toBeUndefined();expect(host.history.getDrawing('a')).toBeDefined();coordinator.dispose();registry.dispose();local.dispose()
  })
  it('preflights destination permission for transfer undo before changing either authority',async()=>{
    let denied=false
    const registry=new DrawingSessionRegistry({scope:'workspace'}),session=await registry.bind({identity}),local=new DrawingHistory({context,apply:(_id,v)=>v,validateTransfer:()=>{if(denied)throw Error('host denied')}}),coordinator=new DrawingCoordinator(local,{project:()=>{},changed:()=>{},validate:()=>{}});coordinator.bind(session)
    await local.submit('create','a',value(),'programmatic');await coordinator.transfer(['a'],'workspace');denied=true
    await expect(session.history.undo()).rejects.toThrow('host denied');expect(local.getDrawing('a')).toBeUndefined();expect(session.history.getDrawing('a')).toBeDefined();denied=false;await session.history.undo();expect(local.getDrawing('a')).toBeDefined();coordinator.dispose();registry.dispose();local.dispose()
  })
  it('rejects recovery while the source authority owns the ID again',async()=>{
    const s=store(),registry=new DrawingSessionRegistry({scope:'host',store:s.adapter}),host=await registry.bind({identity,documentId:'fixed'})
    await host.history.submit('create','a',value('a','host'),'programmatic');await host.save();const local=new DrawingHistory({context,apply:(_id,v)=>v}),coordinator=new DrawingCoordinator(local,{project:()=>{},changed:()=>{},validate:()=>{}});coordinator.bind(undefined,host)
    await coordinator.transfer(['a'],'chart');const record=host.getRecoveries()[0]
    // A canonical external write returned the object without cleaning its old recovery record.
    const saved=s.row()!;saved.document.drawings=[value('a','host')];await s.adapter.write(identity.namespace,{documentId:'fixed',expectedRevision:saved.revision,document:saved.document},new AbortController().signal);await host.refresh({discardLocal:true})
    await expect(coordinator.recover(record.id,'chart')).rejects.toThrow('重新拥有');expect(host.history.getDrawing('a')).toBeDefined();coordinator.dispose();registry.dispose();local.dispose()
  })

})
