import type { Chart, Crosshair } from 'klinecharts'
import type { ChartPro, Period, SymbolInfo } from '../types'
import {captureLayout,isChartLayoutV3,restoreLayout,loadLayoutV3} from '../persistence/v3'
import {jsonSafe} from '../persistence/v2'
import {hideCrosshair,syncCrosshair,syncViewport,visibleTimestamps} from './viewportSync'
import translate from '../i18n'
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

export function isWorkspaceDocument(value:unknown):value is WorkspaceDocument {
  if(!value||typeof value!=='object'||!jsonSafe(value))return false
  const d=value as WorkspaceDocument
  return d.version===1&&[1,2,4].includes(d.layout)&&Array.isArray(d.cells)&&d.cells.length===d.layout
    &&d.cells.every((c,i)=>c.cellId===ids[i]&&typeof c.context==='string'&&typeof c.symbol?.ticker==='string'&&!!c.symbol.ticker
      &&typeof c.period?.timespan==='string'&&Number.isInteger(c.period.multiplier)&&c.period.multiplier>0&&isChartLayoutV3(c.chart)
      &&c.chart.context?.ticker===c.symbol.ticker&&c.chart.context?.period?.multiplier===c.period.multiplier&&c.chart.context?.period?.timespan===c.period.timespan)
    &&d.cells.some(c=>c.cellId===d.activeCellId)&&!!d.sync&&Object.keys(emptySync()).every(k=>typeof d.sync[k as keyof WorkspaceSync]==='boolean')
    &&[d.columnRatio,d.rowRatio].every(n=>Number.isFinite(n)&&n>=25&&n<=75)
}

