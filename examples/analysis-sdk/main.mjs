import {KLineChartPro,builtinIndicatorCatalog,registerIndicatorDefinition,captureLayout,restoreLayout} from 'trading-chest/chart'
import 'trading-chest/dist/trading-chest.css'

// Deterministic fixtures stay in this isolated example, never in product datafeeds.
export const bars=Array.from({length:120},(_,i)=>{const close=100+Math.sin(i/7);return {timestamp:1700000000000+i*60000,open:close-.1,close,high:close+1,low:close-1,volume:100+i}})
const historyResult=query=>query.kind==='before'?{bars:bars.filter(bar=>bar.timestamp<query.before),hasMoreBefore:false,basis:'example-unadjusted'}:{bars:bars.filter(bar=>bar.timestamp>=query.from&&bar.timestamp<query.to),basis:'example-unadjusted'}
const name='EXAMPLE/MovingAverage'
registerIndicatorDefinition(name,{name,shortName:'Example MA',calcParams:[5,'close',true],figures:[{key:'value',title:'Example: ',type:'line'}],calc:(rows,indicator)=>{
 const [length,field,enabled]=indicator.calcParams
 return rows.map((_,index)=>!enabled||index+1<length?{}:{value:rows.slice(index+1-length,index+1).reduce((sum,row)=>sum+row[field],0)/length})
}})
const descriptor={name,label:'示例均线',labels:{'en-US':'Example moving average'},category:'example',placements:['main','sub'],parameters:{items:[{type:'number',label:'窗口',min:1,max:100,step:1},{type:'select',label:'字段',options:[{label:'收盘',value:'close'},{label:'开盘',value:'open'}]},{type:'boolean',label:'启用'}]}}
const catalog=[...builtinIndicatorCatalog.filter(d=>['MA','VOL'].includes(d.name)),descriptor]
const status=document.querySelector('#status')
let chart,ready,handles=[],saved
export const loaded=new Promise(resolve=>ready=resolve)
const show=message=>status.textContent=message
chart=new KLineChartPro({container:document.querySelector('#chart'),symbol:{ticker:'ISOLATED.EXAMPLE',name:'隔离示例'},period:{multiplier:1,timespan:'minute',text:'1m'},mainIndicators:['MA'],subIndicators:['VOL'],indicatorCatalog:catalog,onDataReady:()=>ready(),onAnalysisEventClick:({layerId,event,timestamp})=>show(`${layerId}：${event.id}，原始时间 ${timestamp}`),onAnalysisPointSelect:({layerId,point})=>show(`${layerId}：${point.label} = ${point.value}`),datafeed:{searchSymbols:async()=>[],getHistoryKLineData:async(_symbol,_period,query)=>historyResult(query),subscribe:()=>{},unsubscribe:()=>{}}})
await loaded
const context=chart.getAnalysisContext()
if(!context)throw Error('示例没有已确认行情')
const layers=[
 chart.addAnalysisLayer(context,{id:'line',label:'外部线（百分数点）',type:'line',placement:'sub',valueType:'percent',data:bars.map((bar,i)=>({timestamp:bar.timestamp,value:i%15===0?null:Math.sin(i/8)*3}))}),
 chart.addAnalysisLayer(context,{id:'histogram',label:'正负柱',type:'histogram',placement:'sub',valueType:'scalar',data:bars.map((bar,i)=>({timestamp:bar.timestamp,value:(i%11)-5}))}),
 chart.addAnalysisLayer(context,{id:'band',label:'同口径价格带',type:'band',placement:'main',valueType:'price',dataBasis:'example-unadjusted',data:bars.map(bar=>({timestamp:bar.timestamp,lower:bar.close-.5,upper:bar.close+.5}))}),
 chart.addAnalysisLayer(context,{id:'events',label:'只读事件',type:'events',data:[{id:'point',timestamp:bars[30].timestamp,label:'原始事件'},{id:'range',timestamp:bars[40].timestamp,endTimestamp:bars[75].timestamp,label:'事件区间'}]}),
 chart.addAnalysisLayer(context,{id:'labels',label:'来源日期与原值（序数轴）',type:'label-series',data:[{id:'day-1',label:'2026-01-05',value:1},{id:'day-2',label:'2026-01-07',value:null},{id:'day-3',label:'2026-01-10',value:1.04}]})
]
const action=(id,fn)=>document.querySelector(`#${id}`).addEventListener('click',()=>Promise.resolve().then(fn).catch(error=>show(error.message)))
action('add',async()=>{handles.push(await chart.addIndicator({name,placement:'main'}),await chart.addIndicator({name,placement:'sub',calcParams:[8,'open',true]}));show('已添加两个独立实例')})
action('update',()=>{if(!handles[0])throw Error('请先添加指标');chart.updateIndicator(handles[0].id,{calcParams:[12,'close',true]});show('第一个实例已更新')})
action('remove',()=>{if(!handles[1])throw Error('第二个实例不存在');chart.removeIndicator(handles[1].id);handles.splice(1,1);show('第二个实例已移除')})
action('save',()=>{saved=captureLayout(chart);show('布局已捕获；分析数据不写入布局')})
action('restore',async()=>{if(!saved)throw Error('请先捕获布局');await restoreLayout(chart,saved);show('布局已恢复，分析层仍属于当前实例')})
action('replay',()=>chart.startReplay(45))
action('forward',()=>chart.getReplayEngine()?.stepForward())
action('stop',()=>chart.stopReplay())
window.analysisDemo={chart,bars,layers,get handles(){return handles},get saved(){return saved},ready:true}
show('已就绪；通过工具栏可搜索外部指标，设置面板包含数字、选择器及开关')
window.addEventListener('pagehide',()=>chart.dispose(),{once:true})
