import {createOpaqueId} from '../ids'
import i18n from '../i18n'
import {yieldTask} from '../core/yieldTask'
import {copyCanonical} from '../core/copyCanonical'
import type {DrawingChange,DrawingCommitResult,DrawingHistoryState,DrawingOwner,DrawingSnapshot,DrawingSource,DrawingCommandResult,DrawingItemResult} from './types'

interface Options {
  locale?:()=>string
  validate?:(snapshot:DrawingSnapshot)=>void
  validateTransfer?:(values:DrawingSnapshot[])=>void
  commit?:(change:DrawingChange)=>Promise<DrawingCommitResult>
  apply:(id:string,snapshot:DrawingSnapshot|null)=>DrawingSnapshot|null
  context:()=>DrawingChange['context']
  onChange?:(state:DrawingHistoryState)=>void
  onConfirmed?:(change:DrawingChange)=>void
}
type Entry={logicalId:string;before:DrawingSnapshot|null;after:DrawingSnapshot|null}
type Transaction={changes:Entry[];operation?:string}
type BatchRequest={kind:DrawingChange['kind'];logicalId:string;after:DrawingSnapshot|null}
export type DrawingWriteGuard=(before:DrawingSnapshot|null,after:DrawingSnapshot|null)=>void
type Operation={ids?:string[];undo:()=>Promise<void>;redo:()=>Promise<void>;available?:()=>boolean;retain?:()=>boolean}
export interface DrawingCheckpoint {documentGeneration?:number;operations?:Map<string,Operation>;drawings:DrawingSnapshot[];past:Transaction[];future:Transaction[]}
const content=(value:DrawingSnapshot|null)=>{if(!value)return null;const {presentation,...rest}=value;return rest}
const copy=<T>(value:T):T=>JSON.parse(JSON.stringify(value))
/** Compare values after the JSON boundary without sorting or serializing large point arrays. */
const same=(a:any,b:any):boolean=>{
  if(a===b)return true
  if(a===null||b===null||typeof a!=='object'||typeof b!=='object')return false
  if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((value,index)=>same(value,b[index]))
  const keys=Object.keys(a),other=Object.keys(b)
  if(keys.length!==other.length)return false
  // Style and presentation changes should not traverse unchanged brush geometry first.
  for(const key of ['presentation','styles','overlay'])if((key in a||key in b)&&(!Object.hasOwn(a,key)||!Object.hasOwn(b,key)||!same(a[key],b[key])))return false
  return keys.every(key=>Object.hasOwn(b,key)&&(['presentation','styles','overlay'].includes(key)||same(a[key],b[key])))
}
const abort=(locale='zh-CN')=>new DOMException(i18n('drawing_context_changed',locale),'AbortError')

