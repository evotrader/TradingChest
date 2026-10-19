import {DrawingStoreError} from './documentStore'
import type {DrawingHistory} from './history'
import {DrawingSession,type DrawingSharedReference} from './session'
import type {DrawingTransferRecovery} from './document'
import type {DrawingScope,DrawingSnapshot,DrawingHistoryState} from './types'
const copy=<T>(value:T):T=>JSON.parse(JSON.stringify(value))
async function moveDrawingDocuments(from:DrawingHistory,to:DrawingHistory,documents:DrawingSnapshot[],ids:string[],fromSessionInput:DrawingSession|undefined,toSessionInput:DrawingSession|undefined,assertBinding:()=>void,active?:DrawingHistory):Promise<void>{
      assertBinding()
      const fromSession=fromSessionInput,toSession=toSessionInput,fromLease=from.transferGuard(from===active)
      let toLease:ReturnType<DrawingHistory['beginRestore']>|undefined
      try{
        toLease=to.transferGuard(to===active)
        for(const value of documents){
          if(!from.getDrawing(value.logicalId))throw Error('原转移对象已不存在')
          const existing=to.getDrawing(value.logicalId)
          if(existing&&JSON.stringify(existing)!==JSON.stringify(value))throw Error('目标已有不同的同 ID 绘图，原件已保留')
          if(toSession)toSession.validate(value);else {/* The destination history validates its original chart policy. */}
        }
        from.preflightTransfer(ids.map(id=>from.getDrawing(id)!));to.preflightTransfer(documents)
        const proposed=[...to.getDrawings().filter(value=>!ids.includes(value.logicalId)),...documents]
        if(toSession?.scope==='host'){
          for(const original of from.getDrawings().filter(value=>ids.includes(value.logicalId))){
            const reference:DrawingSharedReference={namespace:toSession.identity.namespace,documentId:toSession.getState().documentId!,logicalId:original.logicalId,identity:copy(toSession.identity)}
            from.setTransferIntent(original.logicalId,{target:reference,status:'prepared'},fromLease.token)
          }
          try{await toSession.persistCandidate(proposed,toSession.getRecoveries().flatMap(record=>{const drawings=record.drawings.filter(value=>!ids.includes(value.logicalId));return drawings.length?[{...record,drawings,originals:record.originals.filter(value=>!ids.includes(value.logicalId))}]:[]}))}catch(error){
            if(fromLease.isCurrent())for(const original of from.getDrawings().filter(value=>ids.includes(value.logicalId)))from.setTransferIntent(original.logicalId,error instanceof DrawingStoreError&&['DRAWING_CONFLICT','DRAWING_INVALID_DOCUMENT'].includes(error.code)?undefined:{...original.migration!,status:'uncertain'},fromLease.token)
            throw error
          }
        }
        assertBinding();if(!fromLease.isCurrent()||!toLease.isCurrent())throw Error('转移期间原文档已关闭，固定目标引用已保留')
        if(fromSession?.scope==='host'){
          if(toSession?.scope==='host')throw Error('不同宿主文档之间请使用显式另存，不改变原权威')
          const record:DrawingTransferRecovery={id:JSON.stringify([fromSession.getState().documentId,...ids.slice().sort()]),scope:toSession?.scope??'chart',drawings:copy(documents),originals:ids.map(id=>{const value=from.getDrawing(id)!;delete value.migration;return value})}
          // A read-only recovery record travels in the same durable write as removal.
          // Stage the target before waiting; an unknown removal never leaves both views empty.
          if(!toSession||toSession.scope==='workspace')for(const value of documents)to.transferRecord(value.logicalId,{...value,migration:{target:{namespace:fromSession.identity.namespace,documentId:fromSession.getState().documentId!,logicalId:value.logicalId,identity:copy(fromSession.identity)},direction:'from-host',status:'prepared'}},toLease.token)
          try{await fromSession.persistCandidate(from.getDrawings().filter(value=>!ids.includes(value.logicalId)),[...fromSession.getRecoveries().filter(r=>r.id!==record.id),record])}
          catch(error){if(error instanceof DrawingStoreError&&['DRAWING_CONFLICT','DRAWING_INVALID_DOCUMENT'].includes(error.code)&&toLease.isCurrent())for(const value of documents)to.transferRecord(value.logicalId,null,toLease.token);throw error}
        }
        assertBinding();if(!fromLease.isCurrent()||!toLease.isCurrent())throw Error('转移期间文档已关闭，请按原目标引用核对')
        for(const value of documents){if(toSession)toSession.applyTransferred(value.logicalId,value,toLease.token);else to.transferRecord(value.logicalId,value,toLease.token);if(fromSession)fromSession.applyTransferred(value.logicalId,null,fromLease.token);else from.transferRecord(value.logicalId,null,fromLease.token)}
        if(fromSession?.scope==='workspace')fromSession.markDirty();if(toSession?.scope==='workspace')toSession.markDirty()
      }finally{toLease?.release();fromLease.release()}
}
/** Routes commands to the existing writer of each document. No replicated content cache. */
export class DrawingCoordinator {
  private sessions:Partial<Record<'workspace'|'host',DrawingSession>>={}
  private unsubscribers:Array<()=>void>=[]
  private projected=new Set<string>()
  private retainedReferences:DrawingSharedReference[]=[]
  private errors:Record<string,string>={}
  private scope:DrawingScope='chart'
  private disposed=false
  private bindingEpoch=0
  private origin:'user'|'history'|'projection'='projection'
  reason='请等待行情与共享价格口径确认'
  constructor(readonly local:DrawingHistory,private options:{project:(id:string,value:DrawingSnapshot|null)=>void;changed:()=>void;saveAs?:(session:DrawingSession,identity:DrawingSession['identity'])=>Promise<DrawingSession>;owns?:(id:string)=>boolean;validate:(value:DrawingSnapshot)=>void}){}
  bind(workspace?:DrawingSession,host?:DrawingSession):void {
    if(workspace&&host){const ids=new Set(workspace.history.getDrawingIds());if(host.history.getDrawingIds().some(id=>ids.has(id)))throw Error('工作台与宿主共享文档含同 ID 绘图，请先核对未完成迁移')}
    this.detach();this.sessions={workspace,host};this.reason=workspace||host?'':'宿主未启用绘图共享'
    for(const session of this.list())this.unsubscribers.push(session.subscribe((origin,ids)=>{this.origin=origin;if(session.scope==='host'&&origin!=='projection')this.retainedReferences=this.retainedReferences.filter(r=>!ids.includes(r.logicalId)||!!session.history.getDrawing(r.logicalId));this.project(ids)}))
    this.project()
  }
  detach(reason='共享上下文正在切换'):void{
    ++this.bindingEpoch
    for(const unsubscribe of this.unsubscribers)unsubscribe();this.unsubscribers=[]
    for(const id of this.projected)if(this.options.owns?.(id)??true)this.options.project(id,null)
    this.projected.clear();this.retainedReferences=[];this.sessions={};this.scope='chart';this.reason=reason;this.options.changed()
  }
  private list():DrawingSession[]{return [...new Set(Object.values(this.sessions).filter((v):v is DrawingSession=>!!v))]}
  getOrigin(){return this.origin}
  getScope():DrawingScope{return this.scope}
  setScope(scope:DrawingScope):void{const state=this.state();if(scope!==this.scope&&(state.pending||state.uncertainLogicalIds.length))throw Error('绘图或迁移尚未确认，不能切换作用域');if(scope!=='chart'&&!this.sessions[scope])throw Error(this.reason||'该共享作用域尚未启用');this.scope=scope;this.options.changed()}
  getSession(scope:'workspace'|'host'):DrawingSession{const session=this.sessions[scope];if(!session)throw Error(this.reason||'共享会话尚未就绪');return session}
  scopeOf(history:DrawingHistory):DrawingScope|undefined{return history===this.local?'chart':this.list().find(session=>session.history===history)?.scope}
  getBindingEpoch():number{return this.bindingEpoch}
  assertWritable(history:DrawingHistory):void{
    const scope=this.scopeOf(history)
    if(scope===undefined)throw Error('绘图会话已解绑，请在当前上下文重试')
    if(scope!=='chart'&&['loading','uncertain'].includes(this.getSession(scope).getState().status))throw Error('共享存储尚未确认，请先刷新核对')
  }
  getSharing(){return {canSaveAs:!!this.options.saveAs,workspace:this.sessions.workspace?.getState(),host:this.sessions.host?.getState(),reason:this.reason||undefined}}
  hasSharedDrawings():boolean{return this.list().some(session=>session.history.getDrawingIds().length>0)}
  getDrawings():DrawingSnapshot[]{return [...this.local.getDrawings(),...this.list().flatMap(s=>s.history.getDrawings()).filter(d=>!this.local.getDrawing(d.logicalId))]}
  /** Shared values project onto each chart's main price axis, never an engine instance ID. */
  prepare(value:DrawingSnapshot):DrawingSnapshot{if(!value.presentation?.scope||value.presentation.scope==='chart')return value;const prepared=copy(value);delete prepared.yAxisId;return prepared}
  getDrawing(id:string):DrawingSnapshot|undefined{return this.local.getDrawing(id)??this.list().map(s=>s.history.getDrawing(id)).find(Boolean)}
  history(ids:string[]=[],write=false):DrawingHistory {
    const owners=new Set(ids.map(id=>{if(this.local.getDrawing(id))return this.local;const session=this.list().find(s=>s.history.getDrawing(id));if(!session)throw Error('绘图不存在，请刷新对象列表');return session.history}))
    if(owners.size>1)throw Error('所选绘图属于不同会话，请按作用域分别操作')
    const history=owners.values().next().value??(this.scope==='chart'?this.local:this.getSession(this.scope).history)
    const session=this.list().find(s=>s.history===history)
    if(write)this.assertWritable(history)
    return history
  }
  state(ids:string[]=[]):DrawingHistoryState{
    const states=[this.local,...this.list().map(s=>s.history)].map(h=>h.getState())
    let active:DrawingHistoryState
    try{active=this.history(ids).getState()}catch{active={pending:0,canUndo:false,canRedo:false,uncertainLogicalIds:[]}}
    const migrations=this.getDrawings().filter(d=>d.migration).map(d=>d.logicalId),unknown=this.list().filter(s=>s.getState().status==='uncertain')
    return {...active,pending:states.reduce((n,s)=>n+s.pending,0),uncertainLogicalIds:[...new Set([...states.flatMap(s=>s.uncertainLogicalIds),...migrations,...unknown.flatMap(s=>s.history.getDrawingIds().length?s.history.getDrawingIds():[`shared:${s.getState().documentId}`])])],projectionErrors:Object.assign({},...states.map(s=>s.projectionErrors),this.errors)}
  }
  project(changedIds?:string[]):void {
    if(this.disposed)return
    if(changedIds?.length===0){this.options.changed();return}
    const candidates=new Set(changedIds??[...this.projected,...this.list().flatMap(s=>s.history.getDrawingIds())])
    for(const id of candidates){
      const drawing=this.list().map(s=>s.history.getDrawing(id)).find(Boolean)
      if(!drawing){if(this.projected.has(id)&&(this.options.owns?.(id)??true)&&!this.local.getDrawing(id))this.options.project(id,null);this.projected.delete(id);delete this.errors[id];continue}
      try{
        if(this.local.getDrawing(id))throw Error('共享绘图 ID 与本图冲突，请核对未完成转移')
        this.options.validate(drawing);this.options.project(id,drawing);this.projected.add(id);delete this.errors[id]
      }catch(error){this.errors[id]=error instanceof Error?error.message:String(error);if(!(this.options.owns?.(id)??this.projected.has(id)))this.projected.delete(id)}
    }
this.options.changed()
  }
  validate(value:DrawingSnapshot):void{this.options.validate(value);if(value.presentation?.scope&&value.presentation.scope!=='chart')this.getSession(value.presentation.scope).validate(value)}
  async transfer(ids:string[],scope:DrawingScope):Promise<void>{
    if(!ids.length||new Set(ids).size!==ids.length)throw Error('请选择不同的绘图对象')
    const binding=this.bindingEpoch
    const originals=ids.map(id=>{const value=this.getDrawing(id);if(!value)throw Error('绘图不存在');if(value.owner!=='local'||value.overlay.lock)throw Error('后端标注或锁定对象不能转移');if(value.migration){const target=scope==='host'?this.getSession('host'):undefined,reference=value.migration.target;if(!target||target.getState().documentId!==reference.documentId||JSON.stringify(target.identity)!==JSON.stringify(reference.identity))throw Error('存在未完成迁移，只能核对并完成原固定目标，不能改道')}delete value.migration;return value})
    const source=this.history(ids,true),target=scope==='chart'?this.local:this.getSession(scope).history
    if(source===target)return
    const values=originals.map(original=>{let value=copy(original);delete value.migration;value.presentation={...value.presentation,scope};delete value.presentation.groupId;delete value.presentation.groupName;value=this.prepare(value);this.validate(value);return value})
    const sessionOf=(history:DrawingHistory)=>this.list().find(session=>session.history===history)
    const sourceSession=sessionOf(source),targetSession=sessionOf(target)
    const assertBinding=()=>{if(this.disposed||this.bindingEpoch!==binding)throw Error('共享绑定已改变，原迁移责任已保留，请回到原身份核对')}
    try{await moveDrawingDocuments(source,target,values,ids,sourceSession,targetSession,assertBinding)}finally{if(this.currentBinding(binding))this.project()}
    this.recordTransfer(source,target,originals,values,ids,sourceSession,targetSession,binding)
    if(sourceSession?.scope==='host')this.retainedReferences=this.retainedReferences.filter(r=>!ids.includes(r.logicalId))
    this.scope=scope;this.project();this.options.changed()
  }
  private recordTransfer(source:DrawingHistory,target:DrawingHistory,originals:DrawingSnapshot[],values:DrawingSnapshot[],ids:string[],sourceSession:DrawingSession|undefined,targetSession:DrawingSession|undefined,binding:number):void{
    const sourceRef=new WeakRef(source),targetRef=new WeakRef(target),sourceSessionRef=sourceSession?new WeakRef(sourceSession):undefined,targetSessionRef=targetSession?new WeakRef(targetSession):undefined
    const sourceGeneration=source.getDocumentGeneration(),targetGeneration=target.getDocumentGeneration(),coordinatorRef=source===this.local||target===this.local?new WeakRef(this):undefined
    const available=()=>!!sourceRef.deref()?.isAvailable(sourceGeneration)&&!!targetRef.deref()?.isAvailable(targetGeneration)&&(!coordinatorRef||coordinatorRef.deref()?.currentBinding(binding)===true)
    const check=()=>{if(!available())throw Error('原绘图文档已关闭或替换，对应转移历史已失效')}
    const projectionRef=new WeakRef(this)
    const run=async(undo:boolean)=>{check();const from=(undo?targetRef:sourceRef).deref()!,to=(undo?sourceRef:targetRef).deref()!;try{await moveDrawingDocuments(from,to,undo?originals:values,ids,(undo?targetSessionRef:sourceSessionRef)?.deref(),(undo?sourceSessionRef:targetSessionRef)?.deref(),check,targetRef.deref())}finally{const coordinator=projectionRef.deref();if(coordinator?.currentBinding(binding))coordinator.project()}}
    target.recordOperation({ids:[...ids],available,undo:()=>run(true),redo:()=>run(false)})
  }
  async saveAs():Promise<void>{
    if(!this.options.saveAs)throw Error('宿主尚未提供另存文档 ID，请先配置创建目标')
    const host=this.getSession('host'),source=host.capture(),epoch=this.bindingEpoch,workspace=this.sessions.workspace
    const target=await this.options.saveAs(host,copy(host.identity))
    if(!this.currentBinding(epoch))throw Error('另存期间共享身份已改变，原草稿已保留')
    target.history.reconcile('local',source.drawings)
    // Switch to the fixed new target before the write so an unknown response remains actionable.
    this.bind(workspace,target);this.scope='host'
    await target.save()
  }
  async recover(id:string,scope:DrawingScope):Promise<void>{
    const host=this.getSession('host'),record=host.getRecovery(id)
    if(!record||record.scope!==scope)throw Error('恢复记录不存在或目标作用域不匹配')
    if(host.getState().status!=='saved')throw Error('请先保存或刷新原共享文档，确认原对象已经移出')
    if(record.drawings.some(value=>host.history.getDrawing(value.logicalId)))throw Error('原宿主文档已重新拥有该对象，不能复制恢复')
    const destination=scope==='chart'?this.local:this.getSession(scope).history,epoch=this.bindingEpoch,ids=record.drawings.map(value=>value.logicalId)
    let needsHistory=false
    const lease=destination.beginRestore()
    try{
      for(const value of record.drawings){
        const existing=destination.getDrawing(value.logicalId)
        if(existing?.migration){const migration=existing.migration;if(migration.direction!=='from-host'||migration.target.documentId!==host.getState().documentId||migration.target.namespace!==host.identity.namespace||JSON.stringify(migration.target.identity)!==JSON.stringify(host.identity)||migration.target.logicalId!==value.logicalId)throw Error('目标暂存不属于这次原迁移，恢复记录已保留');needsHistory=true}
        else if(existing&&JSON.stringify(existing)!==JSON.stringify(value))throw Error('目标已有不同内容，恢复原件已保留')
        else if(!existing)needsHistory=true
        this.validate(value)
      }
      destination.preflightTransfer(record.drawings)
      for(const value of record.drawings){const existing=destination.getDrawing(value.logicalId);if(!existing||existing.migration)destination.transferRecord(value.logicalId,value,lease.token)}
      if(!this.currentBinding(epoch))throw Error('共享上下文已改变，恢复记录已保留')
      if(needsHistory)this.recordTransfer(host.history,destination,record.originals,record.drawings,ids,host,scope==='workspace'?this.getSession(scope):undefined,epoch)
    // The target and its undo operation are confirmed before cleanup can become uncertain.
    await host.persistCandidate(host.history.getDrawings(),host.getRecoveries().filter(r=>r.id!==id))
      if(!this.currentBinding(epoch))throw Error('恢复记录清理期间共享绑定已改变，后继上下文不会被修改')
      this.scope=scope;this.project()
    }finally{lease.release();if(this.currentBinding(epoch))this.project()}
  }
  currentBinding(epoch:number):boolean{return !this.disposed&&this.bindingEpoch===epoch}
  checkpointBinding(){return {workspace:this.sessions.workspace,host:this.sessions.host,references:copy(this.retainedReferences),scope:this.scope,reason:this.reason}}
  rollbackBinding(value:ReturnType<DrawingCoordinator['checkpointBinding']>):void{this.bind(value.workspace,value.host);this.retainedReferences=copy(value.references);this.scope=value.scope;this.reason=value.reason;this.options.changed()}
  acceptReferences(references:DrawingSharedReference[]):void{this.retainedReferences=copy(references);this.options.changed()}
  references():DrawingSharedReference[]{
    const session=this.sessions.host;if(!session)return copy(this.retainedReferences)
    const state=session.getState();if(['uncertain','saving','loading'].includes(state.status))throw Error('共享存储尚未确认，不能保存引用')
    const values=new Map(this.retainedReferences.map(reference=>[reference.logicalId,reference]))
    for(const value of session.history.getDrawings())values.set(value.logicalId,{namespace:session.identity.namespace,documentId:state.documentId!,logicalId:value.logicalId,identity:copy(session.identity)})
    return copy([...values.values()])
  }
  dispose():void{this.detach();this.disposed=true}
}
