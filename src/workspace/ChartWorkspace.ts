import {WorkspaceReplayController} from './replayController'
import {WorkspaceReplayError,type WorkspaceReplayState,type ReplaySpeed,type WorkspaceReplayRecord,type ReplayBookmark} from '../replay/types'
import {assertReplayRecord} from './replayRecord'
import {replayParticipant} from './replayParticipant'
import {ReplayControls} from './ReplayControls'
import {ReplayNotes} from './ReplayNotes'
import {replayFrame,waitChartPaint} from '../core/chartPaint'
import {createOpaqueId} from '../ids'
import {yieldTask} from '../core/yieldTask'
import {DrawingSessionRegistry} from '../drawing/session'
import type { Chart, Crosshair } from 'klinecharts'
import type { ChartPro, Period, SymbolInfo } from '../types'
import {captureLayout,restoreLayout} from '../persistence/v4'
import {isWorkspaceDocument,migrateWorkspaceDocument} from './document'
export {isWorkspaceDocument} from './document'
import {hideCrosshair,syncCrosshair,syncViewport,visibleTimestamps} from './viewportSync'
import translate from '../i18n'
import {WorkspaceStoreError,type WorkspaceSummary,type WorkspaceWrite,type StoredWorkspace,type WorkspaceStore} from './store'
import {readLegacyWorkspace} from './legacy'
import {workspaceStyle} from './style'
import type {ChartWorkspaceOptions,WorkspaceBinding,WorkspaceCell,WorkspaceDocument,WorkspaceLayout,WorkspaceSync} from './types'

const ids=['primary','secondary-1','secondary-2','secondary-3']
const equalPeriod=(a:Period,b:Period)=>a.multiplier===b.multiplier&&a.timespan===b.timespan
const emptySync=():WorkspaceSync=>({symbol:false,period:false,crosshair:false,viewport:false})
type MessageValues=Record<string,string|number>
class WorkspaceError extends Error {
  constructor(readonly key:string,readonly values:MessageValues,message:string){super(message)}
}
type Runtime={cell:WorkspaceCell; element:HTMLElement;body:HTMLElement;status:HTMLElement;symbolSelect:HTMLSelectElement;periodSelect:HTMLSelectElement;controller:AbortController;binding?:WorkspaceBinding;pro?:ChartPro;unsubscribe?:()=>void;unsubscribeReady?:()=>void;restoredIds:string[];identitySeq:number;disposed?:boolean;transitioning?:boolean}


/** The host owns data and persistence; this class owns all workspace interaction. */
export class ChartWorkspace {
  private replay?:WorkspaceReplayController
  private replayOverlay?:HTMLElement
  private replayRecordSaved=false
  private replayUnsaved=false
  private replayDialog?:{element:HTMLElement;cancel:()=>void}
  private replayControls?:ReplayControls
  private replayNotes?:ReplayNotes
  private replayProjection=''
  private replayListeners=new Set<(state:WorkspaceReplayState)=>void>()
  private restoreTask?:Promise<void>
  private restoreController?:AbortController
  private options:ChartWorkspaceOptions
  private root:HTMLElement
  private grid:HTMLElement
  private notice:HTMLElement
  private cells:Runtime[]=[]
  private loadSequence=0
  private pending=new Set<Runtime>()
  private staged=new Set<Runtime>()
  private sharedSessions=new DrawingSessionRegistry({scope:'workspace'})
  private layout:WorkspaceLayout=1
  private active='primary'
  private sync=emptySync()
  private columnRatio=50
  private rowRatio=50
  private operation=0
  private alignment=0
  private syncVersion:Record<keyof WorkspaceSync,number>={symbol:0,period:0,crosshair:0,viewport:0}
  private alignmentTail:Promise<void>=Promise.resolve()
  private propagating=false
  private disposed=false
  private busy=true
  private initialization:Promise<void>|undefined
  private observer:ResizeObserver|null=null
  private controls:HTMLInputElement[]=[]
  private layoutSelect:HTMLSelectElement
  private saved:WorkspaceSummary[]=[]
  private selected?:WorkspaceSummary
  private savedSelect!:HTMLSelectElement
  private nameInput!:HTMLInputElement
  private storeButtons:HTMLButtonElement[]=[]
  private io?:{controller:AbortController;kind:'read'|'write'}
  private unknownWrite?:{kind:'write';input:WorkspaceWrite;select:boolean}|{kind:'remove';id:string}
  private lastStorageAction?:()=>Promise<unknown>
  private deleteDialog?:HTMLElement