/** History advances only after an explicit confirmation, never on a visual preview. */
export class DrawingHistory {
  private options:Options
  private operations=new Map<string,Operation>()
  private executingOperation?:string
  private drawings=new Map<string,DrawingSnapshot>()
  private past:Transaction[]=[]
  private future:Transaction[]=[]
  private uncertain=new Map<string,DrawingOwner>()
  private projectionErrors=new Map<string,string>()
  private lastResult:DrawingCommandResult={status:'completed',items:[]}
  private pending=0
  private error:string|undefined
  private generation=0
  private documentGeneration=0
  private disposed=false
  private restoreToken:symbol|undefined
  private restoreReason:'layout'|'document'='document'
  private tail:Promise<unknown>=Promise.resolve()
  private localYieldToken?:symbol
  isYieldingLocalWork():boolean{return this.localYieldToken!==undefined}
  private async yieldLocalWork():Promise<void>{const token=Symbol('local-drawing-yield');this.localYieldToken=token;try{await yieldTask()}finally{if(this.localYieldToken===token)this.localYieldToken=undefined}}
  private text(key:string){return i18n(key,this.options.locale?.()??'zh-CN')}
  constructor(options:Options){this.options=options}
  getState():DrawingHistoryState{this.pruneOperations();return {pending:this.pending+(this.restoreToken?1:0),canUndo:this.past.length>0,canRedo:this.future.length>0,error:this.error,uncertainLogicalIds:[...this.uncertain.keys()],projectionErrors:Object.fromEntries(this.projectionErrors)}}
  getDrawings():DrawingSnapshot[]{return [...this.drawings.values()].map(copyCanonical)}
  getDrawing(id:string):DrawingSnapshot|undefined{const value=this.drawings.get(id);return value?copyCanonical(value):undefined}
  hasDrawing(id:string):boolean{return this.drawings.has(id)}
  getMigratingDrawingIds():string[]{return [...this.drawings.values()].filter(value=>value.migration).map(value=>value.logicalId)}
  getDrawingIds():string[]{return [...this.drawings.keys()]}
  reproject():void{for(const value of this.getDrawings())this.apply(value.logicalId,value);this.emit()}
  private emit(){if(!this.disposed)this.options.onChange?.(this.getState())}
  isAvailable(generation?:number):boolean{return !this.disposed&&(generation===undefined||!!this.restoreToken||generation===this.documentGeneration)}
  getDocumentGeneration():number{return this.documentGeneration}
  private discardOperation(id:string):void{this.operations.delete(id);for(const stack of [this.past,this.future])for(let i=stack.length-1;i>=0;i--)if(stack[i].operation===id)stack.splice(i,1)}
  private pruneOperations():void{for(const [id,operation] of this.operations)if(id!==this.executingOperation&&!operation.retain?.()&&operation.available&&!operation.available())this.discardOperation(id)}
  private dropHistory(id:string){
    for(const [key,operation] of this.operations)if(key!==this.executingOperation&&operation.ids?.includes(id))this.discardOperation(key)
    for(const stack of [this.past,this.future]){for(const entry of stack)entry.changes=entry.changes.filter(e=>e.logicalId!==id||same(content(e.before),content(e.after)));for(let i=stack.length-1;i>=0;i--)if(!stack[i].changes.length&&!stack[i].operation)stack.splice(i,1)}
  }
  /** Transfer effects remain runtime history, never part of a serialized document. */
  recordOperation(operation:Operation):void {
    const id=createOpaqueId();this.operations.set(id,operation);this.past.push({changes:[],operation:id});this.future=[];this.emit()
  }
  transferGuard(active=false):ReturnType<DrawingHistory['beginRestore']>{
    if(this.disposed||this.restoreToken||this.uncertain.size||this.pending>(active?1:0))throw Error('绘图正在提交或已关闭，不能转移')
    const token=Symbol('drawing-transfer');this.restoreToken=token;this.restoreReason='document';this.emit()
    return {token,isCurrent:()=>!this.disposed&&this.restoreToken===token,release:()=>{if(this.restoreToken===token){this.restoreToken=undefined;this.emit()}}}
  }
  preflightTransfer(values:DrawingSnapshot[]):void{for(const value of values)this.options.validate?.(value);this.options.validateTransfer?.(values)}
  setTransferIntent(id:string,migration:DrawingSnapshot['migration'],token:symbol):void {
    this.assertRestore(token)
    if(this.disposed||this.restoreToken!==token)throw Error('绘图转移已失效')
    const current=this.drawings.get(id);if(!current||current.owner!=='local')throw Error('转移原对象不存在')
    const value=copy(current);if(migration)value.migration=copy(migration);else delete value.migration
    this.apply(id,value);this.emit()
  }
  transferRecord(id:string,value:DrawingSnapshot|null,token:symbol):void {
    this.assertRestore(token)
    if(this.disposed||this.restoreToken!==token)throw Error('绘图转移已失效')
    if(value){if(value.owner!=='local')throw Error('后端标注不能转移归属');this.options.validate?.(value)}
    for(const [key,operation] of this.operations)if(key!==this.executingOperation&&operation.ids?.includes(id))this.discardOperation(key)
    // Leaving a document invalidates every old edit, including presentation edits.
    for(const stack of [this.past,this.future])for(const entry of stack)entry.changes=entry.changes.filter(e=>e.logicalId!==id)
    for(const stack of [this.past,this.future])for(let i=stack.length-1;i>=0;i--)if(!stack[i].changes.length&&!stack[i].operation)stack.splice(i,1)
    this.apply(id,value);this.emit()
  }
  getLastResult():DrawingCommandResult{return copy(this.lastResult)}
  checkpoint():DrawingCheckpoint {
    if(this.pending||this.uncertain.size||this.restoreToken)throw Error('绘图提交尚未确认，不能替换文档')
    return {...copy({drawings:this.getDrawings(),past:this.past,future:this.future}),operations:new Map(this.operations),documentGeneration:this.documentGeneration}
  }
  isLayoutRestoring():boolean{return !!this.restoreToken&&this.restoreReason==='layout'}
  beginRestore(reason:'layout'|'document'='document'):{token:symbol;isCurrent:()=>boolean;release:()=>void} {
    if(this.pending||this.uncertain.size||this.restoreToken)throw Error('绘图提交或恢复尚未确认')
    const token=Symbol('drawing-restore');this.restoreToken=token;this.restoreReason=reason;this.emit()
    return {token,isCurrent:()=>!this.disposed&&this.restoreToken===token,release:()=>{if(this.restoreToken===token){this.restoreToken=undefined;this.emit()}}}
  }
  private assertRestore(token?:symbol):void{if(this.restoreToken&&this.restoreToken!==token)throw Error('绘图布局正在恢复，请完成后重试')}
  rollback(checkpoint:DrawingCheckpoint,token?:symbol):void {
    this.assertRestore(token)
    if(this.pending||this.uncertain.size)throw Error('绘图提交尚未确认，不能回滚文档')
    const {operations,documentGeneration,...serialized}=checkpoint,saved=copy(serialized),ids=new Set(saved.drawings.map(d=>d.logicalId))
    for(const id of this.drawings.keys())if(!ids.has(id))this.apply(id,null)
    for(const drawing of saved.drawings)this.apply(drawing.logicalId,drawing)
    this.past=saved.past;this.future=saved.future;this.operations=new Map(operations??[]);this.documentGeneration=documentGeneration??this.documentGeneration;this.emit()
  }
  private finish(items:DrawingItemResult[]):DrawingCommandResult {
    const confirmed=items.filter(i=>i.status==='confirmed').length
    this.lastResult={status:items.some(i=>i.status==='uncertain')?'uncertain':items.some(i=>i.status!=='confirmed')?(confirmed?'partial':'rejected'):'completed',items:copy(items)}
    return this.getLastResult()
  }
  private notify(entry:Entry,source:DrawingSource,context:DrawingChange['context']){
    if(same(content(entry.before),content(entry.after)))return
    try{this.options.onConfirmed?.({...copyCanonical(entry),kind:entry.before?(entry.after?'update':'delete'):'create',source,context})}
    catch(reason){this.error=`${this.text('drawing_notification_failed')}${reason instanceof Error?reason.message:String(reason)}`;this.emit()}
  }
  private apply(id:string,state:DrawingSnapshot|null,canonical=false):DrawingSnapshot|null {
    // The confirmed document is authoritative even if its current view cannot be rendered.
    const document=state?{...state,logicalId:id,overlay:{...state.overlay,id}}:null
    const actual=canonical?copyCanonical(document):copy(document)
    if(actual)this.drawings.set(id,actual);else this.drawings.delete(id)
    try{this.options.apply(id,copyCanonical(actual));this.projectionErrors.delete(id)}
    catch(error){this.projectionErrors.set(id,error instanceof Error?error.message:String(error))}
    return copyCanonical(actual)
  }
  private enqueue<T>(task:(generation:number)=>Promise<T>):Promise<T>{
    if(this.disposed)return Promise.reject(abort(this.options.locale?.()??'zh-CN'))
    if(this.restoreToken)return Promise.reject(Error('绘图布局正在恢复，请完成后重试'))
    const generation=this.generation;this.pending++;this.emit()
    const run=this.tail.catch(()=>{}).then(()=>{if(this.disposed||generation!==this.generation)throw abort(this.options.locale?.()??'zh-CN');return task(generation)})
    this.tail=run
    return run.finally(()=>{if(generation===this.generation){this.pending--;this.emit()}})
  }
  private async perform(id:string,after:DrawingSnapshot|null,source:DrawingSource,generation:number,context:DrawingChange['context'],guard?:DrawingWriteGuard):Promise<{result:DrawingCommitResult;before:DrawingSnapshot|null;after:DrawingSnapshot|null}>{
    const before=copyCanonical(this.drawings.get(id)??null)
    // A caller's current policy is checked before a write, never after its confirmation.
    guard?.(before,after)
    if(after)this.options.validate?.(after)
    if(this.uncertain.has(id)){const result:DrawingCommitResult={status:'rejected',message:this.text('drawing_message_1')};this.apply(id,before);this.error=result.message;this.emit();return {result,before,after:before}}
    if(before?.migration)throw Error('绘图转移结果待核对，请先完成原目标转移')
    const kind=before?(after?'update':'delete'):'create'
    if(!before&&!after)return {result:{status:'confirmed',snapshot:null},before,after:null}
    if(before&&after&&before.owner!==after.owner)throw Error(this.text('drawing_message_2'))
    let result:DrawingCommitResult
    const external=(before??after)!.owner==='backend'&&!same(content(before),content(after))
    try{
      result=external
        ?this.options.commit?await this.options.commit({kind,logicalId:id,before,after:copy(after),source,context:copy(context)}):{status:'rejected',message:this.text('drawing_message_3')}
        :{status:'confirmed',snapshot:after}
    }catch(reason){result={status:'uncertain',message:`${this.text('drawing_submission_uncertain')}${reason instanceof Error?reason.message:String(reason)}`}}
    if(this.disposed||generation!==this.generation)throw abort(this.options.locale?.()??'zh-CN')
    if(result.status==='confirmed'&&result.snapshot?.owner==='backend'&&!result.snapshot.backendId)result={status:'uncertain',message:this.text('drawing_message_4')}
    if(result.status==='rejected'){
      this.apply(id,before);this.error=result.message;this.emit();return {result,before,after:before}
    }
    if(result.status==='uncertain'){
      const state=result.snapshot===undefined?before:result.snapshot
      // Record an unknown write before rendering: a missing pane must never authorize a retry.
      this.dropHistory(id);this.uncertain.set(id,(before??after)!.owner);this.error=result.message
      try{this.apply(id,state)}finally{this.emit()}
      return {result,before,after:state}
    }
    // Local requests have already crossed submit/travel's JSON boundary. Only
    // external authority responses need another normalization at confirmation.
    const actual=external?this.apply(id,result.snapshot?{...after,...result.snapshot,presentation:after?.presentation}:null):this.apply(id,after,true)
    this.error=undefined;this.emit();return {result:{status:'confirmed',snapshot:actual},before,after:actual}
  }
  submit(kind:DrawingChange['kind'],id:string,after:DrawingSnapshot|null,source:DrawingSource):Promise<DrawingCommitResult>{
    const context=copy(this.options.context()),requested=copy(after)
    return this.enqueue(async generation=>{
      if(kind==='update'&&!this.drawings.has(id)){
        this.apply(id,null);this.error=this.text('drawing_message_5');return {status:'rejected',message:this.error}
      }
      if(kind==='create'&&this.drawings.has(id)){this.error=this.text('drawing_message_6');return {status:'rejected',message:this.error}}
      const outcome=await this.perform(id,requested,source,generation,context)
      if(outcome.result.status==='confirmed'&&!same(outcome.before,outcome.after)){
        this.past.push({changes:[{logicalId:id,before:outcome.before,after:outcome.after}]});this.future=[]
        this.notify({logicalId:id,before:outcome.before,after:outcome.after},source,context)
      }
      return outcome.result
    })
  }
  /** Preflight the complete request before the first external write. */
  submitBatch(requests:BatchRequest[]|(()=>BatchRequest[]),source:DrawingSource,guard?:DrawingWriteGuard):Promise<DrawingCommandResult>{
    const captured=typeof requests==='function'?requests:copy(requests),context=copy(this.options.context())
    return this.enqueue(async generation=>{
      const started=performance.now()
      const requested=copy(typeof captured==='function'?captured():captured)
      const seen=new Set<string>()
      for(const request of requested){
        const before=this.drawings.get(request.logicalId)
        if(seen.has(request.logicalId)||request.kind==='create'&&before||request.kind!=='create'&&!before)throw Error('批量绘图目标无效或重复')
        if(this.uncertain.has(request.logicalId))throw Error('绘图结果待确认，请刷新后重试')
        if(request.after){this.options.validate?.(request.after);if(before&&before.owner!==request.after.owner)throw Error('绘图归属不能改变')}
        seen.add(request.logicalId)
      }
      const transaction:Transaction={changes:[]},items:DrawingItemResult[]=[]
      const cooperative=requested.length>=128&&requested.every(request=>(request.after??this.drawings.get(request.logicalId))?.owner==='local')
      let stopped=false,checkpoint=started
      for(const request of requested){
        if(this.disposed||generation!==this.generation)throw abort(this.options.locale?.()??'zh-CN')
        if(stopped){items.push({logicalId:request.logicalId,status:'not-attempted'});continue}
        let outcome:Awaited<ReturnType<DrawingHistory['perform']>>
        try{outcome=await this.perform(request.logicalId,request.after,source,generation,context,guard)}catch(error){
          if(this.disposed||generation!==this.generation)throw error
          items.push({logicalId:request.logicalId,status:'rejected',message:error instanceof Error?error.message:String(error)});stopped=true;continue
        }
        items.push({logicalId:request.logicalId,status:outcome.result.status,...(outcome.result.status==='confirmed'?{}:{message:outcome.result.message})})
        if(outcome.result.status==='confirmed'){
          if(!same(outcome.before,outcome.after)){
            const entry={logicalId:request.logicalId,before:outcome.before,after:outcome.after}
            if(!transaction.changes.length){this.past.push(transaction);this.future=[]}
            transaction.changes.push(entry);this.notify(entry,source,context)
          }
        }else stopped=true
        if(!stopped&&cooperative&&request!==requested[requested.length-1]&&performance.now()-checkpoint>=128){await this.yieldLocalWork();checkpoint=performance.now()}
      }
      return this.finish(items)
    })
  }
  private travel(direction:'undo'|'redo',guard?:DrawingWriteGuard):Promise<DrawingCommitResult|undefined>{
    const context=copy(this.options.context())
    return this.enqueue(async generation=>{
      const started=performance.now()
      const from=direction==='undo'?this.past:this.future,to=direction==='undo'?this.future:this.past
      const transaction=from.at(-1);if(!transaction){this.finish([]);return}
      if(transaction.operation){
        const operation=this.operations.get(transaction.operation)
        if(!operation)throw Error('绘图转移历史不可用')
        this.executingOperation=transaction.operation
        try{await operation[direction]()}finally{this.executingOperation=undefined}
        from.splice(from.indexOf(transaction),1);to.push(transaction);this.finish([]);this.emit();return {status:'confirmed',snapshot:null}
      }
      const entries=direction==='undo'?[...transaction.changes].reverse():[...transaction.changes]
      const completed:Transaction={changes:[]},items:DrawingItemResult[]=[]
      const cooperative=entries.length>=128&&entries.every(entry=>(entry.after??entry.before)?.owner==='local')
      let last:DrawingCommitResult|undefined,stopped=false,checkpoint=started
      for(const entry of entries){
        if(this.disposed||generation!==this.generation)throw abort(this.options.locale?.()??'zh-CN')
        if(stopped){items.push({logicalId:entry.logicalId,status:'not-attempted'});continue}
        let target=direction==='undo'?entry.before:entry.after
        if(same(content(entry.before),content(entry.after))){const current=this.drawings.get(entry.logicalId);if(!current){this.dropHistory(entry.logicalId);continue}target={...current,presentation:target?.presentation}}
        let outcome:Awaited<ReturnType<DrawingHistory['perform']>>
        try{outcome=await this.perform(entry.logicalId,target,'history',generation,context,guard)}catch(error){
          if(this.disposed||generation!==this.generation)throw error
          last={status:'rejected',message:error instanceof Error?error.message:String(error)}
          items.push({logicalId:entry.logicalId,status:'rejected',message:last.message});stopped=true;continue
        }
        last=outcome.result
        items.push({logicalId:entry.logicalId,status:last.status,...(last.status==='confirmed'?{}:{message:last.message})})
        if(last.status==='confirmed'){
          // Advance each confirmed inverse immediately; a later failure must never replay it.
          transaction.changes=transaction.changes.filter(e=>e!==entry)
          const actual={logicalId:entry.logicalId,before:direction==='undo'?outcome.after:outcome.before,after:direction==='undo'?outcome.before:outcome.after}
          if(!completed.changes.length)to.push(completed)
          if(direction==='undo')completed.changes.unshift(actual);else completed.changes.push(actual)
          this.notify({logicalId:entry.logicalId,before:outcome.before,after:outcome.after},'history',context)
        }else stopped=true
        if(!stopped&&cooperative&&entry!==entries[entries.length-1]&&performance.now()-checkpoint>=128){await this.yieldLocalWork();checkpoint=performance.now()}
      }
      if(!transaction.changes.length){const index=from.indexOf(transaction);if(index>=0)from.splice(index,1)}
      this.finish(items);this.emit();return last
    })
  }
  undo(guard?:DrawingWriteGuard):Promise<DrawingCommitResult|undefined>{return this.travel('undo',guard)}
  redo(guard?:DrawingWriteGuard):Promise<DrawingCommitResult|undefined>{return this.travel('redo',guard)}
  /** Canonical external reads do not issue CRUD or discard unchanged objects' history. */
  reconcile(owner:DrawingOwner,values:DrawingSnapshot[],token?:symbol):void {
    for(const _ of this.reconcileSteps(owner,values,token)){}
  }
  /** Layout-only staging keeps the original complete preflight and owner writer. */
  async reconcileCooperatively(owner:DrawingOwner,values:DrawingSnapshot[],token:symbol,assertCurrent:()=>void):Promise<void> {
    if(owner!=='local'||this.restoreToken!==token||this.restoreReason!=='layout')throw Error('合作式绘图恢复需要当前本图布局租约')
    const steps=this.reconcileSteps(owner,copy(values),token)
    let checkpoint=performance.now()
    while(true){
      assertCurrent()
      if(this.disposed||this.restoreToken!==token)throw abort(this.options.locale?.()??'zh-CN')
      if(steps.next().done)return
      if(performance.now()-checkpoint>=32){await this.yieldLocalWork();assertCurrent();checkpoint=performance.now()}
    }
  }
  private *reconcileSteps(owner:DrawingOwner,values:DrawingSnapshot[],token?:symbol):Generator<void> {
    this.assertRestore(token)
    if(this.pending)throw Error(this.text('drawing_message_7'))
    const ids=new Set(values.map(v=>v.logicalId))
    if(ids.size!==values.length||values.some(v=>v.owner!==owner))throw Error(this.text('drawing_message_8'))
    if(values.some(v=>this.drawings.has(v.logicalId)&&this.drawings.get(v.logicalId)!.owner!==owner))throw Error(this.text('drawing_message_9'))
    for(const value of values)this.options.validate?.(value)
    for(const current of this.getDrawings())if(current.owner===owner&&!ids.has(current.logicalId)){this.apply(current.logicalId,null);this.dropHistory(current.logicalId);this.uncertain.delete(current.logicalId);yield}
    for(const value of values){const old=this.drawings.get(value.logicalId),actual=this.apply(value.logicalId,{...value,presentation:value.presentation??old?.presentation});if(!same(content(old??null),content(actual)))this.dropHistory(value.logicalId);this.uncertain.delete(value.logicalId);yield}
    for(const [id,uncertainOwner] of this.uncertain)if(uncertainOwner===owner)this.uncertain.delete(id)
    if(!this.uncertain.size)this.error=undefined;this.emit()
  }
  reset(clearDrawings=false,token?:symbol):void {
    if(clearDrawings)this.restoreToken=undefined
    else this.assertRestore(token)
    this.generation++;this.documentGeneration++;this.pending=0;this.tail=Promise.resolve();this.localYieldToken=undefined;this.past=[];this.future=[];this.operations.clear();this.uncertain.clear();this.projectionErrors.clear();this.error=undefined
    if(clearDrawings){for(const id of this.drawings.keys())this.options.apply(id,null);this.drawings.clear()}
    this.emit()
  }
  dispose():void{this.disposed=true;this.restoreToken=undefined;this.reset();this.drawings.clear()}
}
