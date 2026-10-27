import {describe,it,expect,vi} from 'vitest'
import {DrawingPreferencesManager,defaultDrawingPreferences,validateDrawingPreferences,migrateDrawingPreferences,createIndexedDBDrawingPreferencesStore,type DrawingPreferences,type DrawingPreferencesStore} from '../preferences'
import {builtinDrawingCatalog} from '../catalog'
import {DrawingController} from '../controller'
import {DrawingHistory} from '../history'
describe('drawing preferences and template ownership',()=>{
  it('purely migrates v1 inputs, keeps old template IDs and numeric levels, and rejects damaged or unknown versions',()=>{
    const v2=defaultDrawingPreferences(),{snapping,...ui}=v2.ui,old={...v2,version:1,ui,templates:[{id:'old-template',name:'旧模板',toolId:'fibonacciLine',styles:{},parameters:{levels:[-1,.5,.5,2]}}]},before=structuredClone(old)
    const migrated=migrateDrawingPreferences(old,builtinDrawingCatalog);expect(old).toEqual(before);expect(migrated.version).toBe(2);expect(migrated.ui.snapping).toEqual({ohlc:true,indicators:true,weakSensitivity:8});expect(migrated.templates).toEqual(old.templates)
    migrated.templates[0].name='副本';expect(old.templates[0].name).toBe('旧模板')
    for(const value of [{...old,version:3},{...old,ui:null},{...v2,ui:{...v2.ui,snapping:{...snapping,ohlc:'yes'}}},{...v2,ui:{...v2.ui,snapping:{...snapping,weakSensitivity:9}}}])expect(()=>migrateDrawingPreferences(value,builtinDrawingCatalog)).toThrow()
  })
  it('does not write a migrated initial read until an explicit edit and keeps the stored original detached',async()=>{
    const v2=defaultDrawingPreferences(),{snapping,...ui}=v2.ui,old={...v2,version:1 as const,ui},before=structuredClone(old),write=vi.fn(async()=>{})
    const manager=new DrawingPreferencesManager({catalog:builtinDrawingCatalog,scope:'scope',store:{read:async()=>old,write}})
    await vi.waitFor(()=>expect(manager.getState().status).toBe('saved'));expect(write).not.toHaveBeenCalled();expect(manager.getState().value.version).toBe(2);expect(old).toEqual(before)
    manager.update({ui:{snapping:{indicators:false}}});await manager.save();expect(write.mock.calls.at(-1)![1].version).toBe(2);expect(old).toEqual(before);manager.dispose()
  })
  it('merges only edited nested snapping fields into a late original and loads an empty custom catalog store',async()=>{
    let release!:(value:DrawingPreferences)=>void
    const original=defaultDrawingPreferences();original.ui.snapping={ohlc:true,indicators:false,weakSensitivity:16};original.ui.favoritesPosition={x:220,y:75}
    const manager=new DrawingPreferencesManager({catalog:builtinDrawingCatalog,scope:'scope',store:{read:()=>new Promise(resolve=>{release=resolve}),write:async()=>{}}})
    manager.update({ui:{snapping:{ohlc:false}}});manager.update({ui:{continuous:true}});release(original);await manager.save()
    expect(manager.getState().value.ui).toEqual({continuous:true,favoritesPosition:{x:220,y:75},snapping:{ohlc:false,indicators:false,weakSensitivity:16}});manager.dispose()
    const custom={...structuredClone(builtinDrawingCatalog[0]),toolId:'only-host',overlayName:'OnlyHost'},empty=new DrawingPreferencesManager({catalog:[custom],scope:'scope',store:{read:async()=>null,write:async()=>{}}})
    await vi.waitFor(()=>expect(empty.getState().status).toBe('saved'));expect(empty.getState().value.favorites).toEqual([]);empty.dispose()
  })
  it('rejects template content and unknown parameter values rather than saving positions or executable values',()=>{
    const preferences=defaultDrawingPreferences()
    preferences.templates=[{id:'one',name:'Style',toolId:'textAnnotation',styles:{text:{color:'#f00'}},parameters:{textAlign:'center'}}]
    expect(()=>validateDrawingPreferences(preferences,builtinDrawingCatalog)).not.toThrow()
    for(const extra of [{points:[{timestamp:1,value:1}]},{backendId:'server'},{text:'Body'},{styles:{line:{color:()=>1}}}])expect(()=>validateDrawingPreferences({...preferences,templates:[{...preferences.templates[0],...extra} as any]},builtinDrawingCatalog)).toThrow()
    preferences.templates[0].parameters={textAlign:'invalid'};expect(()=>validateDrawingPreferences(preferences,builtinDrawingCatalog)).toThrow('允许选项')
  })
  it('keeps edits made while an initial read is still pending',async()=>{
    let release!:(value:DrawingPreferences)=>void
    const read=vi.fn(()=>new Promise<DrawingPreferences>(resolve=>{release=resolve})),write=vi.fn(async()=>{})
    const manager=new DrawingPreferencesManager({catalog:builtinDrawingCatalog,scope:' opaque:scope ',store:{read,write}})
    manager.update({favorites:['rect']});release(defaultDrawingPreferences());await Promise.resolve();await Promise.resolve()
    expect(manager.getState().value.favorites).toEqual(['rect']);expect(read.mock.calls[0][0]).toBe(' opaque:scope ')
    manager.dispose()
  })
  it('merges recency and newly saved templates into a late original without erasing unseen templates or defaults',async()=>{
    let release!:(value:DrawingPreferences)=>void
    const original=defaultDrawingPreferences();original.templates=[{id:'existing',name:'Existing',toolId:'rect',styles:{line:{color:'#123456'}}}];original.defaults={rect:{styles:{line:{size:4}}}};original.shortcuts={brush:'alt+1'}
    let stored=structuredClone(original)
    const write=vi.fn(async(_scope:string,value:DrawingPreferences)=>{stored=structuredClone(value)})
    const manager=new DrawingPreferencesManager({catalog:builtinDrawingCatalog,scope:'scope',store:{read:()=>new Promise(resolve=>{release=resolve}),write}})
    manager.update({recent:['brush']});manager.update({templates:[{id:'new',name:'New',toolId:'rect',styles:{line:{color:'#f00'}}}]})
    expect(write).not.toHaveBeenCalled();release(original);await manager.save()
    expect(stored.templates.map(t=>t.id)).toEqual(['existing','new']);expect(stored.defaults).toEqual(original.defaults);expect(stored.shortcuts).toEqual(original.shortcuts);expect(stored.recent[0]).toBe('brush');expect(manager.getState().status).toBe('saved');manager.dispose()
  })
  it('does not write an unread original after failed initialization, then merges edits on retry',async()=>{
    const original=defaultDrawingPreferences();original.templates=[{id:'existing',name:'Existing',toolId:'rect',styles:{}}]
    const read=vi.fn().mockRejectedValueOnce(Error('unavailable')).mockResolvedValue(original),write=vi.fn(async()=>{})
    const manager=new DrawingPreferencesManager({catalog:builtinDrawingCatalog,scope:'scope',store:{read,write}})
    manager.update({recent:['brush']});await manager.save();expect(write).not.toHaveBeenCalled();expect(manager.getState().status).toBe('error')
    await manager.retry();expect(write).toHaveBeenCalledOnce();expect(write.mock.calls[0][1].templates[0].id).toBe('existing');expect(manager.getState().value.recent[0]).toBe('brush');manager.dispose()
  })
  it('reports failed writes as unsaved while preserving the editable session',async()=>{
    const write=vi.fn(async()=>{throw Error('quota')})
    const manager=new DrawingPreferencesManager({catalog:builtinDrawingCatalog,scope:'scope',store:{read:async()=>null,write}})
    await Promise.resolve();manager.update({favorites:['brush']});await manager.save()
    expect(manager.getState()).toMatchObject({status:'error',value:{favorites:['brush']},error:expect.stringContaining('尚未保存')})
    write.mockResolvedValue(undefined);await manager.retry();expect(manager.getState().status).toBe('saved');manager.dispose()
  })
  it('does not dispose a borrowed store and aborts its own late read',async()=>{
    let signal:AbortSignal|undefined,release!:(value:DrawingPreferences)=>void
    const dispose=vi.fn(),store={read:vi.fn((_scope:string,current:AbortSignal)=>{signal=current;return new Promise<DrawingPreferences>(resolve=>{release=resolve})}),write:vi.fn(),dispose}
    const changed=vi.fn(),manager=new DrawingPreferencesManager({catalog:builtinDrawingCatalog,store,scope:'scope',changed})
    manager.dispose();expect(signal?.aborted).toBe(true);expect(dispose).not.toHaveBeenCalled();release(defaultDrawingPreferences());await Promise.resolve();expect(changed).not.toHaveBeenCalled()
  })
  it('requires an explicit scope for persistence and keeps the adapter lazy before its first operation',()=>{
    const store:DrawingPreferencesStore={read:vi.fn(),write:vi.fn()}
    expect(()=>new DrawingPreferencesManager({catalog:builtinDrawingCatalog,store})).toThrow('drawingPreferencesScope')
    const open=vi.fn();vi.stubGlobal('indexedDB',{open});const adapter=createIndexedDBDrawingPreferencesStore();expect(open).not.toHaveBeenCalled();adapter.dispose();vi.unstubAllGlobals()
  })
  it('saves a template through the controller without source geometry, text, IDs, or ownership',async()=>{
    const preferences=new DrawingPreferencesManager({catalog:builtinDrawingCatalog})
    const history=new DrawingHistory({context:()=>({symbol:{ticker:'A'},period:{multiplier:1,timespan:'day',text:'1d'}}),apply:(_id,value)=>value})
    history.reconcile('local',[{logicalId:'source',owner:'local',overlay:{id:'source',groupId:'tools',name:'textAnnotation',points:[{timestamp:100,value:10}],extendData:'Private body',styles:{text:{color:'#f00'}},lock:false,visible:true},anchors:[{kind:'market',timestamp:100,value:10}],parameters:{textAlign:'center'}}])
    const controller=new DrawingController({history,preferences,editable:()=>true,validate:()=>{},create:()=>{},cancel:()=>{},project:()=>{},owner:()=> 'local'})
    expect((await controller.execute({type:'template',action:'save',name:'Reusable',ids:['source']})).status).toBe('completed')
    expect(preferences.getState().value.templates[0]).toEqual({id:expect.any(String),name:'Reusable',toolId:'textAnnotation',styles:{text:{color:'#f00'}},parameters:{textAlign:'center'}})
    preferences.dispose();controller.dispose();history.dispose()
  })
})
