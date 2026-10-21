import {builtinDrawingCatalog,KLineChartPro,DrawingStoreError,ChartWorkspace,DrawingSessionRegistry,createIndexedDBDrawingDocumentStore,createIndexedDBDrawingPreferencesStore,createIndexedDBWorkspaceStore,drawingShareKey} from 'trading-chest/chart'
import 'trading-chest/dist/trading-chest.css'
import {analysisZoneDescriptor} from './analysis-zone.mjs'
const drawingCatalog=[...builtinDrawingCatalog,analysisZoneDescriptor]
import {createHTTPDrawingStore} from './http-store.mjs'

// Deterministic synthetic inputs are confined to this isolated public-package example.
const bars=Array.from({length:300},(_,i)=>{const close=100+Math.sin(i/7)*3;return {timestamp:1700000000000+i*60000,open:close-.1,close,high:close+1,low:close-1,volume:100+i}})
const symbol={ticker:'ISOLATED.X',market:'test',exchange:'X',priceCurrency:'USD',pricePrecision:2,tickSize:.25},period={multiplier:1,timespan:'minute',text:'1m'}
const identity={namespace:'isolated-drawing-example',symbol:{ticker:symbol.ticker,market:symbol.market,exchange:symbol.exchange,priceCurrency:symbol.priceCurrency},priceBasisKey:'unadjusted'},resolution={identity,documentId:drawingShareKey(identity)}
const status=document.querySelector('#status'),selector=document.querySelector('#store');selector.options[1].disabled=!import.meta.env.DEV
let workspaces=[],registries=[],owned=[],mounted=false,generation=0
const charts=()=>workspaces.flatMap(w=>w.getCells().map(c=>c.chart).filter(Boolean))
const show=message=>status.textContent=message
function dispose(){generation++;for(const w of workspaces)w.dispose();for(const r of registries)r.dispose();for(const store of owned)store.dispose?.();workspaces=[];registries=[];owned=[];mounted=false;window.drawingDemo.ready=false;show('图表、会话与首方存储所有者已释放')}
async function mount(){
 if(mounted)return;mounted=true;document.querySelector('#http-fault').disabled=selector.value!=='http';document.querySelector('#verify').disabled=selector.value!=='http';const epoch=++generation
 const documents=selector.value==='http'?createHTTPDrawingStore('/drawing-store',{errorFactory:(code,message)=>new DrawingStoreError(code,message),headers:()=>{const field=document.querySelector('#http-fault'),fault=field.value;field.value='none';return fault==='none'?{}:{'X-Isolated-Fault':fault}}}):createIndexedDBDrawingDocumentStore(),preferences=createIndexedDBDrawingPreferencesStore(),layouts=createIndexedDBWorkspaceStore({databaseName:'tc-drawing-example-layouts'})
 owned=[documents,preferences,layouts];const shared=new DrawingSessionRegistry({scope:'host',store:documents}),independent=new DrawingSessionRegistry({scope:'host',store:documents});registries=[shared,independent]
 for(const [index,id] of ['a','b','c'].entries()){
  const registry=index===2?independent:shared
  const workspace=new ChartWorkspace({container:document.querySelector('#'+id),context:'isolated-drawing-'+id,symbols:[symbol],initialSymbol:symbol,initialPeriod:period,getPeriods:async()=>[period,{multiplier:1,timespan:'hour',text:'1h'}],store:layouts,resolveDrawingShareKey:()=>resolution,mountCell:(container,cell)=>{
   let resolve;const ready=new Promise(r=>resolve=r)
   const pro=new KLineChartPro({container,drawingCatalog,symbol:cell.symbol,period:cell.period,drawingHostSessions:registry,resolveDrawingShareKey:()=>resolution,drawingPreferencesStore:preferences,drawingPreferencesScope:'isolated-example-'+id,onDataReady:()=>queueMicrotask(()=>resolve(pro)),datafeed:{searchSymbols:async()=>[],getHistoryKLineData:async(_s,_p,query)=>({bars:query.kind==='before'?bars.filter(b=>b.timestamp<query.before):bars.filter(b=>b.timestamp>=query.from&&b.timestamp<query.to),hasMoreBefore:false,basis:'unadjusted'}),subscribe:()=>{},unsubscribe:()=>{}}})
   return {ready,dispose:()=>pro.dispose()}
  }})
  workspaces.push(workspace)
 }
 await Promise.all(registries.map(r=>r.bind(resolution)));if(epoch!==generation)return
 window.drawingDemo.ready=true;show('共享绘图已就绪；请通过图内工具栏和对象管理绘制与编辑')
}
const action=(id,fn)=>document.querySelector('#'+id).addEventListener('click',()=>Promise.resolve().then(fn).catch(e=>show(e.message)))
action('volume',async()=>{
 if(!mounted||!window.drawingDemo.ready)throw Error('请先等待图表就绪')
 const chart=charts()[0],loaded=chart.getChart().getDataList(),from=loaded.at(-80),to=loaded.at(-1)
 for(const [index,name] of ['anchoredVwap','fixedRangeVolumeProfile'].entries()){
  const logicalId='volume-example-'+crypto.randomUUID(),anchors=[from,...(index?[to]:[])].map(bar=>({kind:'market',timestamp:bar.timestamp,value:bar.close})),parameters=index?{rows:48,valueArea:.7,mode:'total',algorithm:'bar-range-uniform-v1'}:{source:'hlc3',algorithm:'bar-price-volume-v1'}
  const result=await chart.commitDrawing({kind:'create',logicalId,source:'programmatic',after:{logicalId,owner:'local',anchors,parameters,presentation:{groupId:'volume-example',groupName:'量价估算示例'},overlay:{id:logicalId,name,points:anchors.map(a=>({timestamp:a.timestamp,value:a.value})),paneId:'candle_pane',groupId:'drawing_tools',styles:null,extendData:null,visible:true,lock:false}}})
  if(result.status!=='confirmed')throw Error('量价工具创建未确认')
 }
 show('已添加当前周期 OHLCV 估算；选择对象可查看样本范围和计算摘要')
})
action('save',async()=>{if(!mounted)throw Error('请先挂载');await (await registries[0].bind(resolution)).save();show('共享绘图已保存；C 需显式刷新')})
action('verify',async()=>{if(!mounted)throw Error('请先挂载');await (await registries[0].bind(resolution)).refresh();show('原共享写入已按固定 ID 核对')})
action('refresh',async()=>{if(!mounted)throw Error('请先挂载');await (await registries[1].bind(resolution)).refresh();show('独立实例 C 已读取保存结果')})
action('save-layouts',async()=>{for(const w of workspaces){await w.saveAs('绘图示例')}show('三个工作台已保存，可重开恢复')})
action('restore-layouts',async()=>{for(const w of workspaces){const saved=await w.listSaved();const record=saved.find(s=>s.name==='绘图示例');if(!record)throw Error('没有已保存工作台，请先保存');await w.load(record.id)}show('三个已保存工作台恢复完成')})
action('dispose',dispose);action('mount',mount);selector.addEventListener('change',()=>{dispose();void mount().catch(e=>show(e.message))})
window.drawingDemo={get workspaces(){return workspaces},get registries(){return registries},get charts(){return charts()},resolution,ready:false,dispose,mount}
window.addEventListener('pagehide',dispose,{once:true});await mount()
