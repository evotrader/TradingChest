import {createOpaqueId} from '../ids'
import {
  assertWorkspaceId,assertWorkspaceRevision,assertWorkspaceScope,copyStoredWorkspace,
  prepareWorkspaceWrite,workspaceSummary,WorkspaceStoreError,
  type StoredWorkspace,type WorkspaceStore,type WorkspaceSummary,type WorkspaceWrite,
} from './store'

const STORE='workspaces'
const SCOPE_INDEX='scope'
interface OpenWaiter {resolve:(database:IDBDatabase)=>void;reject:(error:unknown)=>void;cleanup:()=>void}
interface Opening {request:IDBOpenDBRequest;waiters:Set<OpenWaiter>;abandoned:boolean}
interface TransactionWork<T> {
  request:<R>(request:IDBRequest<R>,accept:(value:R)=>void,conflictOnConstraint?:boolean)=>void
  done:(value:T)=>void
  fail:(error:unknown)=>void
}
const unavailable=(message:string,cause?:unknown)=>new WorkspaceStoreError('WORKSPACE_STORE_UNAVAILABLE',message,cause===undefined?undefined:{cause})
const aborted=(signal?:AbortSignal)=>new DOMException(signal?.reason instanceof Error?signal.reason.message:'Workspace operation was cancelled','AbortError')
function storeError(error:unknown):Error {
  if(error instanceof WorkspaceStoreError)return error
  const name=error&&typeof error==='object'&&'name' in error?String(error.name):''
  if(name==='AbortError')return aborted()
  if(name==='QuotaExceededError')return unavailable('IndexedDB storage quota was exceeded',error)
  const message=error instanceof Error?error.message:String(error)
  return unavailable(`IndexedDB workspace storage is unavailable: ${message}`,error)
}

