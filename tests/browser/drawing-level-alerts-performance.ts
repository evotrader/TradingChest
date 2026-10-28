import {KLineChartPro,instantiateDrawingLevelPreset,builtinDrawingCatalog} from '/src/chart.ts'
import {evaluateDrawingAlert,builtinDrawingAlertLevelResolvers} from '/src/alerts.ts'
import {makeBars} from './syntheticBars'
const host=document.querySelector('#charts')!,frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))),symbol={ticker:'PERF.LEVEL',market:'test',exchange:'X',priceCurrency:'USD'},period={multiplier:1,timespan:'minute',text:'1m'}
;(window as any).sampleLevelAlerts=async({count,rules,append}:{count:number;rules:number;append:boolean})=>{
 const bars=makeBars(count),container=document.createElement('div');container.style.height='900px';host.append(container)
 let push:any,subscriptions=0,confirmed=0,resolve:any
 const ready=new Promise(done=>resolve=done),events:any[]=[],output:any={count,rules,append,updates:[],batches:[],confirmations:[],events:[]}
 const pro=new KLineChartPro({container,symbol,period,mainIndicators:['MA'],subIndicators:['VOL','MACD'],onDataReady:()=>resolve(),onDataState:(state:any)=>{if(state.dataStatus==='ready'&&!state.restoring&&!state.error)confirmed++},onDrawingAlertTrigger:(event:any)=>events.push(event),datafeed:{searchSymbols:async()=>[],getHistoryKLineData:async()=>({bars,basis:'isolated-raw',hasMoreBefore:false}),subscribe:(_s:any,_p:any,callback:any)=>{push=callback;subscriptions++},unsubscribe:()=>{push=undefined;subscriptions--}}})
 const indicatorsReady=async()=>{const deadline=performance.now()+10000,expected=bars.slice(-5).reduce((n,b)=>n+b.close,0)/5;while(true){const chart=pro.getChart(),ma=chart.getIndicators({name:'MA'})[0];if(['MA','VOL','MACD'].every(name=>chart.getIndicators({name})[0]?.result.length===bars.length)&&Math.abs((ma.result.at(-1).ma1??ma.result.at(-1).ma5)-expected)<1e-9)return;if(performance.now()>deadline)throw Error('实际指标更新未确认');await new Promise(r=>setTimeout(r,1))}}
 try{
  await ready;await indicatorsReady()
  const drawings=Array.from({length:100},(_,index)=>{
   const name=index<50?'fibonacciLine':'fibonacciExtension',tool=builtinDrawingCatalog.find((tool:any)=>tool.toolId===name)!,levels=instantiateDrawingLevelPreset(tool.parameters.find((p:any)=>p.key==='levels')!.defaultValue as any),id='fib-'+index,anchors=[{kind:'market',timestamp:bars.at(-20)!.timestamp,value:99},{kind:'market',timestamp:bars.at(-10)!.timestamp,value:101},...(index<50?[]:[{kind:'market',timestamp:bars.at(-1)!.timestamp,value:99}])]
   return {logicalId:id,owner:'local',anchors,parameters:{levels,extendLeft:true,extendRight:true},overlay:{id,name,paneId:'candle_pane',groupId:'drawing_tools',points:anchors.map(a=>({timestamp:a.timestamp,value:a.value})),styles:null,extendData:null,visible:true,lock:false}}
  })
  pro.restoreDrawings('local',drawings as any)
  const update=(close:number,newBar=false)=>{const previous=bars.at(-1)!,bar={...previous,timestamp:previous.timestamp+(newBar?60000:0),open:close,high:close+1,low:close-1,close};if(newBar)bars.push(bar);else bars[bars.length-1]=bar;push(bar)}
  update(99);await indicatorsReady();await frame()
  for(let index=0;index<rules;index++){const drawing=drawings[index],level=drawing.parameters.levels.items.find((l:any)=>l.value===.5)!;const result=pro.executeDrawingAlertCommand({type:'create',id:'rule-'+index,drawingLogicalId:drawing.logicalId,target:{kind:'level',levelId:level.id},frequency:'once-per-bar'});if(result.status!=='completed')throw Error(result.message)}
  update(98);await indicatorsReady();await frame();events.length=0
  const chart=pro.getChart(),native=chart.getOverlays(),seen=new Map(),originals=native.map((overlay:any)=>{const original=overlay.createPointFigures;overlay.createPointFigures=(args:any)=>{const figures=original(args),lines=figures.filter((f:any)=>f.key?.startsWith('fibonacci-level:'));seen.set(overlay.id,lines.map((line:any)=>({key:line.key,y:line.attrs.coordinates[0].y})));return figures};return [overlay,original]})
  chart.resize();await frame();for(const [overlay,original]of originals)overlay.createPointFigures=original
  if(seen.size!==100||[...seen.values()].some((lines:any)=>lines.length!==7))throw Error('100个Fib的全部默认级别未实际显示')
  const axis=chart.getYAxes({paneId:'candle_pane'})[0]
  for(const drawing of drawings)for(const level of drawing.parameters.levels.items){const price=drawing.overlay.name==='fibonacciLine'?101-2*level.value:99+2*level.value,row=(seen.get(drawing.logicalId) as any[]).find(line=>line.key==='fibonacci-level:'+level.id);if(!row||Math.abs(row.y-axis.convertToPixel(price))>1e-8)throw Error('原生级别与独立价格oracle不一致')}
  output.geometry={sources:100,visibleLevels:700,types:{fibonacciLine:50,fibonacciExtension:50},oracle:true}
  for(let index=0;index<100;index++){
   const before=confirmed,start=performance.now();update(index%2?101:99,append);await indicatorsReady();await frame();output.updates.push(performance.now()-start)
   if(confirmed<=before||chart.getDataList().length!==bars.length||chart.getDataList().at(-1)!.close!==bars.at(-1)!.close)throw Error('完整更新未进入确认系列')
   output.confirmations.push({before,after:confirmed,timestamp:bars.at(-1)!.timestamp,close:bars.at(-1)!.close})
  }
  const expected=rules*(append?99:1);if(events.length!==expected||events.some(e=>e.referencePrice!==100||e.level?.value!==.5))throw Error('级别事件数量或独立参考价不符')
  output.events=events;output.actualRules=pro.getDrawingAlertState().length;output.sourceCount=pro.getDrawings().length;output.confirmedBars=chart.getDataList().length;output.history=pro.getDrawingHistoryState()
  if(rules){
   const definitions=pro.captureDrawingAlerts().rules.map((item:any)=>item.rule),timestamp=bars.at(-1)!.timestamp
   const geometries=drawings.map(drawing=>{const rule=definitions.find((r:any)=>r.drawingLogicalId===drawing.logicalId),tool=builtinDrawingCatalog.find((tool:any)=>tool.overlayName===drawing.overlay.name)!,parameters=Object.fromEntries(tool.parameters.map((p:any)=>[p.key,drawing.parameters[p.key]??p.defaultValue])),level=drawing.parameters.levels.items.find((l:any)=>l.id===rule.target.levelId)!,resolved=builtinDrawingAlertLevelResolvers.find((r:any)=>r.id===rule.target.resolverId)!.resolve({toolId:drawing.overlay.name,anchors:drawing.anchors,level,parameters} as any);if(resolved.status!=='ready')throw Error(resolved.reason);return {kind:'level',toolId:drawing.overlay.name,anchors:drawing.anchors,target:rule.target,referencePrice:resolved.referencePrice,from:resolved.from,to:resolved.to,comparisonKey:resolved.comparisonKey,levelValue:level.value}})
   for(let index=0;index<100;index++){let actual=0;const start=performance.now();for(let j=0;j<100;j++){const result=evaluateDrawingAlert({rule:definitions[j],geometry:geometries[j],bars,previous:{timestamp,close:99},current:{timestamp,close:101},state:{hasTriggered:false}} as any);if(result.event?.referencePrice===100&&result.event?.level?.levelId===definitions[j].target.levelId)actual++}output.batches.push(performance.now()-start);if(actual!==100)throw Error('纯函数批次未求值全部100级别规则')}
  }
 }finally{pro.dispose();container.remove();await frame();output.cleanup={subscriptions,dom:host.querySelectorAll('*').length}}
 return output
}
;(window as any).ready=true