/** The host owns data and persistence; this class owns all workspace interaction. */
export class ChartWorkspace {
  private options:ChartWorkspaceOptions
  private root:HTMLElement
  private grid:HTMLElement
  private notice:HTMLElement
  private cells:Runtime[]=[]
  private pending=new Set<Runtime>()
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
    for(const [key,action] of [['workspace_save',()=>this.save()],['workspace_load',()=>this.load()],['workspace_delete',()=>this.deleteSaved()]] as const){
      const button=document.createElement('button');this.message(button,key);button.type='button';button.disabled=!options.storage
      button.onclick=()=>void Promise.resolve().then(action).catch(e=>this.error(e));storageGroup.append(button)
    }
    for(const key of ['columnRatio','rowRatio'] as const){
      const label=document.createElement('label'),input=document.createElement('input');input.type='range';input.min='25';input.max='75';input.value='50';input.dataset.ratio=key;this.aria(input,`workspace_${key}`)
      input.oninput=()=>{this[key]=Number(input.value);this.geometry()};label.append(this.caption(`workspace_${key}`),input);sizeGroup.append(label)
    }
    this.notice=document.createElement('div');this.notice.className='tc-workspace-notice';this.notice.setAttribute('role','status')
    this.grid=document.createElement('div');this.grid.className='tc-workspace-grid'
    this.root.append(style,toolbar,this.notice,this.grid);options.container.append(this.root)
    if(typeof ResizeObserver!=='undefined'){this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(this.grid)}
    this.initialization=this.createCell({cellId:'primary',symbol:options.initialSymbol,period:options.initialPeriod??{multiplier:1,timespan:'day',text:'1d'},context:options.context},this.grid).then(c=>{
      if(this.disposed){this.disposeCell(c);return}this.cells=[c];this.geometry();this.setActive('primary');this.options.onLayoutChange?.(this.layout)
    }).catch(e=>this.error(e)).finally(()=>{this.initialization=undefined;this.busy=false})
  }
  private t(key:string,values:MessageValues={}){return translate(key,this.options.locale!).replace(/\{(\w+)\}/g,(match,name)=>String(values[name]??match))}
  private caption(key:string,values:MessageValues={}){const span=document.createElement('span');this.message(span,key,values);return span}
  private message(element:HTMLElement,key:string|null,values:MessageValues={}){
    if(key){element.dataset.i18n=key;element.dataset.i18nValues=JSON.stringify(values);element.textContent=this.t(key,values)}
    else {delete element.dataset.i18n;delete element.dataset.i18nValues;element.textContent=''}
  }
  private aria(element:HTMLElement,key:string,values:MessageValues={}){element.dataset.i18nAria=key;element.dataset.i18nAriaValues=JSON.stringify(values);element.setAttribute('aria-label',this.t(key,values))}
  private failure(key:string,values:MessageValues={}){return new WorkspaceError(key,values,this.t(key,values))}
  private reason(element:HTMLElement,reason:unknown){if(reason instanceof WorkspaceError)this.message(element,reason.key,reason.values);else {this.message(element,null);element.textContent=reason instanceof Error?reason.message:String(reason)}}
  private validateHeight(height:number|'100%'){if(height!=='100%'&&(!Number.isFinite(height)||height<=0))throw this.failure('workspace_invalid_height')}
  setLocale(locale:string){
    this.options.locale=locale;this.root.dataset.locale=locale
    for(const element of this.root.querySelectorAll<HTMLElement>('[data-i18n]'))this.message(element,element.dataset.i18n!,JSON.parse(element.dataset.i18nValues??'{}'))
    for(const element of this.root.querySelectorAll<HTMLElement>('[data-i18n-aria]'))this.aria(element,element.dataset.i18nAria!,JSON.parse(element.dataset.i18nAriaValues??'{}'))
    this.resize()
  }
  setTheme(theme:string){this.options.theme=theme;this.root.dataset.theme=theme;this.resize()}
  resize(height?:number|'100%'){
    if(this.disposed)return
    if(height!==undefined){this.validateHeight(height);this.options.height=height;this.root.style.height=typeof height==='number'?`${height}px`:height}
    for(const cell of this.cells)cell.pro?.getChart()?.resize()
  }
  private key(){return this.options.storageKey??`trading-chest-workspace-v1-${this.options.context}`}
  private error(reason:unknown){if(this.disposed)return;const error=reason instanceof Error?reason:new Error(String(reason));this.reason(this.notice,error);this.options.onError?.(error)}
  private geometry(){
    this.grid.style.gridTemplateColumns=this.layout===1?'minmax(0,1fr)':`minmax(0,${this.columnRatio}fr) minmax(0,${100-this.columnRatio}fr)`
    this.grid.style.gridTemplateRows=this.layout===4?`minmax(240px,${this.rowRatio}fr) minmax(240px,${100-this.rowRatio}fr)`:'minmax(240px,1fr)'
    for(const c of this.cells)c.pro?.getChart()?.resize()
    this.layoutSelect.value=String(this.layout)
  }
  private async createCell(cell:WorkspaceCell,parent:HTMLElement,strict=false,staged=false):Promise<Runtime>{
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
    retry.onclick=()=>void (runtime.pro?runtime.pro.reloadData({preserveViewport:true}):this.changeIdentity(runtime,{})).catch(e=>this.error(e))
    this.pending.add(runtime)
    element.onpointerdown=()=>this.setActive(cell.cellId);element.addEventListener('focusin',()=>this.setActive(cell.cellId))
    element.addEventListener('keydown',event=>{if(!this.busy&&!runtime.transitioning&&runtime.cell.cellId===this.active)runtime.pro?.getShortcutManager()?.getHandler()?.(event)})
    symbolSelect.onchange=()=>{const symbol=this.options.symbols.find(s=>s.ticker===symbolSelect.value);if(symbol)void this.changeIdentity(runtime,{symbol}).catch(e=>{this.resetSelectors(runtime);this.error(e)})}
    periodSelect.onchange=()=>{const value=JSON.parse(periodSelect.value) as Period;void this.changeIdentity(runtime,{period:value}).catch(e=>{this.resetSelectors(runtime);this.error(e)})}
    try{
      const periods=await this.options.getPeriods(cell.symbol,runtime.controller.signal)
      runtime.controller.signal.throwIfAborted()
      if(!periods.length)throw this.failure('workspace_no_periods',{ticker:cell.symbol.ticker})
      if(!periods.some(p=>equalPeriod(p,cell.period))){if(strict)throw this.failure('workspace_stale_period',{ticker:cell.symbol.ticker});runtime.cell.period=periods[0]}
      for(const period of periods)periodSelect.add(new Option(period.text,JSON.stringify(period)))
      periodSelect.value=JSON.stringify(periods.find(p=>equalPeriod(p,runtime.cell.period)));periodSelect.disabled=false
      runtime.binding=this.options.mountCell(body,runtime.cell,runtime.controller.signal)
      const accept=(pro:ChartPro)=>{if(runtime.controller.signal.aborted||runtime.pro===pro)return;runtime.unsubscribe?.();runtime.pro=pro;this.message(runtime.status,null);pro.getChart()?.resize();this.bindActions(runtime);pro.getShortcutManager()?.setEnabled(runtime.cell.cellId===this.active)}
      runtime.unsubscribeReady=runtime.binding.subscribeReady?.(accept)
      const ready=runtime.binding.ready.then(accept)
      if(strict)await Promise.race([ready,new Promise<never>((_,reject)=>{const timer=setTimeout(()=>reject(this.failure('workspace_timeout')),30000);ready.finally(()=>clearTimeout(timer)).catch(()=>{})})])
      else void ready.catch(e=>{this.reason(runtime.status,e)})
    }catch(e){if(strict){this.disposeCell(runtime);throw e}this.reason(runtime.status,e)}
    this.pending.delete(runtime)
    return runtime
  }
  private bindActions(c:Runtime){
    const chart=c.pro?.getChart();if(!chart)return
    const crosshair=(data:unknown)=>{if(this.busy||!this.cells.includes(c)||this.propagating||c.cell.cellId!==this.active||!this.sync.crosshair)return;this.propagating=true;try{for(const target of this.cells)if(target!==c&&target.pro?.getChart()){this.message(target.status,syncCrosshair(chart,target.pro.getChart()!,data as Crosshair)?null:'workspace_missing_timestamp')}}finally{this.propagating=false}}
    const viewport=()=>{if(this.busy||!this.cells.includes(c)||this.propagating||c.cell.cellId!==this.active||!this.sync.viewport)return;const window=visibleTimestamps(chart);if(!window)return;this.propagating=true;try{for(const target of this.cells)if(target!==c&&target.pro?.getChart())this.message(target.status,syncViewport(target.pro.getChart()!,window)?null:'workspace_viewport_unaligned')}finally{this.propagating=false}}
    chart.subscribeAction('onCrosshairChange',crosshair);chart.subscribeAction('onVisibleRangeChange',viewport)
    const leave=()=>{if(c.cell.cellId===this.active&&this.sync.crosshair)for(const target of this.cells)if(target!==c&&target.pro?.getChart())hideCrosshair(target.pro.getChart()!)}
    const dom=chart.getDom();dom?.addEventListener('mouseleave',leave)
    c.unsubscribe=()=>{dom?.removeEventListener('mouseleave',leave);chart.unsubscribeAction('onCrosshairChange',crosshair);chart.unsubscribeAction('onVisibleRangeChange',viewport)}
  }
  private disposeCell(c:Runtime){if(c.disposed)return;c.disposed=true;this.pending.delete(c);c.controller.abort();c.unsubscribeReady?.();c.unsubscribe?.();c.binding?.dispose();c.element.remove()}
  setActive(id:string){const c=this.cells.find(c=>c.cell.cellId===id);if(!c)return;this.active=id;for(const item of this.cells){item.element.dataset.active=String(item===c);item.pro?.getShortcutManager()?.setEnabled(item===c)}this.options.onActiveCell?.({...c.cell})}
  async setLayout(layout:WorkspaceLayout){
    if(this.initialization)await this.initialization
    if(this.disposed)throw this.failure('workspace_closed')
    if(![1,2,4].includes(layout))throw this.failure('workspace_invalid_layout')
    if(this.busy)throw this.failure('workspace_busy')
    this.assertDrawingIdle(this.cells.slice(layout))
    const seq=++this.operation;this.busy=true
    ++this.alignment
    try{while(this.cells.length<layout){const source=this.cells.find(c=>c.cell.cellId===this.active)??this.cells[0];if(!source)throw this.failure('workspace_primary_not_ready');const id=ids[this.cells.length];const cell=await this.createCell({...source.cell,cellId:id,context:`${this.options.context}:${id}`},this.grid);if(this.disposed||seq!==this.operation){this.disposeCell(cell);return}this.cells.push(cell)}
      for(const c of this.cells.splice(layout))this.disposeCell(c)
      this.layout=layout;this.geometry();this.setActive(this.cells.some(c=>c.cell.cellId===this.active)?this.active:'primary');this.options.onLayoutChange?.(layout)
    }finally{this.busy=false}
  }
  private async changeIdentity(c:Runtime,change:Partial<Pick<WorkspaceCell,'symbol'|'period'>>,propagate=true,isCurrent:()=>boolean=()=>true){
    if(this.busy)throw this.failure('workspace_busy')
    const index=this.cells.indexOf(c);if(index<0)return
    if(change.symbol?.ticker===c.cell.symbol.ticker||change.period&&equalPeriod(change.period,c.cell.period))return
    if(c.transitioning)throw this.failure('workspace_cell_busy')
    if(!isCurrent())return
    this.assertDrawingIdle([c])
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
    if(this.busy||this.cells.length!==this.layout||this.cells.some(c=>c.transitioning))throw this.failure('workspace_not_ready')
    const cells=this.cells.map(c=>{if(!c.pro)throw this.failure('workspace_cell_not_ready',{id:c.cell.cellId});if(c.pro.getDrawingHistoryState().pending)throw this.failure('workspace_drawing_save');const options=c.binding?.captureOptions?.()??{};return {...c.cell,chart:captureLayout(c.pro,{...options,localDrawingIds:[...(options.localDrawingIds??[]),...c.restoredIds,...c.pro.getDrawings().filter(d=>d.owner==='local').map(d=>d.logicalId)],context:{ticker:c.cell.symbol.ticker,period:{multiplier:c.cell.period.multiplier,timespan:c.cell.period.timespan}}})}})
    const doc:WorkspaceDocument={version:1,layout:this.layout,activeCellId:this.active,sync:{...this.sync},columnRatio:this.columnRatio,rowRatio:this.rowRatio,cells}
    if(!isWorkspaceDocument(doc))throw this.failure('workspace_invalid_save')
    return doc
  }
  save(){if(!this.options.storage)throw this.failure('workspace_storage_disabled');this.options.storage.setItem(this.key(),JSON.stringify(this.capture()));this.message(this.notice,'workspace_saved')}
  deleteSaved(){if(!this.options.storage)throw this.failure('workspace_storage_disabled');this.options.storage.removeItem(this.key());this.message(this.notice,'workspace_deleted')}
  async load(){
    const storage=this.options.storage;if(!storage)throw this.failure('workspace_storage_disabled')
    const raw=storage.getItem(this.key())
    if(raw===null){
      const old=loadLayoutV3(this.options.context,storage as Storage);if(old.status==='error')throw Error(old.message);if(old.status==='missing')throw this.failure('workspace_no_saved')
      const current=this.cells[0];if(!current?.pro)throw this.failure('workspace_primary_not_ready')
      const symbol=old.value.context?.ticker?this.options.symbols.find(s=>s.ticker===old.value.context!.ticker):current.cell.symbol
      if(!symbol)throw this.failure('workspace_legacy_symbol_missing')
      const savedPeriod=old.value.context?.period,period=savedPeriod?{...savedPeriod,text:`${savedPeriod.multiplier} ${savedPeriod.timespan}`}:current.cell.period
      const doc=this.capture();doc.layout=1;doc.activeCellId='primary';doc.cells=[{...current.cell,symbol,period,chart:{...old.value,context:{...old.value.context,ticker:symbol.ticker,period:{multiplier:period.multiplier,timespan:period.timespan}}}}];await this.restore(doc);return
    }
    const doc:unknown=JSON.parse(raw);if(!isWorkspaceDocument(doc))throw this.failure('workspace_corrupt')
    await this.restore(doc)
  }
  async restore(doc:WorkspaceDocument){
    if(this.initialization)await this.initialization
    if(this.disposed)throw this.failure('workspace_closed')
    if(this.busy)throw this.failure('workspace_busy')
    if(this.cells.some(c=>c.pro?.getDrawingHistoryState().pending))throw this.failure('workspace_drawing_load')
    if(!isWorkspaceDocument(doc))throw this.failure('workspace_invalid_document')
    for(const cell of doc.cells){if(!this.options.symbols.some(s=>s.ticker===cell.symbol.ticker))throw this.failure('workspace_symbol_missing',{ticker:cell.symbol.ticker});const context=cell.cellId==='primary'?this.options.context:`${this.options.context}:${cell.cellId}`;if(cell.context!==context)throw this.failure('workspace_context_mismatch')}
    this.busy=true;for(const c of this.cells){c.body.inert=true;c.pro?.getShortcutManager()?.setEnabled(false)}++this.alignment;const staged:Runtime[]=[];const stage=document.createElement('div');stage.style.cssText='position:absolute;visibility:hidden;pointer-events:none;width:'+this.grid.clientWidth+'px';this.root.append(stage)
    try{
      for(const cell of doc.cells){const c=await this.createCell(cell,stage,true);staged.push(c);if(!c.pro)throw this.failure('workspace_restored_not_ready');await restoreLayout(c.pro,cell.chart);c.restoredIds=cell.chart.overlayData.flatMap(o=>o.id?[o.id]:[])}
      if(this.disposed)throw this.failure('workspace_closed')
      this.assertDrawingIdle(this.cells)
      for(const c of this.cells)this.disposeCell(c)
      this.cells=staged;for(const c of staged){this.grid.append(c.element);this.publishLabels(c)}
      this.layout=doc.layout;this.sync={...doc.sync};this.columnRatio=doc.columnRatio;this.rowRatio=doc.rowRatio
      for(const control of this.controls)control.checked=this.sync[control.dataset.sync as keyof WorkspaceSync]
      for(const [key,value] of [['columnRatio',this.columnRatio],['rowRatio',this.rowRatio]] as const)(this.root.querySelector(`[data-ratio="${key}"]`) as HTMLInputElement).value=String(value)
      this.geometry();this.setActive(doc.activeCellId);this.options.onLayoutChange?.(doc.layout);this.message(this.notice,'workspace_restored')
      for(const c of staged){const viewport=doc.cells.find(saved=>saved.cellId===c.cell.cellId)?.chart.viewport;if(viewport&&c.pro?.getChart()&&!syncViewport(c.pro.getChart()!,{from:viewport.fromTimestamp,to:viewport.toTimestamp}))this.message(c.status,'workspace_restored_viewport_limited')}
    }catch(e){for(const c of staged)this.disposeCell(c);throw e}finally{stage.remove();this.busy=false;for(const c of this.cells){c.body.inert=false;c.pro?.getShortcutManager()?.setEnabled(c.cell.cellId===this.active)}}
  }
  private assertDrawingIdle(cells:Runtime[]){if(cells.some(c=>c.pro?.getDrawingHistoryState().pending))throw this.failure('workspace_drawing_switch')}
  getCells(){return this.cells.map(c=>({...c.cell,chart:c.pro}))}
  private publishLabels(c:Runtime){c.element.style.display='flex';c.element.dataset.cellId=c.cell.cellId;this.aria(c.symbolSelect,'workspace_symbol',{id:c.cell.cellId});this.aria(c.periodSelect,'workspace_period',{id:c.cell.cellId})}
  private resetSelectors(c:Runtime){c.symbolSelect.value=c.cell.symbol.ticker;c.periodSelect.value=[...c.periodSelect.options].find(o=>equalPeriod(JSON.parse(o.value),c.cell.period))?.value??''}
  dispose(){this.disposed=true;++this.operation;this.observer?.disconnect();for(const c of [...this.cells,...this.pending])this.disposeCell(c);this.cells=[];this.root.remove()}
}
