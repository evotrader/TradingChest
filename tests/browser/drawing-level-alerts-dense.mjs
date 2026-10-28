import {captureLayout,restoreLayout,instantiateDrawingLevelPreset} from '/src/chart.ts'
import {DrawingAlertRuntime} from '/src/alert/drawingRuntime.ts'

/** Extend the original 1002-object fixture only for the additional enabled-alert load. */
export function installDenseLevelAlerts(bench,{bars,events,push}){
 let restoreButton,restoreListener,restoring=false,restoreResolutions=0
 const resolve=DrawingAlertRuntime.prototype.resolve
 DrawingAlertRuntime.prototype.resolve=function(...args){if(restoring&&this.options.restoring())restoreResolutions++;return resolve.apply(this,args)}
 const assert=(condition,message)=>{if(!condition)throw Error(message)}
 const state=pro=>pro.getDrawingAlertState().map(({rule,enabled,hasTriggered,lastBarTimestamp,replay})=>({rule,enabled,hasTriggered,lastBarTimestamp,replay:{hasTriggered:replay.hasTriggered,lastBarTimestamp:replay.lastBarTimestamp}}))
 const markers=pro=>JSON.stringify(state(pro))
 const content=drawing=>{const {anchors,...rest}=drawing,{points,...overlay}=rest.overlay;return JSON.stringify({...rest,overlay})}
 const target=(drawing,anchors=drawing.anchors)=>({id:drawing.logicalId,anchors,content:content(drawing)})
 const geometry=(pro,expected)=>{
  const objects=new Map(pro.getDrawings().map(d=>[d.logicalId,d])),native=new Map(pro.getChart().getOverlays().map(d=>[d.id,d]))
  assert(objects.size===1002&&native.size===1002,'1002对象未完整保留')
  for(const target of expected){const object=objects.get(target.id),overlay=native.get(target.id);assert(object?.anchors.length===target.anchors.length&&overlay?.points.length===target.anchors.length,'控点数量不完整');assert(content(object)===target.content,'确认对象的非几何字段发生变化');for(const [index,anchor]of target.anchors.entries())assert(object.anchors[index].timestamp===anchor.timestamp&&Math.abs(object.anchors[index].value-anchor.value)<1e-9&&overlay.points[index].timestamp===anchor.timestamp&&Math.abs(overlay.points[index].value-anchor.value)<1e-9,'确认或原生几何不一致')}
  const history=pro.getDrawingHistoryState();assert(!history.pending&&!history.error&&!history.uncertainLogicalIds.length&&!Object.keys(history.projectionErrors??{}).length,'历史未完整确认')
  const analytics=pro.getDrawingState().analytics;assert(['volume-0','volume-1'].every(id=>analytics[id]?.status==='ready'),'量价来源未完成')
  return {objects:objects.size,native:native.size,history}
 }
 const instrument=()=>{
  const tasks=[],observer=new PerformanceObserver(list=>tasks.push(...list.getEntries().map(({startTime,duration})=>({startTime,duration}))));observer.observe({type:'longtask',buffered:true})
  const finish=async sample=>{await new Promise(r=>setTimeout(r,100));tasks.push(...observer.takeRecords().map(({startTime,duration})=>({startTime,duration})));observer.disconnect();sample.longTasks=tasks.filter(t=>t.startTime<sample.end&&t.startTime+t.duration>sample.start);sample.maximumLongTask=Math.max(0,...sample.longTasks.map(t=>t.duration));sample.complete=true}
  return finish
 }
 return {
  async prepare(){
   await bench.configure({interior:true});const pro=bench.charts[0],source=pro.getDrawings(),replacement=[]
   const next=source.map((drawing,index)=>{
    if(index>=50)return drawing
    const name=index<25?'fibonacciLine':'fibonacciExtension',levels=instantiateDrawingLevelPreset([0,.236,.382,.5,.618,.786,1]),anchors=structuredClone(drawing.anchors)
    if(index>=25)anchors.push({...anchors[1],timestamp:bars().at(-3).timestamp})
    replacement.push({id:drawing.logicalId,from:drawing.overlay.name,to:name})
    return {...drawing,anchors,parameters:{levels,extendLeft:true,extendRight:true},overlay:{...drawing.overlay,name,extendData:null,points:anchors.map(({timestamp,value})=>({timestamp,value}))}}
   })
   pro.restoreDrawings('local',next);await bench.frame()
   for(const drawing of next.slice(0,100)){
    const level=drawing.parameters?.levels?.items?.find(level=>level.value===.5),command={type:'create',id:'level-load-'+drawing.logicalId,drawingLogicalId:drawing.logicalId,frequency:'once-per-bar',...(level?{target:{kind:'level',levelId:level.id}}:{})}
    const result=pro.executeDrawingAlertCommand(command);assert(result.status==='completed',result.message)
   }
   const references=next.slice(0,50).map(d=>{const [a,b,c]=d.anchors.map(a=>a.value);return d.overlay.name==='fibonacciLine'?b+(a-b)*.5:c+(b-a)*.5})
   const beforeEvents=events().length
   await push(Math.min(...references)-1,false);await bench.frame();await push(Math.max(...references)+1,false);await bench.frame()
   assert(events().length-beforeEvents===50,'计时前必须用实际同bar穿越建立50条Fib去重标记')
   const rules=state(pro);assert(rules.length===100&&rules.every(rule=>rule.enabled)&&rules.filter(rule=>rule.hasTriggered&&rule.lastBarTimestamp===bars().at(-1).timestamp).length===50,'密集负载未保留100条启用规则及真实触发标记')
   const expected=pro.getDrawings().map(d=>target(d)),verified=geometry(pro,expected)
   await bench.frame();return {replacement,rules,...verified}
  },
  armTranslate(direction){
   const pro=bench.charts[0],indices=new Map(bars().map((b,index)=>[b.timestamp,index])),expected=pro.getDrawings().map(d=>target(d,d.anchors.map(a=>({...a,timestamp:bars()[indices.get(a.timestamp)+direction].timestamp})))),before=state(pro),beforeMarkers=markers(pro),beforeEvents=events().length,finish=instrument()
   const sample={kind:'translate',direction,ids:expected.map(e=>e.id),expected,beforeRules:before,observerSupported:true};window.levelDenseSample=sample
   const capture=event=>{
    if(!event.isTrusted||event.target.closest('button')?.textContent.trim()!=='确认平移')return
    document.removeEventListener('click',capture,true);sample.start=performance.now();sample.trusted=true
    const check=()=>{
     if(pro.getDrawingHistoryState().pending){requestAnimationFrame(check);return}
     const last=pro.getDrawingState().lastResult
     if(last?.status!=='completed'||last.items.length!==1002){requestAnimationFrame(check);return}
     try{
      Object.assign(sample,geometry(pro,expected));sample.items=last.items.map(item=>item.status);assert(sample.items.every(s=>s==='confirmed'),'未逐对象确认');assert(markers(pro)===beforeMarkers&&events().length===beforeEvents,'平移改变提醒启用、去重或产生伪事件')
      requestAnimationFrame(()=>requestAnimationFrame(()=>{sample.end=performance.now();sample.latency=sample.end-sample.start;sample.status='completed';sample.afterRules=state(pro);void finish(sample)}))
     }catch(error){sample.error=error.message;sample.end=performance.now();sample.latency=sample.end-sample.start;void finish(sample)}
    };requestAnimationFrame(check)
   };document.addEventListener('click',capture,true)
  },
  async armRestore(){
   const pro=bench.charts[0],layout=captureLayout(pro),indices=new Map(bars().map((bar,index)=>[bar.timestamp,index]))
   for(const drawing of layout.drawings){drawing.anchors=drawing.anchors.map(a=>({...a,timestamp:bars()[indices.get(a.timestamp)+1].timestamp}));drawing.overlay.points=drawing.anchors.map(({timestamp,value})=>({timestamp,value}))}
   const current=new Map(pro.getDrawings().map(d=>[d.logicalId,d])),expected=layout.drawings.map(d=>target(current.get(d.logicalId),d.anchors)),beforeRules=state(pro),beforeMarkers=markers(pro),beforeEvents=events().length,finish=instrument()
   assert(beforeRules.length===100&&beforeRules.every(rule=>rule.enabled),'恢复前100条规则必须启用')
   const previous=pro.getDrawings();assert(previous.length===1002&&expected.every(target=>previous.find(d=>d.logicalId===target.id).anchors.some((a,index)=>a.timestamp!==target.anchors[index].timestamp)),'恢复必须同ID且实际改变几何')
   const sample={kind:'restore',ids:expected.map(e=>e.id),expected,beforeRules,observerSupported:true};window.levelDenseSample=sample
   restoreButton=document.createElement('button');restoreButton.textContent='恢复启用提醒的布局';restoreButton.style.minHeight='44px';document.body.prepend(restoreButton)
   restoreListener=async event=>{
    if(!event.isTrusted)return
    sample.start=performance.now();sample.trusted=true;restoring=true;restoreResolutions=0
    try{
     await restoreLayout(pro,layout);restoring=false
     assert(pro===bench.charts[0],'恢复替换了ChartPro实例');Object.assign(sample,geometry(pro,expected));sample.sameInstance=true;sample.afterRules=state(pro)
     assert(markers(pro)===beforeMarkers,'恢复丢失规则身份、启用意图或去重');assert(events().length===beforeEvents,'恢复产生伪提醒');assert(restoreResolutions===0,'恢复过程仍在解析提醒来源')
     sample.restoreResolutions=restoreResolutions;sample.eventsDuringRestore=events().length-beforeEvents;await bench.frame();sample.end=performance.now();sample.latency=sample.end-sample.start;sample.status='restored'
    }catch(error){restoring=false;sample.error=error.message;sample.end=performance.now();sample.latency=sample.end-sample.start}
    await finish(sample)
   };restoreButton.addEventListener('click',restoreListener)
  },
  async verifyRestoredObservations(){
   const pro=bench.charts[0],references=pro.getDrawings().slice(0,50).map(d=>{const [a,b,c]=d.anchors.map(a=>a.value);return d.overlay.name==='fibonacciLine'?b+(a-b)*.5:c+(b-a)*.5}),before=events().length
   await push(Math.min(...references)-1,false);await bench.frame();assert(events().length===before,'恢复后首点不应触发')
   await push(Math.max(...references)+1,true);await bench.frame();const triggered=events().slice(before)
   assert(triggered.length===50&&triggered.every(event=>event.level?.value===.5),'恢复后新bar必须触发全部50个Fib级别')
   return {firstSampleEvents:0,newBarEvents:triggered,enabled:state(pro).filter(s=>s.enabled).length}
  },
  release(){restoreButton?.removeEventListener('click',restoreListener);restoreButton?.remove();restoreButton=undefined;restoreListener=undefined;restoring=false;window.levelDenseSample=undefined},
  dispose(){this.release();DrawingAlertRuntime.prototype.resolve=resolve}
 }
}
