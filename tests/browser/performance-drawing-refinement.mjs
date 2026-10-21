import {launchBrowser} from './support.mjs'
import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
import {refinementBudgets as budgets,refinementLimits} from './drawing-refinement-limits.mjs'
const baseline=process.env.TC_DR_BASELINE==='1',diagnostic=!!process.env.TC_DR_DIAGNOSTIC
const actions=baseline?['reorder']:diagnostic?process.env.TC_DR_DIAGNOSTIC.split(','):budgets.actions,histories=baseline?[10000]:diagnostic?(process.env.TC_DR_DIAGNOSTIC_HISTORY?process.env.TC_DR_DIAGNOSTIC_HISTORY.split(',').map(Number):[10000]):budgets.history,rounds=baseline||diagnostic?1:budgets.rounds
assert.ok(actions.every(action=>budgets.actions.includes(action)))
assert.ok(histories.every(history=>budgets.history.includes(history)))
assert.ok(baseline||diagnostic||!['TC_DR_PROFILE','TC_DR_TIMELINE','TC_DR_DOM'].some(key=>process.env[key]==='1'),'Formal samples must not enable diagnostic instrumentation')
const result={syntheticInputs:true,scope:'chart-local',mode:baseline?'baseline-first-reorder':diagnostic?'diagnostic':'formal',budgets,samples:[],gates:[],errors:[]},save=()=>writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n'),browser=await launchBrowser()
try{
 const page=await browser.newPage({viewport:{width:1280,height:1400}});page.on('pageerror',e=>result.errors.push(e.message));result.browser=browser.version()
 await page.goto(`${process.env.TC_BROWSER_BASE}/tests/browser/drawing-refinement-performance.html`);await page.waitForFunction(()=>window.ready)
 for(const history of histories)for(const action of actions)for(let round=1;round<=rounds;round++){
  let sample={history,action,round}
  try{
   await page.evaluate(()=>{window.drSample=undefined;window.finishDR=undefined})
   await page.evaluate(options=>drawingBench.mount(options),{count:history,n:1000,volume:true,restoreUI:action==='restore'})
   await page.evaluate(async action=>{
    const pro=drawingBench.charts[0],objects=pro.getDrawings(),ids=objects.map(d=>d.logicalId)
    if(objects.length!==1002)throw Error('必须挂载完整1002对象')
    if(action==='reorder'){pro.restoreDrawings('local',objects.map((d,index)=>({...d,presentation:{...d.presentation,order:index,groupId:'refinement',groupName:'精修压测'}})));await pro.executeDrawingCommand({type:'select',ids:['bench-0000']})}
    else if(['style','delete'].includes(action))await pro.executeDrawingCommand({type:'select',ids})
    else if(['undo','redo'].includes(action)){
     const result=await pro.executeDrawingCommand({type:'update',ids,patch:{overlay:{styles:{line:{color:'#f44336'},polygon:{borderColor:'#f44336'},circle:{borderColor:'#f44336'},rect:{borderColor:'#f44336'}}}}})
     if(result.status!=='completed'||result.items.length!==1002)throw Error('前置真实事务未完成')
     if(action==='redo'){await pro.executeDrawingCommand({type:'undo'});if(pro.getDrawings().some(d=>d.overlay.styles?.line?.color==='#f44336'))throw Error('前置undo未真实恢复')}
    }
    await drawingBench.frame()
   },action)
   const manager=page.getByRole('complementary',{name:'绘图管理'}),bar=page.getByRole('region',{name:'绘图属性'})
   let trigger
   if(action==='reorder'){
    await page.getByRole('button',{name:'绘图管理',exact:true}).click();await manager.getByLabel('排序目标',{exact:true}).selectOption('bench-0500');await manager.getByLabel('排序位置',{exact:true}).selectOption('before');trigger=manager.getByRole('button',{name:'应用排序',exact:true})
   }else if(action==='style'){await bar.getByRole('button',{name:'描边颜色',exact:true}).click();trigger=bar.getByRole('button',{name:'#f44336',exact:true})}
   else if(action==='delete')trigger=bar.getByRole('button',{name:'删除绘图',exact:true})
   else if(action==='undo'||action==='redo')trigger=page.getByRole('button',{name:action==='undo'?'撤销绘图':'重做绘图',exact:true})
   else{
    const workspace=page.locator('.tc-workspace');await workspace.getByLabel('工作台名称',{exact:true}).fill('精修全量恢复');await workspace.getByRole('button',{name:'另存',exact:true}).click();await workspace.locator('.tc-workspace-notice').filter({hasText:'已保存'}).waitFor()
    await page.evaluate(async()=>{const p=drawingBench.charts[0],r=await p.executeDrawingCommand({type:'delete',ids:p.getDrawings().map(d=>d.logicalId)});if(r.status!=='completed')throw Error('恢复前置清空未完成')});trigger=workspace.getByRole('button',{name:'加载工作台',exact:true})
   }
   const label=action==='reorder'?'应用排序':action==='style'?'#f44336':action==='delete'?'删除绘图':action==='undo'?'撤销绘图':action==='redo'?'重做绘图':'加载工作台'
   await page.evaluate(({action,history,round,label})=>{
    if(!PerformanceObserver.supportedEntryTypes.includes('longtask'))throw Error('longtask observer unavailable')
    const tasks=[],observer=new PerformanceObserver(list=>tasks.push(...list.getEntries().map(({startTime,duration})=>({startTime,duration}))))
    observer.observe({type:'longtask',buffered:true})
    const before=drawingBench.charts[0].getDrawings(),orders=new Map(before.map(d=>[d.logicalId,d.presentation?.order])),sample={action,history,round,before:before.length,beforeIds:before.map(d=>d.logicalId),renderCalls:0,observerSupported:true,metricsBefore:drawingBench.metrics},originals=new Map()
    for(const name of ['stroke','fill','fillRect','fillText']){const original=CanvasRenderingContext2D.prototype[name];originals.set(name,original);CanvasRenderingContext2D.prototype[name]=function(...args){if(sample.start!==undefined&&sample.end===undefined&&this.canvas.closest?.('#charts'))sample.renderCalls++;return original.apply(this,args)}}
    window.drSample=sample
    let finished=false
    const finish=async()=>{
     if(finished)return;finished=true;sample.end??=performance.now();sample.latency=sample.start===undefined?undefined:sample.end-sample.start
     await new Promise(r=>setTimeout(r,100));tasks.push(...observer.takeRecords().map(({startTime,duration})=>({startTime,duration})));observer.disconnect()
     sample.longTasks=tasks.filter(task=>sample.start!==undefined&&task.startTime<sample.end&&task.startTime+task.duration>sample.start);sample.maximumLongTask=Math.max(0,...sample.longTasks.map(task=>task.duration))
     for(const [name,original]of originals)CanvasRenderingContext2D.prototype[name]=original
     document.removeEventListener('click',capture,true);sample.complete=true
    }
    window.finishDR=finish
    const capture=event=>{
     const button=event.target.closest('button');if(!event.isTrusted||!button||(button.getAttribute('aria-label')??button.textContent.trim())!==label)return
     document.removeEventListener('click',capture,true);sample.start=performance.now();sample.trusted=true
     const check=()=>{
      if(finished)return
      try{
       const pro=drawingBench.charts[0],state=pro.getDrawingHistoryState();if(state.pending){requestAnimationFrame(check);return}
       const objects=pro.getDrawings(),native=pro.getChart().getOverlays(),a=objects.find(d=>d.logicalId==='bench-0000'),b=objects.find(d=>d.logicalId==='bench-0500')
       let ready=action==='delete'?objects.length===0&&native.length===0:action==='reorder'?a?.presentation.order>b?.presentation.order:action==='undo'?objects.length===1002&&objects.every(d=>d.overlay.styles?.line?.color!=='#f44336'):action==='style'||action==='redo'?objects.length===1002&&objects.every(d=>d.overlay.styles?.line?.color==='#f44336'):objects.length===1002&&native.length===1002&&!!pro.getAnalysisContext()&&document.querySelector('.tc-workspace-notice')?.textContent.includes('已恢复')
       if(action==='style'||action==='redo')ready&&=native.every(overlay=>overlay.styles?.line?.color==='#f44336')
       if(action==='undo')ready&&=native.every(overlay=>overlay.styles?.line?.color!=='#f44336')
       if(action==='reorder')ready&&=native.find(o=>o.id===a.logicalId)?.zLevel===a.presentation.order&&native.find(o=>o.id===b.logicalId)?.zLevel===b.presentation.order
       if(!ready){requestAnimationFrame(check);return}
       sample.after=objects.length;sample.afterIds=objects.map(d=>d.logicalId);sample.nativeCount=native.length;sample.historyState=state;const command=pro.getDrawingState().lastResult;sample.status=action==='restore'?'restored':command?.status;sample.itemStatuses=command?.items.map(item=>item.status)
       sample.changed=objects.filter(d=>orders.get(d.logicalId)!==d.presentation?.order).length;sample.order=action==='reorder'?{source:a.presentation.order,target:b.presentation.order}:undefined
       if(objects.some(d=>native.find(o=>o.id===d.logicalId)?.points.length!==d.overlay.points.length))throw Error('实际引擎点数不符')
       requestAnimationFrame(()=>requestAnimationFrame(()=>{sample.end=performance.now();sample.metricsAfter=drawingBench.metrics;void finish()}))
      }catch(error){sample.error=error.message;void finish()}
     };requestAnimationFrame(check)
    };document.addEventListener('click',capture,true)
   },{action,history,round,label})
   if(process.env.TC_DR_DOM==='1')await page.evaluate(()=>{
    const chart=drawingBench.charts[0].getChart();window.drDebugSnap=()=>({size:chart.getSize(),pane:chart.getSize('candle_pane','main'),handles:document.querySelectorAll('.tc-drawing-handle').length,labels:document.querySelectorAll('.tc-drawing-axis-label').length})
    drSample.debug={before:drDebugSnap(),changes:{},sizes:[]}
    const observer=new MutationObserver(records=>{for(const r of records){const key=r.target.className+':'+r.type+':'+r.attributeName;drSample.debug.changes[key]=(drSample.debug.changes[key]??0)+1}const size=chart.getSize();if(JSON.stringify(drSample.debug.sizes.at(-1))!==JSON.stringify(size))drSample.debug.sizes.push(size)})
    observer.observe(document.querySelector('.klinecharts-pro-content'),{attributes:true,childList:true,subtree:true});window.drDebugObserver=observer
   })
   let profiler
   if(process.env.TC_DR_PROFILE==='1'){profiler=await page.context().newCDPSession(page);await profiler.send('Profiler.enable');await profiler.send('Profiler.start');if(process.env.TC_DR_TIMELINE==='1'){const events=[];profiler.on('Tracing.dataCollected',data=>events.push(...data.value));profiler._traceEvents=events;await profiler.send('Tracing.start',{categories:'devtools.timeline,blink.user_timing,disabled-by-default-devtools.timeline',transferMode:'ReportEvents'})}}
   await trigger.click();await page.waitForFunction(()=>window.drSample?.complete,{},{timeout:60000});sample=await page.evaluate(()=>{if(window.drDebugSnap){drSample.debug.after=drDebugSnap();drDebugObserver.disconnect()}return window.drSample})
   if(profiler){if(process.env.TC_DR_TIMELINE==='1'){const done=new Promise(resolve=>profiler.once('Tracing.tracingComplete',resolve));await profiler.send('Tracing.end');await done;writeFileSync(process.argv[2]+`.${action}.timeline.json`,JSON.stringify(profiler._traceEvents))}const {profile}=await profiler.send('Profiler.stop');writeFileSync(process.argv[2]+`.${action}.cpuprofile`,JSON.stringify(profile));await profiler.detach()}
   assert.equal(sample.trusted,true);assert.equal(sample.observerSupported,true);assert.ok(Number.isFinite(sample.latency));assert.ok(Number.isFinite(sample.maximumLongTask));assert.ok(sample.renderCalls>0);assert.equal(sample.historyState.pending,0);assert.equal(sample.historyState.uncertainLogicalIds.length,0);assert.equal(sample.historyState.error,undefined);assert.deepEqual(sample.historyState.projectionErrors,{});assert.equal(sample.error,undefined)
   assert.equal(sample.before,action==='restore'?0:1002);assert.equal(sample.after,action==='delete'?0:1002);assert.equal(sample.nativeCount,sample.after);assert.equal(sample.status,action==='restore'?'restored':'completed')
   if(action==='reorder')assert.ok(sample.changed>=1000)
   if(['style','delete','undo','redo'].includes(action)){assert.equal(sample.itemStatuses.length,1002);assert.ok(sample.itemStatuses.every(status=>status==='confirmed'))}
   const delta=field=>sample.metricsAfter[field]-sample.metricsBefore[field]
   if(['style','undo','redo'].includes(action))assert.equal(delta('update'),1002)
   if(action==='delete')assert.equal(delta('delete'),1002)
   if(action==='restore'||action==='reorder')assert.equal(delta('update'),0)
  }catch(error){await page.evaluate(()=>window.finishDR?.()).catch(()=>{});const actual=await page.evaluate(()=>window.drSample).catch(()=>undefined);sample={...sample,...actual,history,action,round,error:error.stack}}
  finally{sample.cleanup=await page.evaluate(()=>drawingBench.dispose()).catch(error=>({error:error.message}));const limit=refinementLimits(history,action);sample.passed=!sample.error&&sample.cleanup.subscriptions===0&&sample.cleanup.dom===0&&Number.isFinite(sample.latency)&&sample.latency<=limit.latency&&sample.maximumLongTask<=limit.longTask;result.samples.push(sample);save();console.log(JSON.stringify({history,action,round,latency:sample.latency,longtask:sample.maximumLongTask,passed:sample.passed,error:sample.error?.split('\n')[0]}))}
 }
 for(const history of histories)for(const action of actions){const samples=result.samples.filter(s=>s.history===history&&s.action===action),limit=refinementLimits(history,action);result.gates.push({history,action,n:samples.length,maximum:Math.max(...samples.map(s=>s.latency??Infinity)),maximumLongTask:Math.max(...samples.map(s=>s.maximumLongTask??Infinity)),limit:limit.latency,longTaskLimit:limit.longTask,passed:samples.length===rounds&&samples.every(s=>s.passed)})}
 result.passed=result.errors.length===0&&result.gates.every(g=>g.passed)&&result.samples.length===histories.length*actions.length*rounds;save();assert.ok(result.passed,'Reviewed maximum-latency gates failed')
}finally{save();await browser.close()}
