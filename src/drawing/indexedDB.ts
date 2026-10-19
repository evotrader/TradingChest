export interface DrawingDatabase {
  transact<T>(store:'preferences'|'documents',mode:IDBTransactionMode,signal:AbortSignal,work:(store:IDBObjectStore,done:(value:T)=>void,fail:(error:unknown)=>void)=>void):Promise<T>
  dispose():void
}
/** A separate drawing database; workspace database version and records stay untouched. */
export function createDrawingDatabase(databaseName='trading-chest-drawings'):DrawingDatabase {
  let connection:IDBDatabase|undefined,opening:Promise<IDBDatabase>|undefined,disposed=false
  const transactions=new Set<IDBTransaction>()
  const assertOpen=()=>{if(disposed)throw Error('绘图存储已关闭')}
  const abort=()=>new DOMException('绘图存储操作已取消','AbortError')
  function connect():Promise<IDBDatabase>{
    assertOpen()
    if(connection)return Promise.resolve(connection)
    if(opening)return opening
    opening=new Promise<IDBDatabase>((resolve,reject)=>{
      if(!globalThis.indexedDB){reject(Error('当前环境无法使用 IndexedDB'));return}
      const request=indexedDB.open(databaseName,1)
      let abandoned=false
      request.onupgradeneeded=()=>{for(const name of ['preferences','documents'])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name,{keyPath:['scope','id']})}
      request.onerror=()=>{abandoned=true;reject(request.error??Error('绘图存储打开失败'))}
      request.onblocked=()=>{abandoned=true;reject(Error('绘图存储被其它连接阻塞，请关闭旧页面后重试'))}
      request.onsuccess=()=>{
        const db=request.result
        if(disposed||abandoned){db.close();reject(Error('绘图存储已关闭'));return}
        connection=db;db.onversionchange=()=>{db.close();if(connection===db)connection=undefined};db.onclose=()=>{if(connection===db)connection=undefined};resolve(db)
      }
    }).finally(()=>{opening=undefined})
    return opening
  }
  return {
    async transact<T>(name:'preferences'|'documents',mode:IDBTransactionMode,signal:AbortSignal,work:(store:IDBObjectStore,done:(value:T)=>void,fail:(error:unknown)=>void)=>void):Promise<T>{
      assertOpen();signal.throwIfAborted()
      const db=await connect();assertOpen();signal.throwIfAborted()
      return new Promise<T>((resolve,reject)=>{
        const transaction=db.transaction(name,mode);transactions.add(transaction)
        let value:T,ready=false,error:unknown
        const cleanup=()=>{transactions.delete(transaction);signal.removeEventListener('abort',cancel)}
        const fail=(reason:unknown)=>{error??=reason;try{transaction.abort()}catch{/* Completion determines whether a queued commit has already succeeded. */}}
        const cancel=()=>fail(abort())
        transaction.oncomplete=()=>{cleanup();if(error)reject(error);else if(!ready)reject(Error('绘图存储事务未返回结果'));else resolve(value)}
        transaction.onabort=()=>{cleanup();reject(error??transaction.error??abort())}
        transaction.onerror=()=>{error??=transaction.error??Error('绘图存储事务失败')}
        signal.addEventListener('abort',cancel,{once:true})
        if(signal.aborted){cancel();return}
        try{work(transaction.objectStore(name),result=>{value=result;ready=true},fail)}catch(reason){fail(reason)}
      })
    },
    dispose(){if(disposed)return;disposed=true;for(const transaction of transactions)try{transaction.abort()}catch{};connection?.close();connection=undefined}
  }
}