/** This store owns its connections only. Call dispose after all borrowing workspaces. */
export function createIndexedDBWorkspaceStore(options:{databaseName?:string}={}):WorkspaceStore & {dispose():void} {
  const databaseName=options.databaseName??'trading-chest-workspaces'
  let disposed=false,database:IDBDatabase|undefined,opening:Opening|undefined
  const transactions=new Set<()=>void>()
  const assertOpen=()=>{if(disposed)throw unavailable('IndexedDB workspace store is closed')}
  const checkSignal=(signal:AbortSignal)=>{if(signal.aborted)throw aborted(signal)}

  function abandon(entry:Opening,error:unknown){
    entry.abandoned=true
    if(opening===entry)opening=undefined
    for(const waiter of entry.waiters){waiter.cleanup();waiter.reject(error)}
    entry.waiters.clear()
    try{entry.request.transaction?.abort()}catch{/* An open request may already have finished. */}
  }
  function connect(signal:AbortSignal):Promise<IDBDatabase> {
    assertOpen();checkSignal(signal)
    if(database)return Promise.resolve(database)
    return new Promise((resolve,reject)=>{
      let entry=opening
      if(!entry){
        let request:IDBOpenDBRequest
        try {
          if(!globalThis.indexedDB)throw unavailable('IndexedDB is not available in this environment')
          request=globalThis.indexedDB.open(databaseName,1)
        }catch(error){reject(storeError(error));return}
        entry={request,waiters:new Set(),abandoned:false};opening=entry
        const owned=entry
        request.onupgradeneeded=()=>{
          try {
            if(owned.abandoned||disposed){request.transaction!.abort();return}
            const store=request.result.createObjectStore(STORE,{keyPath:['scope','id']})
            store.createIndex(SCOPE_INDEX,'scope',{unique:false})
          }catch(error){abandon(owned,storeError(error))}
        }
        request.onerror=()=>abandon(owned,storeError(request.error))
        request.onblocked=()=>abandon(owned,unavailable('IndexedDB workspace database is blocked by another connection'))
        request.onsuccess=()=>{
          const connection=request.result
          if(owned.abandoned||disposed||owned.waiters.size===0){connection.close();return}
          database=connection
          if(opening===owned)opening=undefined
          connection.onversionchange=()=>{connection.close();if(database===connection)database=undefined}
          connection.onclose=()=>{if(database===connection)database=undefined}
          for(const waiter of owned.waiters){waiter.cleanup();waiter.resolve(connection)}
          owned.waiters.clear()
        }
      }
      const owned=entry
      const cancel=()=>{
        owned.waiters.delete(waiter);waiter.cleanup();reject(aborted(signal))
        if(!owned.waiters.size)abandon(owned,aborted(signal))
      }
      const waiter:OpenWaiter={resolve,reject,cleanup:()=>signal.removeEventListener('abort',cancel)}
      owned.waiters.add(waiter);signal.addEventListener('abort',cancel,{once:true})
      if(signal.aborted)cancel()
    })
  }

  async function transact<T>(mode:IDBTransactionMode,signal:AbortSignal,work:(store:IDBObjectStore,operation:TransactionWork<T>)=>void):Promise<T> {
    assertOpen();checkSignal(signal)
    const connection=await connect(signal)
    assertOpen();checkSignal(signal)
    return new Promise<T>((resolve,reject)=>{
      let transaction:IDBTransaction
      try{transaction=connection.transaction(STORE,mode)}catch(error){reject(storeError(error));return}
      let failure:unknown,result:T,hasResult=false
      const cleanup=()=>{signal.removeEventListener('abort',cancel);transactions.delete(close)}
      const fail=(error:unknown)=>{
        failure??=storeError(error)
        try{transaction.abort()}catch{/* A commit may already be queued; completion still settles with failure. */}
      }
      const cancel=()=>fail(aborted(signal))
      const close=()=>fail(unavailable('IndexedDB workspace store was closed during an operation'))
      transaction.oncomplete=()=>{
        cleanup()
        if(failure)reject(failure)
        else if(!hasResult)reject(unavailable('IndexedDB transaction completed without a workspace result'))
        else resolve(result)
      }
      transaction.onabort=()=>{cleanup();reject(failure??storeError(transaction.error??aborted()))}
      transaction.onerror=()=>{failure??=storeError(transaction.error??unavailable('IndexedDB transaction failed'))}
      const guard=(action:()=>void)=>{try{action()}catch(error){fail(error)}}
      const operation:TransactionWork<T>={
        done:value=>{result=value;hasResult=true},fail,
        request:(request,accept,conflictOnConstraint=false)=>{
          request.onsuccess=()=>guard(()=>accept(request.result))
          request.onerror=()=>{
            const error=request.error
            failure??=conflictOnConstraint&&error?.name==='ConstraintError'
              ?new WorkspaceStoreError('WORKSPACE_CONFLICT','A workspace with this ID already exists')
              :storeError(error)
          }
        },
      }
      transactions.add(close);signal.addEventListener('abort',cancel,{once:true})
      if(signal.aborted){cancel();return}
      guard(()=>work(transaction.objectStore(STORE),operation))
    })
  }
  function revision():string {
    if(!globalThis.crypto?.getRandomValues)throw unavailable('A random ID generator is unavailable for workspace revisions')
    return createOpaqueId()
  }
  function current(scope:string,id:string,value:unknown):StoredWorkspace {
    if(value===undefined)throw new WorkspaceStoreError('WORKSPACE_NOT_FOUND','The selected workspace no longer exists')
    return copyStoredWorkspace(scope,value,id)
  }
  function compare(record:StoredWorkspace,expectedRevision:string){
    if(record.revision!==expectedRevision)throw new WorkspaceStoreError('WORKSPACE_CONFLICT','The workspace changed; refresh before saving or deleting it')
  }

  return {
    async list(scope,signal){
      assertOpen();checkSignal(signal);assertWorkspaceScope(scope)
      return transact<WorkspaceSummary[]>('readonly',signal,(store,op)=>{
        op.request(store.index(SCOPE_INDEX).getAll(scope),rows=>{
          const items=rows.map(row=>workspaceSummary(copyStoredWorkspace(scope,row)))
          items.sort((a,b)=>b.updatedAt-a.updatedAt||(a.id<b.id?-1:a.id>b.id?1:0))
          op.done(items)
        })
      })
    },
    async read(scope,id,signal){
      assertOpen();checkSignal(signal);assertWorkspaceScope(scope);assertWorkspaceId(id)
      return transact<StoredWorkspace|null>('readonly',signal,(store,op)=>{
        op.request(store.get([scope,id]),row=>op.done(row===undefined?null:copyStoredWorkspace(scope,row,id)))
      })
    },
    async write(scope,input,signal){
      assertOpen();checkSignal(signal)
      const captured=prepareWorkspaceWrite(scope,input)
      return transact<StoredWorkspace>('readwrite',signal,(store,op)=>{
        const write=()=>{
          const row={scope,id:captured.id,name:captured.name,document:captured.document,updatedAt:Date.now(),revision:revision()}
          op.request(captured.kind==='create'?store.add(row):store.put(row),()=>op.done(copyStoredWorkspace(scope,row,captured.id)),captured.kind==='create')
        }
        if(captured.kind==='create')write()
        else op.request(store.get([scope,captured.id]),row=>{compare(current(scope,captured.id,row),captured.expectedRevision);write()})
      })
    },
    async remove(scope,id,expectedRevision,signal){
      assertOpen();checkSignal(signal);assertWorkspaceScope(scope);assertWorkspaceId(id);assertWorkspaceRevision(expectedRevision)
      return transact<void>('readwrite',signal,(store,op)=>{
        op.request(store.get([scope,id]),row=>{
          compare(current(scope,id,row),expectedRevision)
          op.request(store.delete([scope,id]),()=>op.done(undefined))
        })
      })
    },
    dispose(){
      if(disposed)return
      disposed=true
      if(opening)abandon(opening,unavailable('IndexedDB workspace store was closed while opening'))
      for(const close of transactions)close()
      database?.close();database=undefined
    },
  }
}
