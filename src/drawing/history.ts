import i18n from '../i18n'
import type {DrawingChange,DrawingCommitResult,DrawingHistoryState,DrawingOwner,DrawingSnapshot,DrawingSource,DrawingCommandResult,DrawingItemResult} from './types'

interface Options {
  locale?:()=>string
  validate?:(snapshot:DrawingSnapshot)=>void
  commit?:(change:DrawingChange)=>Promise<DrawingCommitResult>
  apply:(id:string,snapshot:DrawingSnapshot|null)=>DrawingSnapshot|null
  context:()=>DrawingChange['context']
  onChange?:(state:DrawingHistoryState)=>void
  onConfirmed?:(change:DrawingChange)=>void
}
type Entry={logicalId:string;before:DrawingSnapshot|null;after:DrawingSnapshot|null}
type Transaction={changes:Entry[]}
type BatchRequest={kind:DrawingChange['kind'];logicalId:string;after:DrawingSnapshot|null}
export interface DrawingCheckpoint {drawings:DrawingSnapshot[];past:Transaction[];future:Transaction[]}
const content=(value:DrawingSnapshot|null)=>{if(!value)return null;const {presentation,...rest}=value;return rest}
const copy=<T>(value:T):T=>JSON.parse(JSON.stringify(value))
const ordered=(value:any):any=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,ordered(v)])):value
const same=(a:unknown,b:unknown)=>JSON.stringify(ordered(a))===JSON.stringify(ordered(b))
const abort=(locale='zh-CN')=>new DOMException(i18n('drawing_context_changed',locale),'AbortError')

