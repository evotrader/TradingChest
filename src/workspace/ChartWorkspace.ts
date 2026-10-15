import type { Chart, Crosshair } from 'klinecharts'
import type { ChartPro, Period, SymbolInfo } from '../types'
import {captureLayout,isChartLayoutV3,restoreLayout,loadLayoutV3} from '../persistence/v3'
import {jsonSafe} from '../persistence/v2'
import {hideCrosshair,syncCrosshair,syncViewport,visibleTimestamps} from './viewportSync'
import type {ChartWorkspaceOptions,WorkspaceBinding,WorkspaceCell,WorkspaceDocument,WorkspaceLayout,WorkspaceSync} from './types'

const ids=['primary','secondary-1','secondary-2','secondary-3']
const equalPeriod=(a:Period,b:Period)=>a.multiplier===b.multiplier&&a.timespan===b.timespan
const emptySync=():WorkspaceSync=>({symbol:false,period:false,crosshair:false,viewport:false})
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
  private busy=false
  private observer:ResizeObserver|null=null
  private controls:HTMLInputElement[]=[]
  private layoutSelect:HTMLSelectElement

  constructor(options:ChartWorkspaceOptions){
    this.options=options
    this.root=document.createElement('div');this.root.className='tc-workspace';this.root.dataset.testid='chart-workspace'
    this.root.style.cssText='display:flex;flex-direction:column;gap:8px;min-width:0;color:#d1d5db;font-size:12px'
    const toolbar=document.createElement('div');toolbar.style.cssText='display:flex;gap:12px;align-items:center;flex-wrap:wrap'
    const label=document.createElement('label');label.textContent='图表布局 '
    this.layoutSelect=document.createElement('select');this.layoutSelect.setAttribute('aria-label','图表布局')
    for(const [value,text] of [[1,'单图'],[2,'双图'],[4,'四图']] as const){const o=new Option(text,String(value));this.layoutSelect.add(o)}
    this.layoutSelect.onchange=()=>void this.setLayout(Number(this.layoutSelect.value) as WorkspaceLayout).catch(e=>{this.layoutSelect.value=String(this.layout);this.error(e)})
    label.append(this.layoutSelect);toolbar.append(label)
    for(const [key,text] of Object.entries({symbol:'同步标的',period:'同步周期',crosshair:'同步十字线',viewport:'同步视窗'})){
      const l=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.dataset.sync=key
      input.onchange=()=>{if(this.busy){input.checked=this.sync[key as keyof WorkspaceSync];this.error(Error('布局正在切换，请完成后再调整同步'));return}this.sync[key as keyof WorkspaceSync]=input.checked;if(input.checked)void this.align(key as keyof WorkspaceSync).catch(e=>this.error(e));else ++this.syncVersion[key as keyof WorkspaceSync]}
      l.append(input,document.createTextNode(text));toolbar.append(l);this.controls.push(input)
    }
    for(const [text,action] of [['保存工作台',()=>this.save()],['加载工作台',()=>this.load()],['删除工作台',()=>this.deleteSaved()]] as const){
      const button=document.createElement('button');button.textContent=text;button.type='button';button.disabled=!options.storage
      button.onclick=()=>void Promise.resolve().then(action).catch(e=>this.error(e));toolbar.append(button)
    }
    for(const [key,text] of [['columnRatio','左右宽度'],['rowRatio','上下高度']] as const){
      const l=document.createElement('label'),input=document.createElement('input');input.type='range';input.min='25';input.max='75';input.value='50';input.setAttribute('aria-label',text)
      input.oninput=()=>{this[key]=Number(input.value);this.geometry()};l.append(document.createTextNode(text),input);toolbar.append(l)
    }
    this.notice=document.createElement('div');this.notice.setAttribute('role','status')
    this.grid=document.createElement('div');this.grid.style.cssText='display:grid;gap:8px;min-width:0'
    this.root.append(toolbar,this.notice,this.grid);options.container.append(this.root)
    if(typeof ResizeObserver!=='undefined'){this.observer=new ResizeObserver(()=>{for(const c of this.cells)c.pro?.getChart()?.resize()});this.observer.observe(this.grid)}
    void this.createCell({cellId:'primary',symbol:options.initialSymbol,period:options.initialPeriod??{multiplier:1,timespan:'day',text:'1d'},context:options.context},this.grid).then(c=>{
      if(this.disposed){this.disposeCell(c);return}this.cells=[c];this.geometry();this.setActive('primary')
    }).catch(e=>this.error(e))
  }
  private key(){return this.options.storageKey??`trading-chest-workspace-v1-${this.options.context}`}
  private error(reason:unknown){if(this.disposed)return;const error=reason instanceof Error?reason:new Error(String(reason));this.notice.textContent=error.message;this.options.onError?.(error)}
  private geometry(){
    this.grid.style.gridTemplateColumns=this.layout===1?'minmax(0,1fr)':`minmax(0,${this.columnRatio}fr) minmax(0,${100-this.columnRatio}fr)`
    this.grid.style.height=this.layout===4?'1100px':'720px'
    this.grid.style.gridTemplateRows=this.layout===4?`minmax(0,${this.rowRatio}fr) minmax(0,${100-this.rowRatio}fr)`:'minmax(0,1fr)'
    for(const c of this.cells)c.pro?.getChart()?.resize()
    this.layoutSelect.value=String(this.layout)
  }
  private async createCell(cell:WorkspaceCell,parent:HTMLElement,strict=false,staged=false):Promise<Runtime>{
    const element=document.createElement('section');element.dataset.cellId=cell.cellId;element.tabIndex=0;element.style.cssText='min-width:0;min-height:0;display:flex;flex-direction:column;border:1px solid #374151;overflow:auto;background:#0b0f18'
    if(strict||staged)element.dataset.cellId=`${cell.cellId}-pending`
    if(staged)element.style.display='none'
    const header=document.createElement('div');header.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:6px'
    const activate=document.createElement('button');activate.type='button';activate.textContent=cell.cellId==='primary'?'主窗格':`窗格 ${ids.indexOf(cell.cellId)+1}`;activate.setAttribute('aria-label',`活动窗格 ${cell.cellId}`);activate.onclick=()=>this.setActive(cell.cellId)
    const symbolSelect=document.createElement('select');symbolSelect.setAttribute('aria-label',`标的 ${cell.cellId}`)
    for(const symbol of this.options.symbols)symbolSelect.add(new Option(symbol.name??symbol.ticker,symbol.ticker))
    if(strict||staged)symbolSelect.setAttribute('aria-label',`标的 ${cell.cellId}（恢复中）`)
    symbolSelect.value=cell.symbol.ticker;symbolSelect.disabled=this.options.symbols.length===0
    const periodSelect=document.createElement('select');periodSelect.setAttribute('aria-label',`周期 ${cell.cellId}`);periodSelect.disabled=true
    if(strict||staged)periodSelect.setAttribute('aria-label',`周期 ${cell.cellId}（恢复中）`)
    const body=document.createElement('div');body.style.cssText='min-width:0;min-height:0;flex:1'
    const status=document.createElement('span');status.setAttribute('role','status')
    const retry=document.createElement('button');retry.type='button';retry.textContent='重试窗格';retry.setAttribute('aria-label',`重试窗格 ${cell.cellId}`)
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
      if(!periods.length)throw Error(`${cell.symbol.ticker} 没有可用行情周期，请选择其他标的`)
      if(!periods.some(p=>equalPeriod(p,cell.period))){if(strict)throw Error(`${cell.symbol.ticker} 的已保存周期已失效，请重新选择`);runtime.cell.period=periods[0]}
      for(const period of periods)periodSelect.add(new Option(period.text,JSON.stringify(period)))
      periodSelect.value=JSON.stringify(periods.find(p=>equalPeriod(p,runtime.cell.period)));periodSelect.disabled=false
      runtime.binding=this.options.mountCell(body,runtime.cell,runtime.controller.signal)
      const accept=(pro:ChartPro)=>{if(runtime.controller.signal.aborted||runtime.pro===pro)return;runtime.unsubscribe?.();runtime.pro=pro;runtime.status.textContent='';pro.getChart()?.resize();this.bindActions(runtime);pro.getShortcutManager()?.setEnabled(runtime.cell.cellId===this.active)}
      runtime.unsubscribeReady=runtime.binding.subscribeReady?.(accept)
      const ready=runtime.binding.ready.then(accept)
      if(strict)await Promise.race([ready,new Promise<never>((_,reject)=>{const timer=setTimeout(()=>reject(Error('工作台行情加载超时，原工作台已保留')),30000);ready.finally(()=>clearTimeout(timer)).catch(()=>{})})])
      else void ready.catch(e=>{runtime.status.textContent=String(e instanceof Error?e.message:e)})
    }catch(e){if(strict){this.disposeCell(runtime);throw e}runtime.status.textContent=e instanceof Error?e.message:String(e)}
    this.pending.delete(runtime)
    return runtime
  }
  private bindActions(c:Runtime){
    const chart=c.pro?.getChart();if(!chart)return
    const crosshair=(data:unknown)=>{if(this.busy||!this.cells.includes(c)||this.propagating||c.cell.cellId!==this.active||!this.sync.crosshair)return;this.propagating=true;try{for(const target of this.cells)if(target!==c&&target.pro?.getChart()){target.status.textContent=syncCrosshair(chart,target.pro.getChart()!,data as Crosshair)?'':'该时标无行情，不能定位'}}finally{this.propagating=false}}
    const viewport=()=>{if(this.busy||!this.cells.includes(c)||this.propagating||c.cell.cellId!==this.active||!this.sync.viewport)return;const window=visibleTimestamps(chart);if(!window)return;this.propagating=true;try{for(const target of this.cells)if(target!==c&&target.pro?.getChart())target.status.textContent=syncViewport(target.pro.getChart()!,window)?'':'视窗没有交集或受引擎边界限制，未能对齐'}finally{this.propagating=false}}
    chart.subscribeAction('onCrosshairChange',crosshair);chart.subscribeAction('onVisibleRangeChange',viewport)
    const leave=()=>{if(c.cell.cellId===this.active&&this.sync.crosshair)for(const target of this.cells)if(target!==c&&target.pro?.getChart())hideCrosshair(target.pro.getChart()!)}
    const dom=chart.getDom();dom?.addEventListener('mouseleave',leave)
    c.unsubscribe=()=>{dom?.removeEventListener('mouseleave',leave);chart.unsubscribeAction('onCrosshairChange',crosshair);chart.unsubscribeAction('onVisibleRangeChange',viewport)}
  }
  private disposeCell(c:Runtime){if(c.disposed)return;c.disposed=true;this.pending.delete(c);c.controller.abort();c.unsubscribeReady?.();c.unsubscribe?.();c.binding?.dispose();c.element.remove()}
  setActive(id:string){const c=this.cells.find(c=>c.cell.cellId===id);if(!c)return;this.active=id;for(const item of this.cells){item.element.dataset.active=String(item===c);item.element.style.borderColor=item===c?'#60a5fa':'#374151';item.pro?.getShortcutManager()?.setEnabled(item===c)}this.options.onActiveCell?.({...c.cell})}
  async setLayout(layout:WorkspaceLayout){
    if(![1,2,4].includes(layout))throw Error('布局仅支持单图、双图或四图')
    if(this.busy)throw Error('工作台正在恢复，请稍候')
    this.assertDrawingIdle(this.cells.slice(layout))
    const seq=++this.operation;this.busy=true
    ++this.alignment
    try{while(this.cells.length<layout){const source=this.cells.find(c=>c.cell.cellId===this.active)??this.cells[0];if(!source)throw Error('主窗格尚未就绪');const id=ids[this.cells.length];const cell=await this.createCell({...source.cell,cellId:id,context:`${this.options.context}:${id}`},this.grid);if(this.disposed||seq!==this.operation){this.disposeCell(cell);return}this.cells.push(cell)}
      for(const c of this.cells.splice(layout))this.disposeCell(c)
      this.layout=layout;this.geometry();this.setActive(this.cells.some(c=>c.cell.cellId===this.active)?this.active:'primary')
    }finally{this.busy=false}
  }
  private async changeIdentity(c:Runtime,change:Partial<Pick<WorkspaceCell,'symbol'|'period'>>,propagate=true,isCurrent:()=>boolean=()=>true){
    if(this.busy)throw Error('工作台正在恢复，请稍候')
    const index=this.cells.indexOf(c);if(index<0)return
    if(change.symbol?.ticker===c.cell.symbol.ticker||change.period&&equalPeriod(change.period,c.cell.period))return
    if(c.transitioning)throw Error('该窗格正在切换标的或周期，请稍候')
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
    if(this.busy)throw Error('布局正在切换，请完成后再调整同步')
    const source=this.cells.find(c=>c.cell.cellId===this.active);if(!source)return
    const epoch=this.alignment,seq=++this.syncVersion[key],isCurrent=()=>!this.disposed&&epoch===this.alignment&&seq===this.syncVersion[key]&&source.cell.cellId===this.active
    const action=this.alignmentTail.catch(()=>{}).then(async()=>{
    for(const c of [...this.cells])if(c!==source&&isCurrent()){
      if(key==='symbol'||key==='period'){
        if(key==='period'){const available=await this.options.getPeriods(c.cell.symbol,c.controller.signal);if(!available.some(p=>equalPeriod(p,source.cell.period))){c.status.textContent='该标的没有源周期，不能同步';continue}}
        if(isCurrent())await this.changeIdentity(c,{[key]:source.cell[key]},false,isCurrent)
      }
      else if(key==='viewport'){const w=source.pro?.getChart()&&visibleTimestamps(source.pro.getChart()!);if(w&&c.pro?.getChart())c.status.textContent=syncViewport(c.pro.getChart()!,w)?'':'视窗没有交集或受引擎边界限制，未能对齐'}
    }
    })
    this.alignmentTail=action
    await action
  }
  capture():WorkspaceDocument {
    if(this.busy||this.cells.length!==this.layout||this.cells.some(c=>c.transitioning))throw Error('工作台尚未就绪，未保存')
    const cells=this.cells.map(c=>{if(!c.pro)throw Error(`${c.cell.cellId} 行情尚未就绪，未保存`);if(c.pro.getDrawingHistoryState().pending)throw Error('绘图提交尚未确认，请完成后再保存工作台');const options=c.binding?.captureOptions?.()??{};return {...c.cell,chart:captureLayout(c.pro,{...options,localDrawingIds:[...(options.localDrawingIds??[]),...c.restoredIds,...c.pro.getDrawings().filter(d=>d.owner==='local').map(d=>d.logicalId)],context:{ticker:c.cell.symbol.ticker,period:{multiplier:c.cell.period.multiplier,timespan:c.cell.period.timespan}}})}})
    const doc:WorkspaceDocument={version:1,layout:this.layout,activeCellId:this.active,sync:{...this.sync},columnRatio:this.columnRatio,rowRatio:this.rowRatio,cells}
    if(!isWorkspaceDocument(doc))throw Error('工作台结构无效，未覆盖保存结果')
    return doc
  }
  save(){if(!this.options.storage)throw Error('宿主未启用工作台存储');this.options.storage.setItem(this.key(),JSON.stringify(this.capture()));this.notice.textContent='工作台已保存；后端标注仅保存引用'}
  deleteSaved(){if(!this.options.storage)throw Error('宿主未启用工作台存储');this.options.storage.removeItem(this.key());this.notice.textContent='已删除保存的工作台，当前图形保留'}
  async load(){
    const storage=this.options.storage;if(!storage)throw Error('宿主未启用工作台存储')
    const raw=storage.getItem(this.key())
    if(raw===null){
      const old=loadLayoutV3(this.options.context,storage as Storage);if(old.status==='error')throw Error(old.message);if(old.status==='missing')throw Error('没有已保存的工作台或单图布局')
      const current=this.cells[0];if(!current?.pro)throw Error('主图尚未就绪')
      const symbol=old.value.context?.ticker?this.options.symbols.find(s=>s.ticker===old.value.context!.ticker):current.cell.symbol
      if(!symbol)throw Error('旧单图标的已不在目录中，请重新选择')
      const savedPeriod=old.value.context?.period,period=savedPeriod?{...savedPeriod,text:`${savedPeriod.multiplier} ${savedPeriod.timespan}`}:current.cell.period
      const doc=this.capture();doc.layout=1;doc.activeCellId='primary';doc.cells=[{...current.cell,symbol,period,chart:{...old.value,context:{...old.value.context,ticker:symbol.ticker,period:{multiplier:period.multiplier,timespan:period.timespan}}}}];await this.restore(doc);return
    }
    const doc:unknown=JSON.parse(raw);if(!isWorkspaceDocument(doc))throw Error('工作台已损坏，原件和当前图形均保留；可删除保存结果后重新保存')
    await this.restore(doc)
  }
  async restore(doc:WorkspaceDocument){
    if(this.busy)throw Error('工作台正在恢复，请稍候')
    if(this.cells.some(c=>c.pro?.getDrawingHistoryState().pending))throw Error('绘图提交尚未确认，请完成后再加载工作台')
    if(!isWorkspaceDocument(doc))throw Error('工作台结构无效')
    for(const cell of doc.cells){if(!this.options.symbols.some(s=>s.ticker===cell.symbol.ticker))throw Error(`${cell.symbol.ticker} 已不在目录中，请重新选择`);const context=cell.cellId==='primary'?this.options.context:`${this.options.context}:${cell.cellId}`;if(cell.context!==context)throw Error('保存的窗格 context 与当前入口不匹配')}
    this.busy=true;for(const c of this.cells){c.body.inert=true;c.pro?.getShortcutManager()?.setEnabled(false)}++this.alignment;const staged:Runtime[]=[];const stage=document.createElement('div');stage.style.cssText='position:absolute;visibility:hidden;pointer-events:none;width:'+this.grid.clientWidth+'px';this.root.append(stage)
    try{
      for(const cell of doc.cells){const c=await this.createCell(cell,stage,true);staged.push(c);if(!c.pro)throw Error('恢复图表尚未就绪');await restoreLayout(c.pro,cell.chart);c.restoredIds=cell.chart.overlayData.flatMap(o=>o.id?[o.id]:[])}
      if(this.disposed)throw Error('工作台已关闭')
      this.assertDrawingIdle(this.cells)
      for(const c of this.cells)this.disposeCell(c)
      this.cells=staged;for(const c of staged){this.grid.append(c.element);this.publishLabels(c)}
      this.layout=doc.layout;this.sync={...doc.sync};this.columnRatio=doc.columnRatio;this.rowRatio=doc.rowRatio
      for(const control of this.controls)control.checked=this.sync[control.dataset.sync as keyof WorkspaceSync]
      for(const [label,value] of [['左右宽度',this.columnRatio],['上下高度',this.rowRatio]] as const)(this.root.querySelector(`[aria-label="${label}"]`) as HTMLInputElement).value=String(value)
      this.geometry();this.setActive(doc.activeCellId);this.notice.textContent='工作台已恢复；标注内容从后端重新读取'
      for(const c of staged){const viewport=doc.cells.find(saved=>saved.cellId===c.cell.cellId)?.chart.viewport;if(viewport&&c.pro?.getChart()&&!syncViewport(c.pro.getChart()!,{from:viewport.fromTimestamp,to:viewport.toTimestamp}))c.status.textContent='已恢复图形；视窗受引擎边界限制，无法完全对齐'}
    }catch(e){for(const c of staged)this.disposeCell(c);throw e}finally{stage.remove();this.busy=false;for(const c of this.cells){c.body.inert=false;c.pro?.getShortcutManager()?.setEnabled(c.cell.cellId===this.active)}}
  }
  private assertDrawingIdle(cells:Runtime[]){if(cells.some(c=>c.pro?.getDrawingHistoryState().pending))throw Error('绘图提交尚未确认，请完成后再切换或移除窗格')}
  getCells(){return this.cells.map(c=>({...c.cell,chart:c.pro}))}
  private publishLabels(c:Runtime){c.element.style.display='flex';c.element.dataset.cellId=c.cell.cellId;c.symbolSelect.setAttribute('aria-label',`标的 ${c.cell.cellId}`);c.periodSelect.setAttribute('aria-label',`周期 ${c.cell.cellId}`)}
  private resetSelectors(c:Runtime){c.symbolSelect.value=c.cell.symbol.ticker;c.periodSelect.value=[...c.periodSelect.options].find(o=>equalPeriod(JSON.parse(o.value),c.cell.period))?.value??''}
  dispose(){this.disposed=true;++this.operation;this.observer?.disconnect();for(const c of [...this.cells,...this.pending])this.disposeCell(c);this.cells=[];this.root.remove()}
}