  constructor(options:ChartWorkspaceOptions){
    this.options={...options,locale:options.locale??'zh-CN',theme:options.theme??'dark',height:options.height??'100%'}
    this.validateHeight(this.options.height!)
    this.root=document.createElement('div');this.root.className='tc-workspace';this.root.dataset.testid='chart-workspace'
    this.root.dataset.theme=this.options.theme
    this.root.dataset.locale=this.options.locale
    this.root.style.height=typeof this.options.height==='number'?`${this.options.height}px`:this.options.height!
    const style=document.createElement('style');style.textContent=workspaceStyle
    const toolbar=document.createElement('div');toolbar.className='tc-workspace-toolbar'
    const group=(key:'layout'|'sync'|'storage'|'size')=>{const element=document.createElement('div');element.className='tc-workspace-group';element.dataset.toolbarGroup=key;element.hidden=options.toolbar?.[key]===false;toolbar.append(element);return element}
    const layoutGroup=group('layout'),syncGroup=group('sync'),storageGroup=group('storage'),sizeGroup=group('size')
    const label=document.createElement('label');label.append(this.caption('workspace_layout'))
    this.layoutSelect=document.createElement('select');this.aria(this.layoutSelect,'workspace_layout')
    for(const [value,key] of [[1,'workspace_single'],[2,'workspace_double'],[4,'workspace_four']] as const){const option=new Option('',String(value));this.message(option,key);this.layoutSelect.add(option)}
    this.layoutSelect.onchange=()=>void this.setLayout(Number(this.layoutSelect.value) as WorkspaceLayout).catch(e=>{this.layoutSelect.value=String(this.layout);this.error(e)})
    label.append(this.layoutSelect);layoutGroup.append(label)
    for(const key of Object.keys(emptySync()) as Array<keyof WorkspaceSync>){
      const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.dataset.sync=key
      input.onchange=()=>{if(this.busy){input.checked=this.sync[key];this.error(this.failure('workspace_sync_busy'));return}this.sync[key]=input.checked;if(input.checked)void this.align(key).catch(e=>this.error(e));else ++this.syncVersion[key]}
      label.append(input,this.caption(`workspace_sync_${key}`));syncGroup.append(label);this.controls.push(input)
    }
    this.savedSelect=document.createElement('select');this.aria(this.savedSelect,'workspace_saved_list')
    this.savedSelect.onchange=()=>{const id=this.savedSelect.value;if(id)void this.load(id).catch(e=>{this.renderSaved();this.error(e)})};storageGroup.append(this.savedSelect)
    this.nameInput=document.createElement('input');this.nameInput.type='text';this.nameInput.maxLength=80;this.aria(this.nameInput,'workspace_name');storageGroup.append(this.nameInput)
    const actions:Array<[string,()=>Promise<unknown>|void]>=[['workspace_save',()=>this.save()],['workspace_save_as',()=>this.saveAs(this.nameInput.value)],['workspace_load',()=>this.load(this.savedSelect.value)],['workspace_rename',()=>this.renameSaved(this.savedSelect.value,this.nameInput.value)],['workspace_delete',()=>this.confirmDelete()],['workspace_refresh',()=>this.unknownWrite?this.confirmPending():this.listSaved()],['workspace_import',()=>this.importLegacy(this.nameInput.value)],['workspace_storage_retry',()=>this.unknownWrite?this.confirmPending():this.lastStorageAction?.()],['workspace_cancel',()=>{this.io?.controller.abort();this.restoreController?.abort()}]]
    for(const [key,action] of actions){const button=document.createElement('button');button.type='button';button.dataset.storageAction=key;this.message(button,key);button.onclick=()=>void Promise.resolve().then(action).catch(e=>this.error(e));storageGroup.append(button);this.storeButtons.push(button)}
    storageGroup.append(this.caption('workspace_manual_save'))
    for(const key of ['columnRatio','rowRatio'] as const){
      const label=document.createElement('label'),input=document.createElement('input');input.type='range';input.min='25';input.max='75';input.value='50';input.dataset.ratio=key;this.aria(input,`workspace_${key}`)
      input.oninput=()=>{this[key]=Number(input.value);this.geometry()};label.append(this.caption(`workspace_${key}`),input);sizeGroup.append(label)
    }
    this.notice=document.createElement('div');this.notice.className='tc-workspace-notice';this.notice.setAttribute('role','status')
    this.grid=document.createElement('div');this.grid.className='tc-workspace-grid'
    const main=document.createElement('div');main.className='tc-workspace-main';main.append(this.grid)
    this.root.append(style,toolbar,this.notice,main);options.container.append(this.root)
    if(options.replay?.enabled){
      if(options.toolbar?.replay!==false){this.replayControls=new ReplayControls(this,e=>this.error(e));this.root.insertBefore(this.replayControls.element,this.notice)}
      if(options.toolbar?.notes!==false){this.replayNotes=new ReplayNotes(this,()=>this.replay?.events()??[],()=>this.replay?.getLocations()??[],e=>this.error(e),()=>this.replayUnsaved);main.append(this.replayNotes.element)}
    }
    if(typeof ResizeObserver!=='undefined'){this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(this.grid)}
    this.renderSaved()
    if(options.store)void this.listSaved().catch(e=>this.error(e));else this.message(this.notice,'workspace_storage_disabled')
    this.initialization=this.createCell({cellId:'primary',symbol:options.initialSymbol,period:options.initialPeriod??{multiplier:1,timespan:'day',text:'1d'},context:options.context},this.grid).then(c=>{
      if(this.disposed){this.disposeCell(c);return}this.cells=[c];this.geometry();this.setActive('primary');this.notify(()=>this.options.onLayoutChange?.(this.layout))
    }).catch(e=>this.error(e)).finally(()=>{this.initialization=undefined;this.busy=false;this.renderReplay()})
  }
  private newReplay(cells:()=>Runtime[],active:()=>string,changed:(state:WorkspaceReplayState)=>void):WorkspaceReplayController {
    return new WorkspaceReplayController({cells:()=>cells().map(c=>{if(!c.pro)throw new WorkspaceReplayError('BUSY','请先等待全部窗格就绪',{cellId:c.cell.cellId});return {cellId:c.cell.cellId,chart:c.pro}}),active,presentBusy:async signal=>{await replayFrame(signal);await replayFrame(signal);await yieldTask()},changed})
  }
  private replayCore():WorkspaceReplayController {
    if(this.disposed)throw new WorkspaceReplayError('DISPOSED','工作台已经销毁')
    if(!this.options.replay?.enabled)throw new WorkspaceReplayError('UNSUPPORTED','宿主尚未启用工作台复盘')
    return this.replay??=this.newReplay(()=>this.cells,()=>this.active,state=>this.replayChanged(state))
  }
  private replayChanged(state:WorkspaceReplayState){
    if(this.disposed)return
    const blocked=['loading','seeking','resuming','error'].includes(state.phase),locked=blocked||state.mode==='replay'
    this.root.dataset.replayPhase=state.phase;this.root.dataset.replayMode=state.mode
    this.layoutSelect.disabled=locked
    for(const cell of this.cells){cell.body.inert=blocked;cell.symbolSelect.disabled=locked||!this.options.symbols.length;cell.periodSelect.disabled=locked||!cell.periodSelect.options.length;cell.pro?.getShortcutManager()?.setEnabled(!blocked&&cell.cell.cellId===this.active)}
    if(blocked&&!this.replayOverlay){this.replayOverlay=document.createElement('div');this.replayOverlay.className='tc-workspace-replay-busy';this.replayOverlay.setAttribute('role','status');this.grid.append(this.replayOverlay)}
    if(this.replayOverlay){this.replayOverlay.textContent=state.phase==='error'?`复盘恢复失败：${state.error?.message??'请重试返回实时'}`:'正在同步全部图表…';if(!blocked){this.replayOverlay.remove();this.replayOverlay=undefined}}
    const projection=JSON.stringify([state.mode,state.from,state.to,state.cursor,state.driverCellId,state.speed]);if(projection!==this.replayProjection&&this.replayProjection&&this.getReplayRecord())this.replayUnsaved=true;this.replayProjection=projection
    this.renderReplay(state);for(const notify of [this.options.onReplayStateChange,...this.replayListeners])try{notify?.(structuredClone(state))}catch(error){try{this.options.onError?.(error instanceof Error?error:new Error(String(error)))}catch{}}
  }
  private renderReplay(state=this.getReplayState()){this.replayControls?.render(state);this.replayNotes?.render(state)}
  async startReplay(options:{from:number;to:number;cursor?:number;driverCellId?:string}):Promise<void>{if(this.initialization)await this.initialization;if(this.busy||this.restoreTask||this.cells.some(c=>c.transitioning))throw new WorkspaceReplayError('BUSY','工作台尚未就绪');const core=this.replayCore();core.assertIdle();await this.allowReplayReplacement('新复盘将替换上次记录');await core.start(options);this.replayRecordSaved=false;this.replayUnsaved=true}
  playReplay():void{this.replayCore().play()}
  pauseReplay():void{this.replayCore().pause()}
  stepReplay(direction:'forward'|'backward'):Promise<void>{return this.replayCore().step(direction)}
  async seekReplay(timestamp:number):Promise<void>{const core=this.replayCore();await core.seek(timestamp);core.locate(timestamp)}
  setReplaySpeed(speed:ReplaySpeed):void{this.replayCore().speed(speed)}
  setReplayDriver(cellId:string):void{this.replayCore().driver(cellId)}
  async stopReplay():Promise<void>{if(this.restoreTask){this.restoreController?.abort();try{await this.restoreTask}catch(error){if(!(error instanceof DOMException&&error.name==='AbortError'))throw error}}return this.replayCore().stop()}
  async prepareContextChange(signal?:AbortSignal):Promise<void>{
    signal?.throwIfAborted()
    if(this.disposed)throw this.failure('workspace_closed')
    if(this.busy||this.restoreTask||this.cells.some(c=>c.transitioning))throw this.failure('workspace_busy')
    this.replay?.pause();this.replay?.assertStable();this.assertDrawingIdle(this.cells)
    await this.allowReplayReplacement('切换对象将关闭当前工作台',signal)
    signal?.throwIfAborted()
    if(this.replay)await this.replay.stop()
    signal?.throwIfAborted();this.clearReplayRecord()
  }
  resumeReplay():Promise<void>{if(this.busy||this.restoreTask||this.cells.some(c=>c.transitioning))return Promise.reject(new WorkspaceReplayError('BUSY','工作台尚未就绪'));return this.replayCore().resume()}
  getReplayState():WorkspaceReplayState{const state=this.replay?.getState()??{mode:'live' as const,phase:'idle' as const,speed:1 as const,availabilityAssumed:false,cells:[]};return this.restoreTask?{...state,phase:'loading'}:state}
  subscribeReplay(listener:(state:WorkspaceReplayState)=>void):()=>void{if(this.disposed)throw new WorkspaceReplayError('DISPOSED','工作台已经销毁');this.replayListeners.add(listener);try{listener(this.getReplayState())}catch{}return()=>this.replayListeners.delete(listener)}
  getReplayRecord():WorkspaceReplayRecord|null{return this.replay?.getRecord()??null}
  private editReplayRecord(edit:(record:WorkspaceReplayRecord)=>void){this.replayCore().editRecord(record=>{edit(record);assertReplayRecord(record,this.cells.map(c=>c.cell))});this.replayUnsaved=true;this.renderReplay()}
  updateReplayNotes(notes:string):void{this.editReplayRecord(record=>{record.notes=notes})}
  addReplayBookmark(input:Omit<ReplayBookmark,'id'>):string{const id=createOpaqueId();this.editReplayRecord(record=>{record.bookmarks.push({...structuredClone(input),id})});return id}
  updateReplayBookmark(id:string,patch:Partial<Omit<ReplayBookmark,'id'>>):void{this.editReplayRecord(record=>{const index=record.bookmarks.findIndex(b=>b.id===id);if(index<0)throw new WorkspaceReplayError('OUT_OF_RANGE','书签不存在');record.bookmarks[index]={...record.bookmarks[index],...structuredClone(patch),id}})}
  removeReplayBookmark(id:string):void{this.editReplayRecord(record=>{const index=record.bookmarks.findIndex(b=>b.id===id);if(index<0)throw new WorkspaceReplayError('OUT_OF_RANGE','书签不存在');record.bookmarks.splice(index,1)})}
  navigateReplayEvent(ref:{cellId:string;layerId:string;eventId:string}):Promise<void>{return this.replayCore().navigateEvent(ref)}
  private async allowReplayReplacement(reason:string,signal?:AbortSignal,incoming?:WorkspaceReplayRecord):Promise<void>{
    await this.replayNotes?.guardDraft(signal);signal?.throwIfAborted()
    const record=this.getReplayRecord();if(!record)return
    if(incoming&&this.jsonEqual({from:record.from,to:record.to,participants:record.participants,notes:record.notes,bookmarks:record.bookmarks},{from:incoming.from,to:incoming.to,participants:incoming.participants,notes:incoming.notes,bookmarks:incoming.bookmarks}))return
    if(!record.notes&&!record.bookmarks.length&&!this.replayRecordSaved)return
    if(this.replayDialog)throw new WorkspaceReplayError('BUSY','请先处理当前复盘记录')
    await new Promise<void>((resolve,reject)=>{
      const previous=document.activeElement as HTMLElement|null,element=document.createElement('div');element.setAttribute('role','alertdialog');element.setAttribute('aria-label','保留复盘记录');element.tabIndex=-1
      const message=document.createElement('span');message.textContent=`${reason}。可保存旧工作台、放弃当前记录或取消；已有存储原件不会删除。`;element.append(message)
      let closed=false
      const abort=()=>finish(true)
      const finish=(cancel=false)=>{if(closed)return;closed=true;signal?.removeEventListener('abort',abort);element.remove();this.replayDialog=undefined;previous?.focus();cancel?reject(new DOMException('已取消替换复盘记录','AbortError')):resolve()}
      const save=document.createElement('button');save.type='button';save.textContent='保存旧工作台并继续';save.disabled=!this.options.store
      save.onclick=()=>{save.disabled=true;void (this.selected?this.save():this.saveAs(this.nameInput.value)).then(()=>finish()).catch(error=>{this.error(error);save.disabled=false})}
      const discard=document.createElement('button');discard.type='button';discard.textContent='放弃当前记录并继续';discard.onclick=()=>finish()
      const cancel=document.createElement('button');cancel.type='button';cancel.textContent='取消';cancel.onclick=()=>finish(true)
      element.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();finish(true)}}
      element.append(save,discard,cancel);this.root.insertBefore(element,this.notice);this.replayDialog={element,cancel:()=>finish(true)};signal?.addEventListener('abort',abort,{once:true});cancel.focus()
    })
  }
  private clearReplayRecord(){if(!this.replay?.getRecord())return;this.replay.setRecord(null);this.replayRecordSaved=false;this.replayUnsaved=false;this.notice.textContent='已清除当前复盘引用；已有存储记录保留。';this.renderReplay()}
  private t(key:string,values:MessageValues={}){return translate(key,this.options.locale!).replace(/\{(\w+)\}/g,(match,name)=>String(values[name]??match))}
  private caption(key:string,values:MessageValues={}){const span=document.createElement('span');this.message(span,key,values);return span}
  private message(element:HTMLElement,key:string|null,values:MessageValues={}){
    if(key){element.dataset.i18n=key;element.dataset.i18nValues=JSON.stringify(values);element.textContent=this.t(key,values)}
    else {delete element.dataset.i18n;delete element.dataset.i18nValues;element.textContent=''}
  }
  private aria(element:HTMLElement,key:string,values:MessageValues={}){element.dataset.i18nAria=key;element.dataset.i18nAriaValues=JSON.stringify(values);element.setAttribute('aria-label',this.t(key,values))}
  private failure(key:string,values:MessageValues={}){return new WorkspaceError(key,values,this.t(key,values))}
  private reason(element:HTMLElement,reason:unknown){if(reason instanceof WorkspaceError)this.message(element,reason.key,reason.values);else {this.message(element,null);element.textContent=reason instanceof WorkspaceStoreError?`${reason.code}: ${reason.message}`:reason instanceof Error?reason.message:String(reason)}}
  private validateHeight(height:number|'100%'){if(height!=='100%'&&(!Number.isFinite(height)||height<=0))throw this.failure('workspace_invalid_height')}
  setLocale(locale:string){
    this.options.locale=locale;this.root.dataset.locale=locale
    for(const element of this.root.querySelectorAll<HTMLElement>('[data-i18n]'))this.message(element,element.dataset.i18n!,JSON.parse(element.dataset.i18nValues??'{}'))
    for(const element of this.root.querySelectorAll<HTMLElement>('[data-i18n-aria]'))this.aria(element,element.dataset.i18nAria!,JSON.parse(element.dataset.i18nAriaValues??'{}'))
    this.renderSaved();this.resize()
  }
  setTheme(theme:string){this.options.theme=theme;this.root.dataset.theme=theme;this.resize()}
  resize(height?:number|'100%'){
    if(this.disposed)return
    if(height!==undefined){this.validateHeight(height);this.options.height=height;this.root.style.height=typeof height==='number'?`${height}px`:height}
    for(const cell of this.cells)cell.pro?.getChart()?.resize()
  }
  private notify(callback:()=>void){try{callback()}catch(error){try{this.error(error)}catch{}}}
  private error(reason:unknown){if(this.disposed||reason instanceof DOMException&&reason.name==='AbortError')return;const error=reason instanceof Error?reason:new Error(String(reason));this.reason(this.notice,error);if(this.unknownWrite)this.notice.textContent=this.t('workspace_result_unknown')+' · '+this.notice.textContent;this.options.onError?.(error)}
  private geometry(){
    this.grid.style.gridTemplateColumns=this.layout===1?'minmax(0,1fr)':`minmax(0,${this.columnRatio}fr) minmax(0,${100-this.columnRatio}fr)`
    this.grid.style.gridTemplateRows=this.layout===4?`minmax(240px,${this.rowRatio}fr) minmax(240px,${100-this.rowRatio}fr)`:'minmax(240px,1fr)'
    for(const c of this.cells){c.pro?.getChart()?.resize();this.bindRecordGuard(c)}
    this.layoutSelect.value=String(this.layout)
    this.renderReplay()
  }
  private bindRecordGuard(c:Runtime){
    if(!this.options.replay?.enabled||!c.pro)return
    replayParticipant(c.pro)?.setRecordGuard?.({assert:()=>{if(this.getReplayRecord())throw new WorkspaceReplayError('BUSY','请先在比较面板处理上次复盘记录，再移除成员')},request:async()=>{this.replay?.assertIdle();if(this.restoreTask)throw new WorkspaceReplayError('BUSY','工作台正在恢复');await this.allowReplayReplacement('比较成员变化会使上次复盘不再适用');if(this.disposed||!this.cells.includes(c))throw new DOMException('Workspace replaced','AbortError');this.clearReplayRecord()}})
  }
  private async createCell(cell:WorkspaceCell,parent:HTMLElement,strict=false,staged=false,signal?:AbortSignal,sharedSessions=this.sharedSessions):Promise<Runtime>{
    const element=document.createElement('section');element.dataset.cellId=cell.cellId;element.tabIndex=0;element.className='tc-workspace-cell'
    if(strict||staged)element.dataset.cellId=`${cell.cellId}-pending`
    if(staged)element.style.display='none'
    const header=document.createElement('div');header.className='tc-workspace-header'
    const activate=document.createElement('button');activate.type='button';this.message(activate,cell.cellId==='primary'?'workspace_primary':'workspace_cell',{number:ids.indexOf(cell.cellId)+1});this.aria(activate,'workspace_active',{id:cell.cellId});activate.onclick=()=>this.setActive(cell.cellId)
    const symbolSelect=document.createElement('select');this.aria(symbolSelect,'workspace_symbol',{id:cell.cellId})
    for(const symbol of this.options.symbols)symbolSelect.add(new Option(symbol.name??symbol.ticker,symbol.ticker))
    if(strict||staged)this.aria(symbolSelect,'workspace_symbol_pending',{id:cell.cellId})
    symbolSelect.value=cell.symbol.ticker;symbolSelect.disabled=this.options.symbols.length===0
    const periodSelect=document.createElement('select');this.aria(periodSelect,'workspace_period',{id:cell.cellId});periodSelect.disabled=true
    if(strict||staged)this.aria(periodSelect,'workspace_period_pending',{id:cell.cellId})
    const body=document.createElement('div');body.className='tc-workspace-body'
    const status=document.createElement('span');status.className='tc-workspace-cell-status';status.setAttribute('role','status')
    const retry=document.createElement('button');retry.type='button';this.message(retry,'workspace_retry');this.aria(retry,'workspace_retry_cell',{id:cell.cellId})
    header.append(activate,symbolSelect,periodSelect,retry,status);element.append(header,body);parent.append(element)
    const runtime:Runtime={cell:{...cell},element,body,status,symbolSelect,periodSelect,controller:new AbortController(),restoredIds:[],identitySeq:0}
    const cancel=()=>runtime.controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel()
    retry.onclick=()=>void (runtime.pro?runtime.pro.retryData():this.changeIdentity(runtime,{})).catch(e=>this.error(e))
    this.pending.add(runtime);if(strict)this.staged.add(runtime)
    element.onpointerdown=()=>this.setActive(cell.cellId);element.addEventListener('focusin',()=>this.setActive(cell.cellId))
    element.addEventListener('keydown',event=>{if(!this.busy&&!runtime.transitioning&&runtime.cell.cellId===this.active)runtime.pro?.getShortcutManager()?.getHandler()?.(event)})
    symbolSelect.onchange=()=>{const symbol=this.options.symbols.find(s=>s.ticker===symbolSelect.value);if(symbol)void this.changeIdentity(runtime,{symbol}).catch(e=>{this.resetSelectors(runtime);this.error(e)})}
    periodSelect.onchange=()=>{const value=JSON.parse(periodSelect.value) as Period;void this.changeIdentity(runtime,{period:value}).catch(e=>{this.resetSelectors(runtime);this.error(e)})}
    try{
      const periods=await this.abortable(this.options.getPeriods(cell.symbol,runtime.controller.signal),runtime.controller.signal)
      runtime.controller.signal.throwIfAborted()
      if(!periods.length)throw this.failure('workspace_no_periods',{ticker:cell.symbol.ticker})
      if(!periods.some(p=>equalPeriod(p,cell.period))){if(strict)throw this.failure('workspace_stale_period',{ticker:cell.symbol.ticker});runtime.cell.period=periods[0]}
      for(const period of periods)periodSelect.add(new Option(period.text,JSON.stringify(period)))
      periodSelect.value=JSON.stringify(periods.find(p=>equalPeriod(p,runtime.cell.period)));periodSelect.disabled=false
      runtime.binding=this.options.mountCell(body,runtime.cell,runtime.controller.signal)
      let candidate:ChartPro|undefined,accepted:Promise<void>|undefined,acceptVersion=0
      let announce!:()=>void
      const announced=new Promise<void>(resolve=>{announce=resolve})
      const accept=(pro:ChartPro):Promise<void>=>{
        if(runtime.controller.signal.aborted)return Promise.resolve()
        if(candidate===pro)return accepted!
        candidate=pro;const version=++acceptVersion
        runtime.unsubscribe?.();runtime.unsubscribe=undefined;runtime.pro=undefined
        pro.getShortcutManager()?.setEnabled(false)
        const current=()=>!runtime.controller.signal.aborted&&version===acceptVersion&&candidate===pro
        accepted=Promise.resolve().then(()=>pro.bindDrawingWorkspace?.(sharedSessions,this.options.resolveDrawingShareKey)).then(()=>{
          if(!current())return
          runtime.pro=pro;this.message(runtime.status,null);pro.getChart()?.resize();this.bindActions(runtime);pro.getShortcutManager()?.setEnabled(runtime.cell.cellId===this.active);if(this.cells.includes(runtime)&&this.replay){this.replay.replaceCell(runtime.cell.cellId,pro);this.replayChanged(this.replay.getState())}if(this.cells.includes(runtime))this.bindRecordGuard(runtime);this.renderReplay()
        }).catch(error=>{if(current())throw error})
        announce()
        return accepted
      }
      const waitCurrent=async()=>{while(accepted){const pending=accepted;try{await pending}catch(error){if(pending===accepted)throw error}if(pending===accepted)return}}
      runtime.unsubscribeReady=runtime.binding.subscribeReady?.(pro=>{void accept(pro).catch(error=>{if(candidate===pro&&!runtime.controller.signal.aborted)this.reason(runtime.status,error)})})
      const initial=runtime.binding.ready.then(pro=>{if(!candidate)void accept(pro).catch(()=>{})},error=>{if(!candidate)throw error})
      const ready=Promise.race([initial,announced]).then(waitCurrent)

      if(strict){const timer=setTimeout(()=>runtime.controller.abort(new DOMException(this.t('workspace_timeout'),'TimeoutError')),30000);try{await this.abortable(ready,runtime.controller.signal)}finally{clearTimeout(timer)}}
      else void ready.catch(e=>{this.reason(runtime.status,e)})
    }catch(e){if(strict){this.disposeCell(runtime);throw e}this.reason(runtime.status,e)}finally{signal?.removeEventListener('abort',cancel)}
    this.pending.delete(runtime)
    return runtime
  }
  private replayBusy(){return !!this.replay&&['loading','seeking','resuming','error'].includes(this.replay.getState().phase)}
  private bindActions(c:Runtime){
    const chart=c.pro?.getChart();if(!chart)return
    const crosshair=(data:unknown)=>{if(this.busy||this.replayBusy()||!this.cells.includes(c)||this.propagating||c.cell.cellId!==this.active||!this.sync.crosshair)return;this.propagating=true;try{for(const target of this.cells)if(target!==c&&target.pro?.getChart()){this.message(target.status,syncCrosshair(chart,target.pro.getChart()!,data as Crosshair)?null:'workspace_missing_timestamp')}}finally{this.propagating=false}}
    const viewport=()=>{if(this.busy||this.replayBusy()||!this.cells.includes(c)||this.propagating||c.cell.cellId!==this.active||!this.sync.viewport)return;const window=visibleTimestamps(chart);if(!window)return;this.propagating=true;try{for(const target of this.cells)if(target!==c&&target.pro?.getChart())this.message(target.status,syncViewport(target.pro.getChart()!,window)?null:'workspace_viewport_unaligned')}finally{this.propagating=false}}
    chart.subscribeAction('onCrosshairChange',crosshair);chart.subscribeAction('onVisibleRangeChange',viewport)
    const leave=()=>{if(c.cell.cellId===this.active&&this.sync.crosshair)for(const target of this.cells)if(target!==c&&target.pro?.getChart())hideCrosshair(target.pro.getChart()!)}
    const dom=chart.getDom();dom?.addEventListener('mouseleave',leave)
    c.unsubscribe=()=>{dom?.removeEventListener('mouseleave',leave);chart.unsubscribeAction('onCrosshairChange',crosshair);chart.unsubscribeAction('onVisibleRangeChange',viewport)}
  }
  private disposeCell(c:Runtime){if(c.disposed)return;c.disposed=true;this.pending.delete(c);this.staged.delete(c);c.controller.abort();if(c.pro)replayParticipant(c.pro)?.setRecordGuard?.();c.unsubscribeReady?.();c.unsubscribe?.();c.binding?.dispose();c.element.remove()}
  setActive(id:string){const c=this.cells.find(c=>c.cell.cellId===id);if(!c)return;this.active=id;for(const item of this.cells){item.element.dataset.active=String(item===c);item.pro?.getShortcutManager()?.setEnabled(item===c&&!this.replayBusy())}this.notify(()=>this.options.onActiveCell?.({...c.cell}))}
  async setLayout(layout:WorkspaceLayout){
    this.replay?.assertIdle()
    if(this.restoreTask)throw this.failure('workspace_busy')
    if(this.initialization)await this.initialization
    if(this.disposed)throw this.failure('workspace_closed')
    if(![1,2,4].includes(layout))throw this.failure('workspace_invalid_layout')
    if(this.busy)throw this.failure('workspace_busy')
    this.assertDrawingIdle(this.cells.slice(layout))
    if(layout!==this.layout){await this.allowReplayReplacement('布局变化会使上次复盘不再适用');this.clearReplayRecord()}
    const seq=++this.operation;this.busy=true
    ++this.alignment
    try{while(this.cells.length<layout){const source=this.cells.find(c=>c.cell.cellId===this.active)??this.cells[0];if(!source)throw this.failure('workspace_primary_not_ready');const id=ids[this.cells.length];const cell=await this.createCell({...source.cell,cellId:id,context:`${this.options.context}:${id}`},this.grid);if(this.disposed||seq!==this.operation){this.disposeCell(cell);return}this.cells.push(cell)}
      for(const c of this.cells.splice(layout))this.disposeCell(c)
      this.layout=layout;this.geometry();this.setActive(this.cells.some(c=>c.cell.cellId===this.active)?this.active:'primary');this.notify(()=>this.options.onLayoutChange?.(layout))
    }finally{this.busy=false}
  }
  private async changeIdentity(c:Runtime,change:Partial<Pick<WorkspaceCell,'symbol'|'period'>>,propagate=true,isCurrent:()=>boolean=()=>true){
    if(this.busy||this.restoreTask)throw this.failure('workspace_busy')
    this.replay?.assertIdle()
    const index=this.cells.indexOf(c);if(index<0)return
    if(change.symbol?.ticker===c.cell.symbol.ticker||change.period&&equalPeriod(change.period,c.cell.period))return
    if(c.transitioning)throw this.failure('workspace_cell_busy')
    if(!isCurrent())return
    this.assertDrawingIdle([c])
    await this.allowReplayReplacement('标的或周期变化会使上次复盘不再适用');this.clearReplayRecord()
    if(propagate)++this.alignment
    const seq=++c.identitySeq
    c.transitioning=true;c.body.inert=true;c.pro?.getShortcutManager()?.setEnabled(false);c.symbolSelect.disabled=true;c.periodSelect.disabled=true
    try{
      const replacement=await this.createCell({...c.cell,...change},this.grid,false,true)
      if(this.disposed||seq!==c.identitySeq||!isCurrent()||!this.cells.includes(c)){this.disposeCell(replacement);return}
      try{this.assertDrawingIdle([c])}catch(e){this.disposeCell(replacement);throw e}
      c.element.replaceWith(replacement.element);this.disposeCell(c);this.cells[index]=replacement;this.publishLabels(replacement);this.geometry();if(propagate)this.setActive(replacement.cell.cellId)
      if(propagate&&this.active===replacement.cell.cellId){if(change.symbol&&this.sync.symbol)await this.align('symbol');if(change.period&&this.sync.period)await this.align('period')}
    }finally{
      c.transitioning=false;c.body.inert=false
      if(this.cells.includes(c)&&!c.disposed){c.symbolSelect.disabled=this.options.symbols.length===0;c.periodSelect.disabled=c.periodSelect.options.length===0;c.pro?.getShortcutManager()?.setEnabled(c.cell.cellId===this.active);this.resetSelectors(c)}
    }
  }
  private async align(key:keyof WorkspaceSync){
    if(this.busy)throw this.failure('workspace_sync_busy')
    const source=this.cells.find(c=>c.cell.cellId===this.active);if(!source)return
    const epoch=this.alignment,seq=++this.syncVersion[key],isCurrent=()=>!this.disposed&&epoch===this.alignment&&seq===this.syncVersion[key]&&source.cell.cellId===this.active
    const action=this.alignmentTail.catch(()=>{}).then(async()=>{
    for(const c of [...this.cells])if(c!==source&&isCurrent()){
      if(key==='symbol'||key==='period'){
        if(key==='period'){const available=await this.options.getPeriods(c.cell.symbol,c.controller.signal);if(!available.some(p=>equalPeriod(p,source.cell.period))){this.message(c.status,'workspace_period_unsynced');continue}}
        if(isCurrent())await this.changeIdentity(c,{[key]:source.cell[key]},false,isCurrent)
      }
      else if(key==='viewport'){const w=source.pro?.getChart()&&visibleTimestamps(source.pro.getChart()!);if(w&&c.pro?.getChart())this.message(c.status,syncViewport(c.pro.getChart()!,w)?null:'workspace_viewport_unaligned')}
    }
    })
    this.alignmentTail=action
    await action
  }
  capture():WorkspaceDocument {
    this.replay?.assertStable()
    if(this.busy||this.cells.length!==this.layout||this.cells.some(c=>c.transitioning))throw this.failure('workspace_not_ready')
    const cells=this.cells.map(c=>{if(!c.pro)throw this.failure('workspace_cell_not_ready',{id:c.cell.cellId});if(c.pro.getDrawingHistoryState().pending||c.pro.getDrawingHistoryState().uncertainLogicalIds.length)throw this.failure('workspace_drawing_save');const options=c.binding?.captureOptions?.()??{};return {...c.cell,chart:captureLayout(c.pro,{...options,localDrawingIds:[...(options.localDrawingIds??[]),...c.restoredIds,...c.pro.getDrawings().filter(d=>d.owner==='local').map(d=>d.logicalId)],context:{ticker:c.cell.symbol.ticker,period:{multiplier:c.cell.period.multiplier,timespan:c.cell.period.timespan}}})}})
    const record=this.getReplayRecord()
    const doc:WorkspaceDocument={version:3,...(record?{replaySession:record}:{}),sharedDrawings:this.sharedSessions.capture(),layout:this.layout,activeCellId:this.active,sync:{...this.sync},columnRatio:this.columnRatio,rowRatio:this.rowRatio,cells}
    if(!isWorkspaceDocument(doc))throw this.failure('workspace_invalid_save')
    return doc
  }
  private storageFailure(code:ConstructorParameters<typeof WorkspaceStoreError>[0],message:string):WorkspaceStoreError{return new WorkspaceStoreError(code,message)}
  private copy<T>(value:T):T{return structuredClone(value)}
  private summary(value:WorkspaceSummary):WorkspaceSummary {
    if(!value||typeof value.id!=='string'||!value.id||typeof value.revision!=='string'||!value.revision||!Number.isFinite(value.updatedAt)||typeof value.name!=='string'||value.name!==value.name.trim()||!value.name.length||value.name.length>80)throw this.storageFailure('WORKSPACE_INVALID_DOCUMENT',this.t('workspace_corrupt'))
    return {id:value.id,name:value.name,revision:value.revision,updatedAt:value.updatedAt}
  }
  private stored(value:StoredWorkspace,id:string):StoredWorkspace {
    value={...value,document:migrateWorkspaceDocument(value.document)}
    const summary=this.summary(value)
    if(summary.id!==id||!isWorkspaceDocument(value.document)||value.document.cells.some(c=>c.context!==(c.cellId==='primary'?this.options.context:`${this.options.context}:${c.cellId}`)))throw this.storageFailure('WORKSPACE_INVALID_DOCUMENT',this.t('workspace_invalid_document'))
    // Migration already owns a private copy; retain the full check above without cloning again.
    return {...summary,document:value.document}
  }
  private name(value:string):string {const name=value.trim();if(!name||name.length>80)throw this.storageFailure('WORKSPACE_INVALID_DOCUMENT',this.t('workspace_name_invalid'));return name}
  private renderSaved():void {
    if(!this.savedSelect)return
    this.savedSelect.replaceChildren(new Option(this.t(this.saved.length?'workspace_choose_saved':'workspace_no_saved'),''))
    for(const item of this.saved)this.savedSelect.add(new Option(`${item.name} · ${new Date(item.updatedAt).toLocaleString(this.options.locale)}`,item.id))
    this.savedSelect.value=this.selected?.id??''
    this.updateStoreControls()
  }
  private updateStoreControls():void {
    const unavailable=!this.options.store,pending=!!this.io||!!this.restoreTask,unknown=!!this.unknownWrite
    this.savedSelect.disabled=unavailable||pending||unknown||!this.saved.length
    this.nameInput.disabled=unavailable||pending||unknown
    for(const button of this.storeButtons){const action=button.dataset.storageAction
      button.disabled=action==='workspace_cancel'?!pending:unavailable||pending||unknown&&!['workspace_refresh','workspace_storage_retry'].includes(action!)||['workspace_save','workspace_load','workspace_rename','workspace_delete'].includes(action!)&&!this.selected
    }
  }
  private async runStorage<T>(kind:'read'|'write',work:(store:WorkspaceStore,signal:AbortSignal)=>Promise<T>):Promise<T> {
    if(this.disposed)throw this.failure('workspace_closed')
    const store=this.options.store;if(!store)throw this.failure('workspace_storage_disabled')
    if(kind==='write'&&this.unknownWrite)throw this.storageFailure('WORKSPACE_STORE_UNAVAILABLE',this.t('workspace_result_unknown'))
    if(this.io){if(this.io.kind==='write'||kind==='write')throw this.failure('workspace_busy');this.io.controller.abort()}
    const io={controller:new AbortController(),kind};this.io=io;this.updateStoreControls();this.message(this.notice,'workspace_storage_pending')
    const timeout=setTimeout(()=>io.controller.abort(new DOMException('Workspace store timed out','TimeoutError')),30000)
    try{const result=await this.abortable(work(store,io.controller.signal),io.controller.signal);if(this.disposed||this.io!==io)throw new DOMException('Workspace operation cancelled','AbortError');return result}
    finally{clearTimeout(timeout);if(this.io===io){this.io=undefined;this.updateStoreControls()}}
  }
  private abortable<T>(work:Promise<T>,signal:AbortSignal):Promise<T> {
    return new Promise((resolve,reject)=>{const cleanup=()=>signal.removeEventListener('abort',cancel),cancel=()=>{cleanup();reject(signal.reason??new DOMException('Workspace operation cancelled','AbortError'))};if(signal.aborted){cancel();return}signal.addEventListener('abort',cancel,{once:true});work.then(value=>{cleanup();if(signal.aborted)cancel();else resolve(value)},error=>{cleanup();reject(error)})})
  }
  async listSaved():Promise<WorkspaceSummary[]> {
    return this.runStorage('read',async(store,signal)=>{const values=(await this.abortable(store.list(this.options.context,signal),signal)).map(value=>this.summary(value));if(new Set(values.map(v=>v.id)).size!==values.length)throw this.storageFailure('WORKSPACE_INVALID_DOCUMENT',this.t('workspace_corrupt'));signal.throwIfAborted();this.saved=values;if(this.selected&&!values.some(v=>v.id===this.selected!.id))this.selected=undefined;this.renderSaved();this.message(this.notice,values.length?'workspace_manual_save':'workspace_no_saved');return this.copy(values)})
  }
  private acceptStored(value:StoredWorkspace,select=true):WorkspaceSummary {
    if(select&&this.jsonEqual(value.document.replaySession??null,this.getReplayRecord())){this.replayRecordSaved=!!value.document.replaySession;this.replayUnsaved=false}
    const summary=this.summary(value);if(select||this.selected?.id===summary.id)this.selected=summary;this.saved=[summary,...this.saved.filter(v=>v.id!==summary.id)];if(select)this.nameInput.value=summary.name;this.renderSaved();this.message(this.notice,'workspace_saved');this.renderReplay();return this.copy(summary)
  }
  private async writeInput(input:WorkspaceWrite,select=true):Promise<WorkspaceSummary> {
    this.lastStorageAction=()=>this.writeInput(input,select)
    try{return await this.runStorage('write',async(store,signal)=>{
      return this.persistInput(store,signal,input,select)
    })}finally{this.updateStoreControls()}
  }
  private async persistInput(store:WorkspaceStore,signal:AbortSignal,input:WorkspaceWrite,select=true):Promise<WorkspaceSummary> {
    try {const result=this.stored(await this.abortable(store.write(this.options.context,this.copy(input),signal),signal),input.id);signal.throwIfAborted();if(result.name!==input.name||!this.jsonEqual(result.document,input.document))throw this.storageFailure('WORKSPACE_INVALID_DOCUMENT',this.t('workspace_confirmation_mismatch'));return this.acceptStored(result,select)}
    catch(error){if(!(error instanceof WorkspaceStoreError)||!['WORKSPACE_CONFLICT','WORKSPACE_INVALID_DOCUMENT','WORKSPACE_NOT_FOUND'].includes(error.code)){this.unknownWrite={kind:'write',input:this.copy(input),select};this.message(this.notice,'workspace_result_unknown')}throw error}
    finally{this.updateStoreControls()}
  }
  async saveAs(name:string):Promise<WorkspaceSummary> {if(this.initialization)await this.initialization;return this.writeInput({kind:'create',id:createOpaqueId(),name:this.name(name),document:this.capture()})}
  async save():Promise<WorkspaceSummary> {if(!this.selected)throw this.failure('workspace_choose_saved');const selected=this.copy(this.selected);return this.writeInput({kind:'update',id:selected.id,expectedRevision:selected.revision,name:selected.name,document:this.capture()})}
  async load(id:string):Promise<void> {
    if(!id)throw this.failure('workspace_choose_saved')
    this.deleteDialog?.remove()
    this.lastStorageAction=()=>this.load(id)
    if(this.io?.kind==='write')throw this.failure('workspace_busy')
    const sequence=++this.loadSequence
    if(this.restoreTask){this.restoreController?.abort();try{await this.restoreTask}catch{} }
    const stored=await this.runStorage('read',async(store,signal)=>{const raw=await this.abortable(store.read(this.options.context,id,signal),signal);if(!raw)throw this.storageFailure('WORKSPACE_NOT_FOUND',this.t('workspace_no_saved'));await yieldTask();signal.throwIfAborted();return this.stored(raw,id)})
    const current=()=>sequence===this.loadSequence&&!this.disposed
    if(!current())throw new DOMException('Workspace load cancelled','AbortError')
    await this.restoreDocument(stored.document,current,undefined,true)
    if(!current())throw new DOMException('Workspace load cancelled','AbortError')
    this.selected=this.summary(stored);this.nameInput.value=stored.name;this.renderSaved();this.message(this.notice,'workspace_restored')
  }
  async renameSaved(id:string,name:string):Promise<WorkspaceSummary> {
    name=this.name(name);const expected=this.selected?.id===id?this.selected:this.saved.find(v=>v.id===id)
    return this.runStorage('write',async(store,signal)=>{
      const raw=await this.abortable(store.read(this.options.context,id,signal),signal);if(!raw)throw this.storageFailure('WORKSPACE_NOT_FOUND',this.t('workspace_no_saved'));const stored=this.stored(raw,id);if(expected&&expected.revision!==stored.revision)throw this.storageFailure('WORKSPACE_CONFLICT',this.t('workspace_conflict'))
      const input:WorkspaceWrite={kind:'update',id,expectedRevision:stored.revision,name,document:stored.document},select=this.selected?.id===id;this.lastStorageAction=()=>this.writeInput(input,select)
      return this.persistInput(store,signal,input,select)
    })
  }
  async deleteSaved(id:string):Promise<void> {
    if(!id)throw this.failure('workspace_choose_saved')
    const expected=this.selected?.id===id?this.copy(this.selected):this.saved.find(v=>v.id===id)
    this.lastStorageAction=()=>this.deleteSaved(id)
    try{return await this.runStorage('write',async(store,signal)=>{
      let revision=expected?.revision
      if(!revision){const raw=await this.abortable(store.read(this.options.context,id,signal),signal);if(!raw)throw this.storageFailure('WORKSPACE_NOT_FOUND',this.t('workspace_no_saved'));revision=this.stored(raw,id).revision}
      try{await this.abortable(store.remove(this.options.context,id,revision,signal),signal);signal.throwIfAborted();this.saved=this.saved.filter(v=>v.id!==id);if(this.selected?.id===id)this.selected=undefined;this.renderSaved();this.message(this.notice,'workspace_deleted')}
      catch(error){if(!(error instanceof WorkspaceStoreError)||!['WORKSPACE_CONFLICT','WORKSPACE_NOT_FOUND','WORKSPACE_INVALID_DOCUMENT'].includes(error.code)){this.unknownWrite={kind:'remove',id};this.message(this.notice,'workspace_result_unknown')}throw error}
    })}finally{this.updateStoreControls()}
  }
  private async confirmPending():Promise<void> {
    const pending=this.unknownWrite;if(!pending){await this.listSaved();return}
    await this.runStorage('read',async(store,signal)=>{const id=pending.kind==='write'?pending.input.id:pending.id,raw=await this.abortable(store.read(this.options.context,id,signal),signal),stored=raw?this.stored(raw,id):null;signal.throwIfAborted()
      if(pending!==this.unknownWrite)return
      if(pending.kind==='write'&&stored&&stored.name===pending.input.name&&this.jsonEqual(stored.document,pending.input.document)){this.unknownWrite=undefined;this.acceptStored(stored,pending.select);return}
      if(pending.kind==='remove'&&!stored){this.unknownWrite=undefined;this.saved=this.saved.filter(v=>v.id!==id);if(this.selected?.id===id)this.selected=undefined;this.renderSaved();this.message(this.notice,'workspace_deleted');return}
      this.unknownWrite=undefined;this.updateStoreControls();throw this.storageFailure(stored?'WORKSPACE_CONFLICT':'WORKSPACE_NOT_FOUND',this.t('workspace_confirmation_mismatch'))
    })
  }
  private jsonEqual(a:unknown,b:unknown):boolean {const stable=(v:unknown):string=>JSON.stringify(v,(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]])):value);return stable(a)===stable(b)}
  async importLegacy(name:string):Promise<WorkspaceSummary> {
    const primary=this.cells[0]?.cell??{symbol:this.options.initialSymbol,period:this.options.initialPeriod??{multiplier:1,timespan:'day',text:'1d'}}
    const document=readLegacyWorkspace(this.options.context,{symbols:this.options.symbols,fallback:primary});if(!document)throw this.failure('workspace_no_legacy')
    return this.writeInput({kind:'create',id:createOpaqueId(),name:this.name(name),document},false)
  }
  private confirmDelete():void {
    const selected=this.selected;if(!selected)return
    this.deleteDialog?.remove();const dialog=document.createElement('div');dialog.setAttribute('role','alertdialog');this.aria(dialog,'workspace_delete_confirm');dialog.append(this.caption('workspace_delete_target',{name:selected.name}))
    for(const confirm of [true,false]){const button=document.createElement('button');button.type='button';this.message(button,confirm?'workspace_confirm':'workspace_cancel');button.onclick=()=>{dialog.remove();if(confirm)void this.deleteSaved(selected.id).catch(e=>this.error(e))};dialog.append(button)}
    this.deleteDialog=dialog;this.root.insertBefore(dialog,this.notice)
  }
  async restore(doc:WorkspaceDocument,isCurrent:()=>boolean=()=>true,signal?:AbortSignal){
    return this.restoreDocument(doc,isCurrent,signal)
  }
  private async restoreDocument(doc:WorkspaceDocument,isCurrent:()=>boolean,signal?:AbortSignal,ownsDocument=false){
    if(this.restoreTask)throw this.failure('workspace_busy')
    const controller=new AbortController();this.restoreController=controller
    const task=this.performRestore(doc,isCurrent,signal?AbortSignal.any([signal,controller.signal]):controller.signal,ownsDocument).finally(()=>{if(this.restoreTask===task){this.restoreTask=undefined;this.restoreController=undefined;this.updateStoreControls();this.replayProjection='';if(this.options.replay?.enabled)this.replayChanged(this.getReplayState())}})
    this.restoreTask=task;this.updateStoreControls();if(this.options.replay?.enabled)this.replayChanged(this.getReplayState());return task
  }
  private async performRestore(doc:WorkspaceDocument,isCurrent:()=>boolean,signal?:AbortSignal,ownsDocument=false){
    if(this.initialization)await this.initialization
    if(this.disposed)throw this.failure('workspace_closed')
    if(this.busy)throw this.failure('workspace_busy')
    this.replay?.assertStable();this.replay?.pause()
    if(!isCurrent())throw new DOMException('Workspace load cancelled','AbortError')
    if(this.cells.some(c=>c.pro&&(c.pro.getDrawingHistoryState().pending||c.pro.getDrawingHistoryState().uncertainLogicalIds.length)))throw this.failure('workspace_drawing_load')
    // Only load() can transfer the private copy already migrated and checked by stored().
    // Independent public restore() calls still validate and detach their complete input.
    if(!ownsDocument)try{doc=migrateWorkspaceDocument(doc)}catch{throw this.failure('workspace_invalid_document')}
    if(doc.cells.reduce((n,c)=>n+c.chart.drawings.length,0)>=128){
      await yieldTask()
      if(this.disposed||!isCurrent())throw new DOMException('Workspace load cancelled','AbortError')
      if(this.busy)throw this.failure('workspace_busy')
      this.assertDrawingIdle(this.cells)
    }
    for(const cell of doc.cells){if(!this.options.symbols.some(s=>s.ticker===cell.symbol.ticker))throw this.failure('workspace_symbol_missing',{ticker:cell.symbol.ticker});const context=cell.cellId==='primary'?this.options.context:`${this.options.context}:${cell.cellId}`;if(cell.context!==context)throw this.failure('workspace_context_mismatch')}
    await this.allowReplayReplacement('打开工作台将替换当前复盘记录',signal,doc.replaySession)
    signal?.throwIfAborted();if(this.disposed||!isCurrent())throw new DOMException('Workspace load cancelled','AbortError')
    if(doc.replaySession?.mode==='paused'&&!this.options.replay?.enabled)throw new WorkspaceReplayError('UNSUPPORTED','当前宿主未启用工作台复盘，原工作台保留')
    const stagedSessions=new DrawingSessionRegistry({scope:'workspace',documents:doc.sharedDrawings})
    this.busy=true;for(const c of this.cells){c.body.inert=true;c.pro?.getShortcutManager()?.setEnabled(false)}++this.alignment;const staged:Runtime[]=[];const stage=document.createElement('div');stage.style.cssText='position:absolute;visibility:hidden;pointer-events:none;width:'+this.grid.clientWidth+'px';this.root.append(stage)
    const retained=this.cells,gridColumns=this.grid.style.gridTemplateColumns,gridRows=this.grid.style.gridTemplateRows
    let stagedReplay:WorkspaceReplayController|undefined,adopted=false,placed=false
    const cancelReplay=()=>stagedReplay?.dispose();signal?.addEventListener('abort',cancelReplay,{once:true})
    try{
      for(const cell of doc.cells){if(!isCurrent())throw new DOMException('Workspace load cancelled','AbortError');const c=await this.createCell(cell,stage,true,false,signal,stagedSessions);staged.push(c);if(cell.chart.drawings.length>=128)await yieldTask();if(this.disposed||!isCurrent())throw new DOMException('Workspace load cancelled','AbortError');if(!c.pro)throw this.failure('workspace_restored_not_ready');await this.abortable(restoreLayout(c.pro,cell.chart),signal??c.controller.signal);c.restoredIds=cell.chart.drawings.map(d=>d.logicalId)}
      if(this.disposed||!isCurrent())throw new DOMException('Workspace load cancelled','AbortError')
      if(doc.replaySession){
        const record=doc.replaySession
        stagedReplay=this.newReplay(()=>adopted?this.cells:staged,()=>adopted?this.active:doc.activeCellId,state=>{if(adopted)this.replayChanged(state)})
        stagedReplay.setRecord(record)
        if(record.mode==='paused')await this.abortable(stagedReplay.resume(),signal??staged[0].controller.signal)
        else for(const c of staged){const participant=replayParticipant(c.pro!);if(!participant)throw new WorkspaceReplayError('UNSUPPORTED','图表不能恢复已保存的比较成员',{cellId:c.cell.cellId});await participant.restoreLiveComparisons(record.participants.find(p=>p.cellId===c.cell.cellId)!,signal??c.controller.signal)}
      }
      if(this.disposed||!isCurrent()||signal?.aborted)throw new DOMException('Workspace load cancelled','AbortError')
      this.assertDrawingIdle(this.cells)
      for(const c of retained)stage.append(c.element)
      placed=true
      for(const c of staged){this.grid.append(c.element);this.publishLabels(c)}
      this.grid.style.gridTemplateColumns=doc.layout===1?'minmax(0,1fr)':`minmax(0,${doc.columnRatio}fr) minmax(0,${100-doc.columnRatio}fr)`
      this.grid.style.gridTemplateRows=doc.layout===4?`minmax(240px,${doc.rowRatio}fr) minmax(240px,${100-doc.rowRatio}fr)`:'minmax(240px,1fr)'
      for(const c of staged){c.pro?.getChart()?.resize();const viewport=doc.cells.find(saved=>saved.cellId===c.cell.cellId)?.chart.viewport;if(viewport&&c.pro?.getChart()&&!syncViewport(c.pro.getChart()!,{from:viewport.fromTimestamp,to:viewport.toTimestamp}))this.message(c.status,'workspace_restored_viewport_limited')}
      if(doc.replaySession)await Promise.all(staged.map(c=>waitChartPaint(c.pro!.getChart()!,signal??c.controller.signal)))
      signal?.throwIfAborted();if(this.disposed||!isCurrent())throw new DOMException('Workspace load cancelled','AbortError')
      this.assertDrawingIdle(retained)
      this.replay?.dispose();this.replay=stagedReplay;adopted=true
      this.replayRecordSaved=!!doc.replaySession;this.replayUnsaved=false
      for(const c of retained)this.disposeCell(c)
      this.cells=staged;for(const c of staged){this.staged.delete(c);this.bindRecordGuard(c)}
      this.sharedSessions.dispose();this.sharedSessions=stagedSessions
      this.layout=doc.layout;this.sync={...doc.sync};this.columnRatio=doc.columnRatio;this.rowRatio=doc.rowRatio
      for(const control of this.controls)control.checked=this.sync[control.dataset.sync as keyof WorkspaceSync]
      for(const [key,value] of [['columnRatio',this.columnRatio],['rowRatio',this.rowRatio]] as const)(this.root.querySelector(`[data-ratio="${key}"]`) as HTMLInputElement).value=String(value)
      this.layoutSelect.value=String(this.layout);this.setActive(doc.activeCellId);this.notify(()=>this.options.onLayoutChange?.(doc.layout));this.message(this.notice,'workspace_restored')
    }catch(e){if(!adopted){stagedReplay?.dispose();for(const c of staged)this.disposeCell(c);stagedSessions.dispose();if(placed&&!this.disposed){this.grid.style.gridTemplateColumns=gridColumns;this.grid.style.gridTemplateRows=gridRows;for(const c of retained){this.grid.append(c.element);c.pro?.getChart()?.resize()}}}throw e}finally{signal?.removeEventListener('abort',cancelReplay);stage.remove();this.busy=false;for(const c of this.cells){c.body.inert=false;c.pro?.getShortcutManager()?.setEnabled(c.cell.cellId===this.active)}}
  }
  private assertDrawingIdle(cells:Runtime[]){if(cells.some(c=>c.pro&&(c.pro.getDrawingHistoryState().pending||c.pro.getDrawingHistoryState().uncertainLogicalIds.length)))throw this.failure('workspace_drawing_switch')}
  getCells(){return this.cells.map(c=>({...c.cell,chart:c.pro}))}
  private publishLabels(c:Runtime){c.element.style.display='flex';c.element.dataset.cellId=c.cell.cellId;this.aria(c.symbolSelect,'workspace_symbol',{id:c.cell.cellId});this.aria(c.periodSelect,'workspace_period',{id:c.cell.cellId})}
  private resetSelectors(c:Runtime){c.symbolSelect.value=c.cell.symbol.ticker;c.periodSelect.value=[...c.periodSelect.options].find(o=>equalPeriod(JSON.parse(o.value),c.cell.period))?.value??''}
  dispose(){this.disposed=true;this.restoreController?.abort();this.replayNotes?.dispose();this.replayDialog?.cancel();this.replay?.dispose();this.replay=undefined;this.replayListeners.clear();this.io?.controller.abort();this.deleteDialog?.remove();++this.operation;this.observer?.disconnect();for(const c of [...this.cells,...this.pending,...this.staged])this.disposeCell(c);this.cells=[];this.sharedSessions.dispose();this.root.remove()}
}