/** History advances only after an explicit confirmation, never on a visual preview. */
export class DrawingHistory {
  private options:Options
  private drawings=new Map<string,DrawingSnapshot>()
  private past:Transaction[]=[]
  private future:Transaction[]=[]
  private uncertain=new Map<string,DrawingOwner>()
  private projectionErrors=new Map<string,string>()
  private lastResult:DrawingCommandResult={status:'completed',items:[]}
  private pending=0
  private error:string|undefined
  private generation=0
  private disposed=false
  private restoreToken:symbol|undefined
  private tail:Promise<unknown>=Promise.resolve()
  private text(key:string){return i18n(key,this.options.locale?.()??'zh-CN')}
  constructor(options:Options){this.options=options}
  getState():DrawingHistoryState{return {pending:this.pending+(this.restoreToken?1:0),canUndo:this.past.length>0,canRedo:this.future.length>0,error:this.error,uncertainLogicalIds:[...this.uncertain.keys()],projectionErrors:Object.fromEntries(this.projectionErrors)}}
  getDrawings():DrawingSnapshot[]{return [...this.drawings.values()].map(copy)}
  getDrawing(id:string):DrawingSnapshot|undefined{const value=this.drawings.get(id);return value?copy(value):undefined}
  getDrawingIds():string[]{return [...this.drawings.keys()]}
  reproject():void{for(const value of this.getDrawings())this.apply(value.logicalId,value);this.emit()}
  private emit(){if(!this.disposed)this.options.onChange?.(this.getState())}
  private dropHistory(id:string){
    for(const stack of [this.past,this.future]){for(const entry of stack)entry.changes=entry.changes.filter(e=>e.logicalId!==id||same(content(e.before),content(e.after)));for(let i=stack.length-1;i>=0;i--)if(!stack[i].changes.length)stack.splice(i,1)}
  }
  getLastResult():DrawingCommandResult{return copy(this.lastResult)}
  checkpoint():DrawingCheckpoint {
    if(this.pending||this.uncertain.size||this.restoreToken)throw Error('绘图提交尚未确认，不能替换文档')
    return copy({drawings:this.getDrawings(),past:this.past,future:this.future})
  }
  beginRestore():{token:symbol;isCurrent:()=>boolean;release:()=>void} {
    if(this.pending||this.uncertain.size||this.restoreToken)throw Error('绘图提交或恢复尚未确认')
    const token=Symbol('drawing-restore');this.restoreToken=token;this.emit()
    return {token,isCurrent:()=>!this.disposed&&this.restoreToken===token,release:()=>{if(this.restoreToken===token){this.restoreToken=undefined;this.emit()}}}
  }
  private assertRestore(token?:symbol):void{if(this.restoreToken&&this.restoreToken!==token)throw Error('绘图布局正在恢复，请完成后重试')}
  rollback(checkpoint:DrawingCheckpoint,token?:symbol):void {
    this.assertRestore(token)
    if(this.pending||this.uncertain.size)throw Error('绘图提交尚未确认，不能回滚文档')
    const saved=copy(checkpoint),ids=new Set(saved.drawings.map(d=>d.logicalId))
    for(const id of this.drawings.keys())if(!ids.has(id))this.apply(id,null)
    for(const drawing of saved.drawings)this.apply(drawing.logicalId,drawing)
    this.past=saved.past;this.future=saved.future;this.emit()
  }
  private finish(items:DrawingItemResult[]):DrawingCommandResult {
    const confirmed=items.filter(i=>i.status==='confirmed').length
    this.lastResult={status:items.some(i=>i.status==='uncertain')?'uncertain':items.some(i=>i.status!=='confirmed')?(confirmed?'partial':'rejected'):'completed',items:copy(items)}
    return this.getLastResult()
  }
  private notify(entry:Entry,source:DrawingSource,context:DrawingChange['context']){
    if(same(content(entry.before),content(entry.after)))return
    try{this.options.onConfirmed?.({...copy(entry),kind:entry.before?(entry.after?'update':'delete'):'create',source,context})}
    catch(reason){this.error=`${this.text('drawing_notification_failed')}${reason instanceof Error?reason.message:String(reason)}`;this.emit()}
  }
  private apply(id:string,state:DrawingSnapshot|null):DrawingSnapshot|null {
    // The confirmed document is authoritative even if its current view cannot be rendered.
    const actual=state?copy({...state,logicalId:id,overlay:{...state.overlay,id}}):null
    if(actual)this.drawings.set(id,actual);else this.drawings.delete(id)
    try{this.options.apply(id,copy(actual));this.projectionErrors.delete(id)}
    catch(error){this.projectionErrors.set(id,error instanceof Error?error.message:String(error))}
    return copy(actual)
  }
  private enqueue<T>(task:(generation:number)=>Promise<T>):Promise<T>{
    if(this.disposed)return Promise.reject(abort(this.options.locale?.()??'zh-CN'))
    if(this.restoreToken)return Promise.reject(Error('绘图布局正在恢复，请完成后重试'))
    const generation=this.generation;this.pending++;this.emit()
    const run=this.tail.catch(()=>{}).then(()=>{if(this.disposed||generation!==this.generation)throw abort(this.options.locale?.()??'zh-CN');return task(generation)})
    this.tail=run
    return run.finally(()=>{if(generation===this.generation){this.pending--;this.emit()}})
  }
  private async perform(id:string,after:DrawingSnapshot|null,source:DrawingSource,generation:number,context:DrawingChange['context']):Promise<{result:DrawingCommitResult;before:DrawingSnapshot|null;after:DrawingSnapshot|null}>{
    if(after)this.options.validate?.(after)
    const before=copy(this.drawings.get(id)??null)
    if(this.uncertain.has(id)){const result:DrawingCommitResult={status:'rejected',message:this.text('drawing_message_1')};this.apply(id,before);this.error=result.message;this.emit();return {result,before,after:before}}
    const kind=before?(after?'update':'delete'):'create'
    if(!before&&!after)return {result:{status:'confirmed',snapshot:null},before,after:null}
    if(before&&after&&before.owner!==after.owner)throw Error(this.text('drawing_message_2'))
    const change:DrawingChange={kind,logicalId:id,before,after:copy(after),source,context:copy(context)}
    let result:DrawingCommitResult
    try{
      result=!same(content(before),content(after))&&(before??after)!.owner==='backend'
        ?this.options.commit?await this.options.commit(change):{status:'rejected',message:this.text('drawing_message_3')}
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
    const actual=this.apply(id,result.snapshot?{...after,...result.snapshot,presentation:after?.presentation}:null)
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
  submitBatch(requests:BatchRequest[]|(()=>BatchRequest[]),source:DrawingSource):Promise<DrawingCommandResult>{
    const captured=typeof requests==='function'?requests:copy(requests),context=copy(this.options.context())
    return this.enqueue(async generation=>{
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
      let stopped=false
      for(const request of requested){
        if(stopped){items.push({logicalId:request.logicalId,status:'not-attempted'});continue}
        let outcome:Awaited<ReturnType<DrawingHistory['perform']>>
        try{outcome=await this.perform(request.logicalId,request.after,source,generation,context)}catch(error){
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
      }
      return this.finish(items)
    })
  }
  private travel(direction:'undo'|'redo'):Promise<DrawingCommitResult|undefined>{
    const context=copy(this.options.context())
    return this.enqueue(async generation=>{
      const from=direction==='undo'?this.past:this.future,to=direction==='undo'?this.future:this.past
      const transaction=from.at(-1);if(!transaction){this.finish([]);return}
      const entries=direction==='undo'?[...transaction.changes].reverse():[...transaction.changes]
      const completed:Transaction={changes:[]},items:DrawingItemResult[]=[]
      let last:DrawingCommitResult|undefined,stopped=false
      for(const entry of entries){
        if(stopped){items.push({logicalId:entry.logicalId,status:'not-attempted'});continue}
        let target=direction==='undo'?entry.before:entry.after
        if(same(content(entry.before),content(entry.after))){const current=this.drawings.get(entry.logicalId);if(!current){this.dropHistory(entry.logicalId);continue}target={...current,presentation:target?.presentation}}
        let outcome:Awaited<ReturnType<DrawingHistory['perform']>>
        try{outcome=await this.perform(entry.logicalId,target,'history',generation,context)}catch(error){
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
      }
      if(!transaction.changes.length){const index=from.indexOf(transaction);if(index>=0)from.splice(index,1)}
      this.finish(items);this.emit();return last
    })
  }
  undo():Promise<DrawingCommitResult|undefined>{return this.travel('undo')}
  redo():Promise<DrawingCommitResult|undefined>{return this.travel('redo')}
  /** Canonical external reads do not issue CRUD or discard unchanged objects' history. */
  reconcile(owner:DrawingOwner,values:DrawingSnapshot[],token?:symbol):void {
    this.assertRestore(token)
    if(this.pending)throw Error(this.text('drawing_message_7'))
    const ids=new Set(values.map(v=>v.logicalId))
    if(ids.size!==values.length||values.some(v=>v.owner!==owner))throw Error(this.text('drawing_message_8'))
    if(values.some(v=>this.drawings.has(v.logicalId)&&this.drawings.get(v.logicalId)!.owner!==owner))throw Error(this.text('drawing_message_9'))
    for(const value of values)this.options.validate?.(value)
    for(const current of this.getDrawings())if(current.owner===owner&&!ids.has(current.logicalId)){this.apply(current.logicalId,null);this.dropHistory(current.logicalId);this.uncertain.delete(current.logicalId)}
    for(const value of values){const old=this.drawings.get(value.logicalId),actual=this.apply(value.logicalId,{...value,presentation:value.presentation??old?.presentation});if(!same(content(old??null),content(actual)))this.dropHistory(value.logicalId);this.uncertain.delete(value.logicalId)}
    for(const [id,uncertainOwner] of this.uncertain)if(uncertainOwner===owner)this.uncertain.delete(id)
    if(!this.uncertain.size)this.error=undefined;this.emit()
  }
  reset(clearDrawings=false,token?:symbol):void {
    if(clearDrawings)this.restoreToken=undefined
    else this.assertRestore(token)
    this.generation++;this.pending=0;this.tail=Promise.resolve();this.past=[];this.future=[];this.uncertain.clear();this.projectionErrors.clear();this.error=undefined
    if(clearDrawings){for(const id of this.drawings.keys())this.options.apply(id,null);this.drawings.clear()}
    this.emit()
  }
  dispose():void{this.disposed=true;this.restoreToken=undefined;this.reset();this.drawings.clear()}
}
