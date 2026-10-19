import {DrawingHistory} from './history'
import {drawingShareKey,isSharedDrawingDocument,type DrawingShareIdentity,type SharedDrawingDocument,type DrawingTransferRecovery} from './document'
import {copyStoredDrawing,DrawingStoreError,type DrawingDocumentStore,type DrawingDocumentWrite} from './documentStore'
import type {DrawingSnapshot,DrawingScope} from './types'
import type {AnalysisContext} from '../analysis/types'
export type DrawingShareResolution={identity:DrawingShareIdentity;documentId?:string}|{reason:string}
export type DrawingShareResolver=(context:AnalysisContext)=>DrawingShareResolution
export interface DrawingSharedReference {namespace:string;documentId:string;logicalId:string;identity:DrawingShareIdentity}
export interface DrawingSessionState {scope:'workspace'|'host';key:string;documentId?:string;revision:string|null;status:'session-only'|'loading'|'dirty'|'saving'|'saved'|'error'|'uncertain';message?:string;recoveries?:Array<{id:string;scope:'chart'|'workspace'|'host';count:number}>}
const stable=(v:any):any=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v
const same=(a:unknown,b:unknown)=>JSON.stringify(stable(a))===JSON.stringify(stable(b))
/** Owns content and history only. Charts, feeds and accounts are never retained. */
export class DrawingSession {
  readonly history:DrawingHistory
  readonly identity:DrawingShareIdentity
  readonly scope:'workspace'|'host'
  private listeners=new Set<(origin:'user'|'history'|'projection',ids:string[])=>void>()
  private changedIds=new Set<string>()
  private state:DrawingSessionState
  private disposed=false
  private io?:AbortController
  private unknown?:{input:DrawingDocumentWrite;mutation:number}
  private mutation=0
  private dirty=false
  private adopting=false
  private recoveries:DrawingTransferRecovery[]=[]
  constructor(options:{identity:DrawingShareIdentity;scope:'workspace'|'host';documentId?:string;store?:DrawingDocumentStore;document?:SharedDrawingDocument}){
    this.options=options;this.identity=structuredClone(options.identity);this.scope=options.scope
    if(options.scope==='host'&&(!options.store||!options.documentId))throw Error('宿主共享需要存储和固定 documentId')
    this.state={scope:options.scope,key:drawingShareKey(this.identity),documentId:options.documentId,revision:null,status:options.store?'loading':'session-only'}
    this.history=new DrawingHistory({context:()=>({symbol:{...this.identity.symbol},period:{multiplier:1,timespan:'shared-document',text:'共享文档'}}),validate:value=>this.validate(value),apply:(id,value)=>{this.changedIds.add(id);if(!this.adopting){this.mutation++;this.dirty=true;if(options.store&&this.state.status!=='uncertain')this.state={...this.state,status:'dirty'}}return value},onChange:()=>this.emit('projection'),onConfirmed:change=>{this.emit(change.source==='history'?'history':'user',[change.logicalId])}})
    if(options.document)this.adopt(options.document)
  }
  private options:{identity:DrawingShareIdentity;scope:'workspace'|'host';documentId?:string;store?:DrawingDocumentStore;document?:SharedDrawingDocument}
  private assertOpen(){if(this.disposed)throw Error('共享绘图会话已关闭')}
  validate(value:DrawingSnapshot):void {
    if(!this.adopting&&['loading','uncertain'].includes(this.state.status))throw Error('共享存储尚未确认，请先刷新核对，不能重发写入')
    if(value.presentation?.scope!==this.scope||!isSharedDrawingDocument({version:1,key:this.state.key,identity:this.identity,drawings:[value]}))throw Error('仅主价格窗格、市场时间锚点的本地对象可共享；请先移回本图再更改锚点')
  }
  subscribe(listener:(origin:'user'|'history'|'projection',ids:string[])=>void):()=>void{this.assertOpen();this.listeners.add(listener);return ()=>this.listeners.delete(listener)}
  private emit(origin:'user'|'history'|'projection',explicitIds?:string[]){if(!this.disposed){const ids=explicitIds??[...this.changedIds];this.changedIds.clear();for(const listener of this.listeners)listener(origin,ids)}}
  getState():DrawingSessionState{return structuredClone({...this.state,recoveries:this.recoveries.map(r=>({id:r.id,scope:r.scope,count:r.drawings.length}))})}
  getRecoveries():DrawingTransferRecovery[]{return structuredClone(this.recoveries)}
  getRecovery(id:string):DrawingTransferRecovery|undefined{return structuredClone(this.recoveries.find(r=>r.id===id))}
  capture():SharedDrawingDocument {this.assertOpen();const s=this.history.getState();if(s.pending||s.uncertainLogicalIds.length||this.unknown||this.history.getDrawings().some(value=>value.migration))throw Error('共享绘图尚未确认，不能捕获或切换');return {version:1,key:this.state.key,identity:structuredClone(this.identity),drawings:this.history.getDrawings(),...(this.recoveries.length?{transfers:structuredClone(this.recoveries)}:{})}}
  private adopt(document:SharedDrawingDocument){if(!isSharedDrawingDocument(document)||document.key!==this.state.key)throw Error('共享文档身份不匹配');this.recoveries=structuredClone(document.transfers??[]);this.adopting=true;try{this.history.reconcile('local',document.drawings.map(v=>({...v,presentation:{...v.presentation,scope:this.scope}})))}finally{this.adopting=false}}
  private begin(){this.assertOpen();if(this.io)throw Error('共享绘图存储正在处理，请稍候');const controller=new AbortController();this.io=controller;return controller}
  async refresh(options:{discardLocal?:boolean}={}):Promise<void>{
    const store=this.options.store;if(!store)return
    if(this.dirty&&!this.unknown&&!options.discardLocal)throw Error('本地有未保存修改，请先保存或明确选择丢弃草稿再刷新')
    const lease=this.history.beginRestore()
    let controller:AbortController
    try{controller=this.begin()}catch(error){lease.release();throw error}
    const before=this.state
    this.state={...this.state,status:'loading',message:undefined};this.emit('projection')
    try{
      const raw=await store.read(this.identity.namespace,this.options.documentId!,controller.signal);controller.signal.throwIfAborted();this.assertOpen()
      const value=raw?copyStoredDrawing(this.identity.namespace,this.options.documentId!,raw):null
      if(value&&value.document.key!==this.state.key)throw Error('共享文档标的或价格口径不匹配')
      if(this.unknown){
        const pending=this.unknown
        if(value&&same(value.document,pending.input.document)){const newer=pending.mutation!==this.mutation;if(!newer){this.recoveries=structuredClone(value.document.transfers??[]);this.adopting=true;try{this.history.reconcile('local',value.document.drawings,lease.token)}finally{this.adopting=false}}this.dirty=newer;this.unknown=undefined;this.state={...this.state,revision:value.revision,status:newer?'dirty':'saved',message:undefined};return}
        this.unknown=undefined;this.state={...before,status:'error',message:'未确认原写入；草稿和固定目标 ID 已保留，请核对后保存或另存'}
        return
      }
      // The lease prevents local commands from racing an awaited canonical read.
      if(value){this.recoveries=structuredClone(value.document.transfers??[]);this.adopting=true;try{this.history.reconcile('local',value.document.drawings,lease.token)}finally{this.adopting=false}}
      else if(before.revision!==null)throw Error('共享文档已不存在，当前画面已保留')
      this.dirty=false;this.state={...this.state,revision:value?.revision??null,status:value?'saved':'dirty',message:undefined}
    }catch(error){this.state={...before,status:this.unknown?'uncertain':'error',message:error instanceof Error?error.message:String(error)};throw error}
    finally{lease.release();if(this.io===controller)this.io=undefined;this.emit('projection')}
  }
  async save():Promise<void>{
    const store=this.options.store;if(!store)throw Error('当前会话没有持久共享存储')
    if(this.state.status==='loading')throw Error('共享文档尚未读取，不能覆盖')
    if(this.unknown)throw Error('上次写入结果未知，请先刷新核对固定目标 ID')
    const document=this.capture()
    await this.persistDocument(document)
  }
  private async persistDocument(document:SharedDrawingDocument):Promise<void>{
    const store=this.options.store!
    const input:DrawingDocumentWrite={documentId:this.options.documentId!,expectedRevision:this.state.revision,document},controller=this.begin(),mutation=this.mutation
    this.state={...this.state,status:'saving',message:undefined};this.emit('projection')
    try{
      const value=copyStoredDrawing(this.identity.namespace,input.documentId,await store.write(this.identity.namespace,structuredClone(input),controller.signal));controller.signal.throwIfAborted();this.assertOpen()
      if(!same(value.document,document))throw Error('共享存储确认内容与提交不一致')
      this.dirty=mutation!==this.mutation;this.state={...this.state,revision:value.revision,status:mutation===this.mutation?'saved':'dirty',message:undefined}
    }catch(error){
      const definite=error instanceof DrawingStoreError&&['DRAWING_CONFLICT','DRAWING_INVALID_DOCUMENT'].includes(error.code)
      if(!definite)this.unknown={input,mutation}
      this.state={...this.state,status:definite?'error':'uncertain',message:error instanceof Error?error.message:String(error)};throw error
    }finally{if(this.io===controller)this.io=undefined;this.emit('projection')}
  }
  applyTransferred(id:string,value:DrawingSnapshot|null,token:symbol):void{
    this.adopting=this.scope==='host'
    try{this.history.transferRecord(id,value,token)}finally{this.adopting=false}
  }
  /** Used under both source and target history leases during an authority transfer. */
  async persistCandidate(values:DrawingSnapshot[],transfers=this.recoveries):Promise<void>{
    if(!this.options.store)throw Error('共享存储未启用')
    if(this.unknown||this.io||this.state.status==='loading')throw Error('共享文档尚未确认，请先刷新核对')
    for(const value of values)this.validate(value)
    const document:SharedDrawingDocument={version:1,key:this.state.key,identity:structuredClone(this.identity),drawings:values,...(transfers.length?{transfers:structuredClone(transfers)}:{})}
    if(this.state.status==='saved'&&same(document,{version:1,key:this.state.key,identity:this.identity,drawings:this.history.getDrawings(),...(this.recoveries.length?{transfers:this.recoveries}:{})}))return
    await this.persistDocument(document);this.recoveries=structuredClone(transfers)
  }
  markDirty():void{this.mutation++;this.dirty=true;if(this.options.store){this.state={...this.state,status:'dirty'};this.emit('user')}}
  dispose():void{if(this.disposed)return;this.disposed=true;this.io?.abort();this.listeners.clear();this.history.dispose()}
}
/** The owner disposes the registry after every borrowing chart/workspace. */
export class DrawingSessionRegistry {
  private sessions=new Map<string,DrawingSession>()
  private reads=new Map<string,Promise<void>>()
  private disposed=false
  constructor(private options:{scope:'workspace'|'host';store?:DrawingDocumentStore;documents?:SharedDrawingDocument[]}){
    for(const document of options.documents??[]){const session=new DrawingSession({scope:options.scope,identity:document.identity,document});this.sessions.set(document.key,session)}
  }
  async bind(resolution:DrawingShareResolution):Promise<DrawingSession>{
    if(this.disposed)throw Error('共享绘图会话集合已关闭')
    if('reason' in resolution)throw Error(resolution.reason)
    const key=drawingShareKey(resolution.identity),entryKey=this.options.scope==='host'?JSON.stringify([key,resolution.documentId]):key
    let session=this.sessions.get(entryKey)
    if(!session){session=new DrawingSession({scope:this.options.scope,identity:resolution.identity,store:this.options.store,documentId:resolution.documentId});this.sessions.set(entryKey,session);if(this.options.scope==='host'){const owned=session;const read=owned.refresh().catch(error=>{this.sessions.delete(entryKey);owned.dispose();throw error}).finally(()=>this.reads.delete(entryKey));this.reads.set(entryKey,read)}}
    const read=this.reads.get(entryKey);if(read)await read
    if(this.disposed)throw Error('共享会话集合已关闭')
    return session
  }
  capture():SharedDrawingDocument[]{return [...this.sessions.values()].map(session=>session.capture())}
  dispose():void{if(this.disposed)return;this.disposed=true;for(const session of this.sessions.values())session.dispose();this.sessions.clear()}
}
