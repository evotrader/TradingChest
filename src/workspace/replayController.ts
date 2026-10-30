import type {ChartPro} from '../types'
import {replayParticipant,type ReplayParticipant,type ReplayPrepared,type ReplayTransaction} from './replayParticipant'
import {replayTime,replayPrefixLength,replayAbortable} from '../replay/history'
import {WorkspaceReplayError,type ReplaySpeed,type WorkspaceReplayState,type WorkspaceReplayRecord} from '../replay/types'

type Cell={cellId:string;chart:ChartPro}
type Participant={cellId:string;participant:ReplayParticipant;prepared?:ReplayPrepared}
interface Options {cells:()=>Cell[];active:()=>string;presentBusy?:(signal:AbortSignal)=>Promise<void>;changed?:(state:WorkspaceReplayState)=>void}
const clone=<T>(value:T):T=>structuredClone(value)
const aborted=()=>new DOMException('复盘操作已取消','AbortError')
const initial=():WorkspaceReplayState=>({mode:'live',phase:'idle',speed:1,availabilityAssumed:false,cells:[]})
const speeds=[1,2,4,8,16]
/** One clock and one in-flight operation for every member of the workspace. */
export class WorkspaceReplayController {
  private state=initial()
  private record:WorkspaceReplayRecord|null=null
  private members:Participant[]=[]
  private listeners=new Set<(state:WorkspaceReplayState)=>void>()
  private running?:{controller:AbortController;task:Promise<void>;phase:WorkspaceReplayState['phase']}
  private timer?:ReturnType<typeof setTimeout>
  private playRequested=false
  private disposed=false
  private seekSequence=0
  private locations:Array<{cellId:string}&ReturnType<ReplayParticipant['navigate']>>=[]
  private visibility=()=>{if(document.hidden)this.pause()}
  constructor(private options:Options){if(typeof document!=='undefined')document.addEventListener('visibilitychange',this.visibility)}
  getState():WorkspaceReplayState{return clone(this.state)}
  getRecord():WorkspaceReplayRecord|null{return clone(this.record)}
  setRecord(record:WorkspaceReplayRecord|null):void {this.assertIdle();this.record=clone(record)}
  /** The document validator owns external record validation; callers here pass that validated value. */
  editRecord(edit:(record:WorkspaceReplayRecord)=>void):void {this.assertStable();if(!this.record)throw new WorkspaceReplayError('OUT_OF_RANGE','尚无复盘记录');const next=clone(this.record);edit(next);this.record=next;this.emit()}
  subscribe(listener:(state:WorkspaceReplayState)=>void):()=>void{this.valid();this.listeners.add(listener);this.safely(()=>listener(this.getState()));return()=>this.listeners.delete(listener)}
  private safely(fn:()=>void){try{fn()}catch{}}
  private emit(){if(this.disposed)return;this.safely(()=>this.options.changed?.(this.getState()));for(const listener of [...this.listeners])this.safely(()=>listener(this.getState()))}
  private valid(){if(this.disposed)throw new WorkspaceReplayError('DISPOSED','工作台已经销毁')}
  assertStable(){this.valid();if(this.running||this.state.phase==='error')throw new WorkspaceReplayError('BUSY','工作台正在复盘切换或等待恢复')}
  assertIdle(){this.assertStable();if(this.state.mode!=='live')throw new WorkspaceReplayError('REPLAY_OWNED','请先退出复盘再修改工作台')}
  private clearTimer(){if(this.timer!==undefined)clearTimeout(this.timer);this.timer=undefined}
  pause(){this.valid();this.playRequested=false;this.clearTimer();if(this.state.phase==='playing'){this.state.phase='paused';this.emit()}}
  speed(speed:ReplaySpeed){this.assertStable();if(!speeds.includes(speed))throw new WorkspaceReplayError('OUT_OF_RANGE','复盘速度无效');this.state.speed=speed;if(this.record)this.record.speed=speed;if(this.state.phase==='playing'){this.clearTimer();this.schedule()}this.emit()}
  driver(cellId:string){this.assertStable();if(this.state.phase!=='paused'||!this.members.some(m=>m.cellId===cellId))throw new WorkspaceReplayError('OUT_OF_RANGE','请暂停后选择参与复盘的驱动图');this.checkDriver(cellId,this.state.from!,this.state.to!);this.state.driverCellId=cellId;if(this.record)this.record.driverCellId=cellId;this.emit()}
  private checkDriver(id:string,from:number,to:number){const times=this.members.find(m=>m.cellId===id)?.prepared?.window.visibleAt;if(!times||!times.some(time=>time>=from&&time<to))throw new WorkspaceReplayError('EMPTY_DRIVER','所选驱动图在此范围内没有可推进的已完成 K 线',{cellId:id})}
  private summarize(){return this.members.map(m=>({cellId:m.cellId,...m.participant.summary()}))}
  private error(reason:unknown,cellId?:string):WorkspaceReplayError {
    if(reason instanceof WorkspaceReplayError)return reason.cellId||!cellId?reason:new WorkspaceReplayError(reason.code,reason.message,{cellId,status:reason.status,cause:reason})
    const value=reason as {code?:string;status?:number}
    const codes=['UNSUPPORTED','IDENTITY_MISMATCH','TIMING_UNAVAILABLE','INVALID_HISTORY','PARTIAL_HISTORY','EMPTY_DRIVER','OUT_OF_RANGE','BUSY','REPLAY_OWNED','RESTORE_FAILED','DISPOSED']
    return new WorkspaceReplayError(codes.includes(value?.code??'')?value.code as WorkspaceReplayError['code']:'RESTORE_FAILED',reason instanceof Error?reason.message:String(reason),{cellId,status:value?.status,cause:reason})
  }
  private run(phase:WorkspaceReplayState['phase'],work:(signal:AbortSignal)=>Promise<void>):Promise<void>{
    this.valid();if(this.running)return Promise.reject(new WorkspaceReplayError('BUSY','复盘操作尚未完成'))
    const controller=new AbortController(),previous=this.getState()
    this.state={...this.state,phase,error:undefined}
    const task=Promise.resolve().then(async()=>{
      controller.signal.throwIfAborted();await this.options.presentBusy?.(controller.signal);controller.signal.throwIfAborted();await work(controller.signal)
    }).catch(reason=>{
      if(!this.disposed&&this.state.phase!=='error'){
        const error=this.error(reason);this.state={...previous,phase:previous.phase==='error'?'error':previous.mode==='replay'?'paused':'idle',error:reason instanceof DOMException&&reason.name==='AbortError'?undefined:{code:error.code,message:error.message,cellId:error.cellId,status:error.status},cells:this.summarize()};this.emit()
      }
      throw reason
    }).finally(()=>{if(this.running?.task===task)this.running=undefined})
    this.running={controller,task,phase};this.emit();return task
  }
  private async prepareAll<T>(members:Participant[],signal:AbortSignal,prepare:(member:Participant,signal:AbortSignal)=>Promise<T>):Promise<T[]> {
    const controller=new AbortController(),joined=AbortSignal.any([signal,controller.signal]);let failure:unknown
    const results=await Promise.allSettled(members.map(async member=>{try{return await replayAbortable(prepare(member,joined),joined)}catch(reason){if(failure===undefined&&!signal.aborted){failure=this.error(reason,member.cellId);controller.abort()}throw reason}}))
    signal.throwIfAborted();if(failure!==undefined)throw failure
    return results.map(result=>(result as PromiseFulfilledResult<T>).value)
  }
  private async transaction(prepared:Array<{cellId:string;begin():ReplayTransaction;assertCurrent():void}>,cursor:number,incremental:boolean,signal:AbortSignal,commit:()=>void){
    const transactions:Array<{cellId:string;transaction:ReplayTransaction}>=[]
    try {
      signal.throwIfAborted();for(const item of prepared)item.assertCurrent()
      for(const item of prepared){signal.throwIfAborted();transactions.push({cellId:item.cellId,transaction:item.begin()})}
      for(const item of transactions){signal.throwIfAborted();try{await item.transaction.apply(cursor,incremental,signal)}catch(reason){if(signal.aborted)throw aborted();throw this.error(reason,item.cellId)}}
      signal.throwIfAborted();this.valid()
      for(const item of transactions)item.transaction.seal()
      const finalized=await Promise.allSettled(transactions.map(async item=>{signal.throwIfAborted();try{await item.transaction.finalize?.(signal)}catch(error){throw this.error(error,item.cellId)}}))
      const failedFinalization=finalized.find(result=>result.status==='rejected');if(failedFinalization?.status==='rejected')throw failedFinalization.reason
      signal.throwIfAborted();this.valid();commit()
      for(const item of transactions)this.safely(()=>item.transaction.publish())
      this.emit()
    }catch(reason){
      const failures:Array<{cellId:string;reason:unknown}>=[]
      for(const item of [...transactions].reverse())try{await item.transaction.rollback()}catch(error){failures.push({cellId:item.cellId,reason:error})}
      if(failures.length&&!this.disposed){const first=failures[0],error=this.error(first.reason,first.cellId);this.state={...this.state,phase:'error',cells:this.summarize().map(cell=>{const failure=failures.find(f=>f.cellId===cell.cellId);return failure?{...cell,error:{code:'RESTORE_FAILED',message:String(failure.reason)}}:cell}),error:{code:'RESTORE_FAILED',message:`复盘回滚失败，请重试返回实时：${error.message}`,cellId:first.cellId}};this.emit()}
      throw reason
    }
  }
  start(input:{from:number;to:number;cursor?:number;driverCellId?:string},record?:WorkspaceReplayRecord):Promise<void>{
    try{this.assertIdle();if(!replayTime(input.from)||!replayTime(input.to)||input.from>=input.to||!replayTime(input.cursor??input.from)||(input.cursor??input.from)<input.from||(input.cursor??input.from)>=input.to)throw new WorkspaceReplayError('OUT_OF_RANGE','复盘范围或定位时刻无效')}catch(error){return Promise.reject(error)}
    const cursor=input.cursor??input.from,driver=input.driverCellId??this.options.active(),cells=this.options.cells()
    if(![1,2,4].includes(cells.length)||cells.some(cell=>!cell.chart))return Promise.reject(new WorkspaceReplayError('BUSY','请先等待全部窗格就绪'))
    return this.run('loading',async signal=>{
      const members:Participant[]=[]
      try{
        for(const cell of cells){const participant=replayParticipant(cell.chart);if(!participant)throw new WorkspaceReplayError('UNSUPPORTED','此图表实例未提供工作台复盘能力',{cellId:cell.cellId});participant.claim();members.push({cellId:cell.cellId,participant})}
        this.members=members
        await this.prepareAll(members,signal,async(member,joined)=>{member.prepared=await member.participant.prepare({from:input.from,to:input.to,warmupBars:200},{signal:joined,reason:record?'restore':'enter'},record?.participants.find(p=>p.cellId===member.cellId))})
        this.checkDriver(driver,input.from,input.to)
        await this.transaction(members.map(m=>({cellId:m.cellId,...m.prepared!})),cursor,false,signal,()=>{
          this.record=record?{...clone(record),mode:'paused'}:{version:1,mode:'paused',historyKind:'current-history',from:input.from,to:input.to,cursor,driverCellId:driver,speed:1,participants:members.map(m=>({cellId:m.cellId,...m.prepared!.record})),notes:'',bookmarks:[]}
          this.state={mode:'replay',phase:'paused',from:input.from,to:input.to,cursor,driverCellId:driver,speed:record?.speed??1,availabilityAssumed:members.some(m=>m.prepared!.availabilityAssumed),cells:this.summarize()}
        })
      }catch(reason){if(this.state.phase!=='error'){for(const member of members){member.prepared?.release();member.participant.release()}this.members=[]}throw reason}
    })
  }
  resume():Promise<void>{if(!this.record)return Promise.reject(new WorkspaceReplayError('OUT_OF_RANGE','没有可继续的复盘记录'));return this.start({from:this.record.from,to:this.record.to,cursor:this.record.cursor,driverCellId:this.record.driverCellId},this.record)}
  private async move(cursor:number,incremental:boolean,signal:AbortSignal){
    await this.transaction(this.members.map(m=>({cellId:m.cellId,begin:()=>m.prepared!.begin(),assertCurrent:()=>{}})),cursor,incremental,signal,()=>{this.state={...this.state,phase:'paused',cursor,cells:this.summarize(),error:undefined};if(this.record){this.record.cursor=cursor;this.record.mode='paused'}})
  }
  async seek(cursor:number):Promise<void>{
    this.valid();if(this.state.mode!=='replay'||this.state.phase==='error'||!replayTime(cursor)||cursor<this.state.from!||cursor>=this.state.to!)throw new WorkspaceReplayError('OUT_OF_RANGE','定位时刻不在当前复盘范围')
    this.pause();const sequence=++this.seekSequence
    if(this.running){if(this.running.phase!=='seeking')throw new WorkspaceReplayError('BUSY','请等待复盘切换完成');this.running.controller.abort();try{await this.running.task}catch{}}
    if(sequence!==this.seekSequence)throw aborted()
    if(this.getState().phase==='error')throw new WorkspaceReplayError('RESTORE_FAILED','请先恢复实时状态')
    return this.run('seeking',signal=>this.move(cursor,false,signal))
  }
  private next(direction:'forward'|'backward'):number|undefined {
    const times=this.members.find(m=>m.cellId===this.state.driverCellId)!.prepared!.window.visibleAt,cursor=this.state.cursor!
    if(direction==='forward')return times[replayPrefixLength(times,cursor)]
    const before=replayPrefixLength(times,cursor-1)-1
    return Math.max(this.state.from!,times[before]??this.state.from!)
  }
  step(direction:'forward'|'backward'):Promise<void>{
    try{this.assertStable();if(this.state.mode!=='replay')throw new WorkspaceReplayError('OUT_OF_RANGE','请先开始复盘');if(!['forward','backward'].includes(direction))throw new WorkspaceReplayError('OUT_OF_RANGE','步进方向无效')}catch(error){return Promise.reject(error)}
    this.pause();const cursor=this.next(direction);if(cursor===undefined||cursor===this.state.cursor)return Promise.resolve()
    return this.run('seeking',signal=>this.move(cursor,direction==='forward',signal))
  }
  play(){this.assertStable();if(this.state.mode!=='replay')throw new WorkspaceReplayError('OUT_OF_RANGE','请先开始复盘');if(typeof document!=='undefined'&&document.hidden)return;if(this.next('forward')===undefined)return;this.playRequested=true;this.state.phase='playing';this.emit();this.schedule()}
  private schedule(){if(this.disposed||this.state.phase!=='playing'||this.timer!==undefined)return;this.timer=setTimeout(()=>{this.timer=undefined;if(this.disposed||this.state.phase!=='playing')return;const cursor=this.next('forward');if(cursor===undefined){this.pause();return}void this.run('seeking',signal=>this.move(cursor,true,signal)).then(()=>{if(this.disposed||!this.playRequested||typeof document!=='undefined'&&document.hidden)return;if(this.next('forward')!==undefined){this.state.phase='playing';this.emit();this.schedule()}}).catch(()=>{})},1000/this.state.speed)}
  async stop():Promise<void>{
    this.valid();this.pause();++this.seekSequence
    if(this.running){this.running.controller.abort();try{await this.running.task}catch{}}
    this.valid();if(this.state.mode==='live'&&this.state.phase!=='error')return
    return this.run('resuming',async signal=>{
      const prepared=await this.prepareAll(this.members,signal,async(member,joined)=>({cellId:member.cellId,...await member.participant.prepareLive(joined)}))
      try{await this.transaction(prepared,this.state.cursor??0,false,signal,()=>{if(this.record)this.record.mode='live';this.state={...initial(),speed:this.state.speed,cells:this.summarize()}})}finally{for(const item of prepared)item.release()}
      for(const member of this.members){member.prepared?.release();member.participant.release()}this.members=[]
    })
  }
  replaceCell(cellId:string,chart:ChartPro):void {
    const member=this.members.find(m=>m.cellId===cellId);if(!member||this.disposed)return
    this.pause();this.running?.controller.abort();member.prepared?.release();member.prepared=undefined;member.participant.release()
    const next=replayParticipant(chart)
    let message='复盘期间图表已重新挂载，请返回实时后重试'
    if(next)try{next.claim();member.participant=next}catch(error){message=String(error)}
    else message='替换的图表不支持工作台复盘，请重新打开工作台'
    this.state={...this.state,phase:'error',error:{code:'RESTORE_FAILED',cellId,message},cells:this.summarize()};this.emit()
  }
  events(){this.valid();return this.members.flatMap(m=>m.participant.events().map(layer=>({cellId:m.cellId,...layer})))}
  getLocations(){return clone(this.locations)}
  locate(timestamp:number){this.valid();this.locations=this.members.map(m=>({cellId:m.cellId,...m.participant.navigate(timestamp)}))}
  async navigateEvent(ref:{cellId:string;layerId:string;eventId:string}){
    this.assertStable();const member=this.members.find(m=>m.cellId===ref.cellId),event=member?.participant.events().find(l=>l.layerId===ref.layerId)?.events.find(e=>e.id===ref.eventId)
    if(!event||event.availableAt===undefined)throw new WorkspaceReplayError('OUT_OF_RANGE','事件当前不可见或引用已失效')
    await this.seek(Math.max(event.timestamp,event.availableAt));this.locate(event.timestamp);member!.participant.selectEvent(ref.layerId,ref.eventId)
  }
  dispose(){if(this.disposed)return;this.disposed=true;this.clearTimer();this.running?.controller.abort();for(const member of this.members){member.prepared?.release();member.participant.release()}this.members=[];this.record=null;this.listeners.clear();if(typeof document!=='undefined')document.removeEventListener('visibilitychange',this.visibility)}
}
