// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest'
import {
  copyStoredWorkspace,copyWorkspaceDocument,normalizeWorkspaceName,prepareWorkspaceWrite,
  workspaceSummary,WorkspaceStoreError,
} from '../store'
import {createIndexedDBWorkspaceStore} from '../indexedDBStore'
import type {WorkspaceDocument} from '../types'

function document(scope='scope',layout:1|2|4=1):WorkspaceDocument {
  return {version:1,layout,activeCellId:'primary',sync:{symbol:false,period:false,crosshair:false,viewport:false},columnRatio:50,rowRatio:50,
    cells:['primary','secondary-1','secondary-2','secondary-3'].slice(0,layout).map(cellId=>({cellId,context:cellId==='primary'?scope:`${scope}:${cellId}`,
      symbol:{ticker:'A.X'},period:{multiplier:1,timespan:'minute',text:'1m'},
      chart:{version:3,timestamp:1,theme:'dark',locale:'zh-CN',timezone:'UTC',styles:{},indicators:[],panes:[],axes:[],overlayData:[],context:{ticker:'A.X',period:{multiplier:1,timespan:'minute'}}}}))}
}
const stored=(scope='scope')=>({scope,id:'stable-id',name:'名称',revision:'opaque-revision',updatedAt:1,document:document(scope)})
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()})

describe('workspace store value contract',()=>{
  it('exports distinguishable codes without changing the original cause',()=>{
    const cause=Error('native failure'),error=new WorkspaceStoreError('WORKSPACE_STORE_UNAVAILABLE','Unavailable',{cause})
    expect(error).toBeInstanceOf(Error);expect(error.name).toBe('WorkspaceStoreError');expect(error.code).toBe('WORKSPACE_STORE_UNAVAILABLE');expect(error.cause).toBe(cause)
  })
  it('trims names, permits duplicate names, and enforces the inclusive 1–80 bound',()=>{
    expect(normalizeWorkspaceName(' \n 名称 \t')).toBe('名称')
    expect(normalizeWorkspaceName('a'.repeat(80))).toHaveLength(80)
    for(const name of ['', ' \t', 'a'.repeat(81),null,1])expect(()=>normalizeWorkspaceName(name)).toThrow(WorkspaceStoreError)
    expect(prepareWorkspaceWrite('scope',{kind:'create',id:'one',name:'same',document:document()}).name).toBe(prepareWorkspaceWrite('scope',{kind:'create',id:'two',name:'same',document:document()}).name)
  })
  it('treats a scope containing separators or whitespace as an exact opaque value',()=>{
    for(const scope of ['', ' scope:secondary-1 /账户 '])expect(copyWorkspaceDocument(scope,document(scope,4))).toEqual(document(scope,4))
    expect(()=>copyWorkspaceDocument('scope',document('other'))).toThrow('scope')
    const wrong=document('scope',4);wrong.cells[2].context='scope:secondary-1'
    expect(()=>copyWorkspaceDocument('scope',wrong)).toThrow('scope')
  })
  it('copies nested document input and output rather than sharing mutable objects',()=>{
    const input=document(),write=prepareWorkspaceWrite('scope',{kind:'create',id:'stable-id',name:'  名称 ',document:input})
    input.cells[0].symbol.ticker='changed';input.sync.symbol=true
    expect(write.document.cells[0].symbol.ticker).toBe('A.X');expect(write.document.sync.symbol).toBe(false);expect(write.name).toBe('名称')
    const row={...stored(),document:write.document},output=copyStoredWorkspace('scope',row,'stable-id')
    output.document.cells[0].chart.theme='light'
    expect(row.document.cells[0].chart.theme).toBe('dark');expect(output).not.toHaveProperty('scope')
    const summary=workspaceSummary(output);summary.name='another';expect(output.name).toBe('名称');expect(summary).not.toHaveProperty('document')
  })
  it('captures the identity and expected revision as part of the write snapshot',()=>{
    const input={kind:'update' as const,id:'stable-id',expectedRevision:'original',name:'名称',document:document()}
    const captured=prepareWorkspaceWrite('scope',input);input.id='other';input.expectedRevision='new';input.name='changed'
    expect(captured).toMatchObject({kind:'update',id:'stable-id',expectedRevision:'original',name:'名称'})
  })
  it('rejects invalid write identities, kinds, names and update revisions',()=>{
    const base={kind:'update',id:'stable-id',expectedRevision:'revision',name:'名称',document:document()}
    for(const override of [{kind:'other'},{id:''},{id:null},{expectedRevision:''},{expectedRevision:null},{name:' '},{document:null}]){
      expect(()=>prepareWorkspaceWrite('scope',{...base,...override} as never)).toThrow(WorkspaceStoreError)
    }
    expect(()=>prepareWorkspaceWrite(null as never,base as never)).toThrow(WorkspaceStoreError)
  })
  it('rejects damaged structures even when a document validator would throw',()=>{
    for(const value of [null,{},[],{...document(),cells:[null]},{...document(),cells:[{}]},{...document(),sync:null},{...document(),layout:2}]){
      expect(()=>copyWorkspaceDocument('scope',value)).toThrow(WorkspaceStoreError)
    }
    const mismatch=document();mismatch.cells[0].chart.context!.ticker='B.X'
    expect(()=>copyWorkspaceDocument('scope',mismatch)).toThrow(WorkspaceStoreError)
  })
  it('rejects cycles, runtime objects, undefined, functions and nonfinite JSON values',()=>{
    for(const value of [undefined,()=>1,NaN,Infinity,new Date(),new Map(),1n]){
      const input=document();(input.cells[0].chart.styles as any).value=value
      expect(()=>copyWorkspaceDocument('scope',input)).toThrow(WorkspaceStoreError)
    }
    const cycle=document();(cycle.cells[0].chart.styles as any).cycle=cycle
    expect(()=>copyWorkspaceDocument('scope',cycle)).toThrow(WorkspaceStoreError)
  })
  it('rejects corrupt stored metadata and cross-scope or wrong-key records',()=>{
    for(const override of [{id:''},{name:' 名称'},{revision:''},{updatedAt:NaN},{updatedAt:-1},{scope:'other'},{document:document('other')}]){
      expect(()=>copyStoredWorkspace('scope',{...stored(),...override},'stable-id')).toThrow(WorkspaceStoreError)
    }
    expect(()=>copyStoredWorkspace('scope',stored(),'other-id')).toThrow('identity')
  })
})

