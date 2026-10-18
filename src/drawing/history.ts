import i18n from '../i18n'
import type {DrawingChange,DrawingCommitResult,DrawingHistoryState,DrawingOwner,DrawingSnapshot,DrawingSource} from './types'

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
const copy=<T>(value:T):T=>JSON.parse(JSON.stringify(value))
const ordered=(value:any):any=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,ordered(v)])):value
const same=(a:unknown,b:unknown)=>JSON.stringify(ordered(a))===JSON.stringify(ordered(b))
const abort=(locale='zh-CN')=>new DOMException(i18n('drawing_context_changed',locale),'AbortError')

/** History advances only after an explicit confirmation, never on a visual preview. */
export class DrawingHistory {
  private options:Options
  private drawings=new Map<string,DrawingSnapshot>()
  private past:Entry[]=[]
  private future:Entry[]=[]
  private uncertain=new Map<string,DrawingOwner>()
  private pending=0
  private error:string|undefined
  private generation=0
  private disposed=false
  private tail:Promise<unknown>=Promise.resolve()
  private text(key:string){return i18n(key,this.options.locale?.()??'zh-CN')}
  constructor(options:Options){this.options=options}
  getState():DrawingHistoryState{return {pending:this.pending,canUndo:this.past.length>0,canRedo:this.future.length>0,error:this.error,uncertainLogicalIds:[...this.uncertain.keys()]}}
  getDrawings():DrawingSnapshot[]{return [...this.drawings.values()].map(copy)}
  private emit(){if(!this.disposed)this.options.onChange?.(this.getState())}
  private dropHistory(id:string){this.past=this.past.filter(e=>e.logicalId!==id);this.future=this.future.filter(e=>e.logicalId!==id)}
  private notify(entry:Entry,source:DrawingSource,context:DrawingChange['context']){
    if(same(entry.before,entry.after))return
    try{this.options.onConfirmed?.({...copy(entry),kind:entry.before?(entry.after?'update':'delete'):'create',source,context})}
    catch(reason){this.error=`${this.text('drawing_notification_failed')}${reason instanceof Error?reason.message:String(reason)}`;this.emit()}
  }
  private apply(id:string,state:DrawingSnapshot|null):DrawingSnapshot|null {
    const rendered=this.options.apply(id,copy(state))
    if(rendered){const actual=copy({...rendered,logicalId:id,overlay:{...rendered.overlay,id}});this.drawings.set(id,actual);return copy(actual)}
    this.drawings.delete(id);return null
  }
  private enqueue<T>(task:(generation:number)=>Promise<T>):Promise<T>{
    if(this.disposed)return Promise.reject(abort(this.options.locale?.()??'zh-CN'))
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
      result=(before??after)!.owner==='backend'
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
    const actual=this.apply(id,result.snapshot)
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
        this.past.push({logicalId:id,before:outcome.before,after:outcome.after});this.future=[]
        this.notify({logicalId:id,before:outcome.before,after:outcome.after},source,context)
      }
      return outcome.result
    })
  }
  undo():Promise<DrawingCommitResult|undefined>{
    const context=copy(this.options.context())
    return this.enqueue(async generation=>{
      const entry=this.past.at(-1);if(!entry)return
      const outcome=await this.perform(entry.logicalId,entry.before,'history',generation,context)
      if(outcome.result.status==='confirmed'){this.past.pop();this.future.push({logicalId:entry.logicalId,before:outcome.after,after:outcome.before});this.notify({logicalId:entry.logicalId,before:outcome.before,after:outcome.after},'history',context)}
      return outcome.result
    })
  }
  redo():Promise<DrawingCommitResult|undefined>{
    const context=copy(this.options.context())
    return this.enqueue(async generation=>{
      const entry=this.future.at(-1);if(!entry)return
      const outcome=await this.perform(entry.logicalId,entry.after,'history',generation,context)
      if(outcome.result.status==='confirmed'){this.future.pop();this.past.push({logicalId:entry.logicalId,before:outcome.before,after:outcome.after});this.notify({logicalId:entry.logicalId,before:outcome.before,after:outcome.after},'history',context)}
      return outcome.result
    })
  }
  /** Canonical external reads do not issue CRUD or discard unchanged objects' history. */
  reconcile(owner:DrawingOwner,values:DrawingSnapshot[]):void {
    if(this.pending)throw Error(this.text('drawing_message_7'))
    const ids=new Set(values.map(v=>v.logicalId))
    if(ids.size!==values.length||values.some(v=>v.owner!==owner))throw Error(this.text('drawing_message_8'))
    if(values.some(v=>this.drawings.has(v.logicalId)&&this.drawings.get(v.logicalId)!.owner!==owner))throw Error(this.text('drawing_message_9'))
    for(const value of values)this.options.validate?.(value)
    for(const current of this.getDrawings())if(current.owner===owner&&!ids.has(current.logicalId)){this.apply(current.logicalId,null);this.dropHistory(current.logicalId);this.uncertain.delete(current.logicalId)}
    for(const value of values){const old=this.drawings.get(value.logicalId),actual=this.apply(value.logicalId,value);if(!same(old,actual))this.dropHistory(value.logicalId);this.uncertain.delete(value.logicalId)}
    for(const [id,uncertainOwner] of this.uncertain)if(uncertainOwner===owner)this.uncertain.delete(id)
    if(!this.uncertain.size)this.error=undefined;this.emit()
  }
  reset(clearDrawings=false):void {
    this.generation++;this.pending=0;this.tail=Promise.resolve();this.past=[];this.future=[];this.uncertain.clear();this.error=undefined
    if(clearDrawings){for(const id of this.drawings.keys())this.options.apply(id,null);this.drawings.clear()}
    this.emit()
  }
  dispose():void{this.disposed=true;this.reset();this.drawings.clear()}
}