describe('IndexedDB store unavailable and lifecycle contract',()=>{
  it('reports unavailable for every operation rather than falling back to another store',async()=>{
    vi.stubGlobal('indexedDB',undefined)
    const store=createIndexedDBWorkspaceStore(),signal=new AbortController().signal
    for(const result of [store.list('scope',signal),store.read('scope','id',signal),store.write('scope',{kind:'create',id:'id',name:'name',document:document()},signal),store.remove('scope','id','revision',signal)]){
      await expect(result).rejects.toMatchObject({code:'WORKSPACE_STORE_UNAVAILABLE'})
    }
    store.dispose()
  })
  it('preserves the quota error as an explicit storage failure',async()=>{
    const cause=new DOMException('Disk quota exceeded','QuotaExceededError')
    vi.stubGlobal('indexedDB',{open:()=>{throw cause}})
    const store=createIndexedDBWorkspaceStore()
    await expect(store.list('scope',new AbortController().signal)).rejects.toMatchObject({code:'WORKSPACE_STORE_UNAVAILABLE',message:expect.stringContaining('quota'),cause})
    store.dispose()
  })
  it('does not open IndexedDB after cancellation or disposal',async()=>{
    const open=vi.fn();vi.stubGlobal('indexedDB',{open})
    const signal=new AbortController();signal.abort()
    const store=createIndexedDBWorkspaceStore()
    for(const result of [store.list('scope',signal.signal),store.read('scope','id',signal.signal),store.write('scope',{kind:'create',id:'id',name:'name',document:document()},signal.signal),store.remove('scope','id','revision',signal.signal)])await expect(result).rejects.toMatchObject({name:'AbortError'})
    expect(open).not.toHaveBeenCalled();store.dispose();store.dispose()
    const active=new AbortController().signal
    for(const result of [store.list('scope',active),store.read('scope','id',active),store.write('scope',{kind:'create',id:'id',name:'name',document:document()},active),store.remove('scope','id','revision',active)])await expect(result).rejects.toMatchObject({code:'WORKSPACE_STORE_UNAVAILABLE',message:expect.stringContaining('closed')})
    expect(open).not.toHaveBeenCalled()
  })
  it('validates write input before trying to open a database',async()=>{
    const open=vi.fn();vi.stubGlobal('indexedDB',{open})
    const store=createIndexedDBWorkspaceStore()
    await expect(store.write('scope',{kind:'create',id:'id',name:'name',document:document('different')},new AbortController().signal)).rejects.toMatchObject({code:'WORKSPACE_INVALID_DOCUMENT'})
    expect(open).not.toHaveBeenCalled();store.dispose()
  })
})
