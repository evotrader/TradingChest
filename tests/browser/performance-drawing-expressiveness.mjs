import {launchBrowser} from './support.mjs'
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import path from 'node:path'
import {expressivenessBudgets as budgets,restoreTargets} from './drawing-expressiveness-limits.mjs'

const diagnostic=process.env.TC_DE_DIAGNOSTIC==='1',result={syntheticInputs:true,mode:diagnostic?'diagnostic':'formal',budgets,cases:[],gates:[],errors:[]},save=()=>writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n')
const stats=values=>{assert.ok(values.length&&values.every(Number.isFinite));const sorted=[...values].sort((a,b)=>a-b);return {n:values.length,p95:sorted[Math.ceil(sorted.length*.95)-1],maximum:sorted.at(-1)}}
// Read the original arrays before starting any browser or new workload.
assert.ok(process.env.TC_DE_BASELINE,'TC_DE_BASELINE is required')
const baseline=JSON.parse(readFileSync(process.env.TC_DE_BASELINE,'utf8')),candidate=JSON.parse(readFileSync(path.resolve(process.argv[2],'../../performance-drawing-refinement/evidence.json'),'utf8'))
result.gates.push(...restoreTargets(baseline,candidate))
const browser=await launchBrowser()
try{
 const page=await browser.newPage({viewport:{width:1280,height:1400},deviceScaleFactor:1});page.on('pageerror',error=>result.errors.push(error.message));result.browser=browser.version();result.node=process.version
 await page.goto(`${process.env.TC_BROWSER_BASE}/tests/browser/drawing-expressiveness-performance.html`)
 const frame=page.frames().find(frame=>frame.url().includes('drawing-refinement-performance.html'));assert.ok(frame);await frame.waitForFunction(()=>window.ready);assert.equal(await frame.evaluate(()=>PerformanceObserver.supportedEntryTypes.includes('longtask')),true)
 const manager=frame.getByRole('complementary',{name:'绘图管理',exact:true}),form=manager.getByRole('form',{name:'精确平移',exact:true})
 const mount=async(history,options={})=>{await frame.evaluate(count=>drawingBench.mount({count,n:1000,volume:true}),history);return frame.evaluate(options=>drawingBench.configure(options),options)}
 const dispose=async()=>{const cleanup=await frame.evaluate(()=>drawingBench.dispose());assert.deepEqual(cleanup,{subscriptions:0,dom:0});return cleanup}
 for(const history of budgets.histories){
  const entry={history,labels:[],menus:[],ordinary:[],mixed:[]};result.cases.push(entry)
  for(const labels of [0,100])for(let round=1;round<=(diagnostic?1:budgets.mounts);round++){
   const geometry=await mount(history,{labels});assert.equal(geometry.objects,1002);if(labels)assert.ok(geometry.labelFigures>=100)
   const updates=[];for(let index=0;index<(diagnostic?2:budgets.updates);index++)updates.push(await frame.evaluate(()=>drawingBench.updateLabels()))
   assert.ok(updates.every(update=>update.count===history&&update.analytics.avwap===history&&update.analytics.profile===history));entry.labels.push({labels,round,geometry,updates,cleanup:await dispose()});save()
  }
  const zero=stats(entry.labels.filter(sample=>sample.labels===0).flatMap(sample=>sample.updates.map(update=>update.latency))),hundred=stats(entry.labels.filter(sample=>sample.labels===100).flatMap(sample=>sample.updates.map(update=>update.latency)))
  result.gates.push({history,metric:'visible-label-update-increment',zero,hundred,increment:hundred.p95-zero.p95,limit:budgets.labelIncrement,passed:hundred.p95-zero.p95<=budgets.labelIncrement});save()

  const overlap=await mount(history,{overlap:true});assert.equal(overlap.objects,1002)
  for(let round=1;round<=(diagnostic?1:budgets.menuRounds);round++){
   await frame.evaluate(()=>{
    window.deSample={};const capture=event=>{if(!event.isTrusted)return;document.removeEventListener('contextmenu',capture,true);deSample.start=performance.now();deSample.trusted=true
     const check=()=>{const list=document.querySelector('[role=listbox][aria-label="选择此处对象"]'),rows=list?.querySelectorAll('[role=option]');if(!rows?.length||rows[0].getAttribute('aria-setsize')!=='1002'){requestAnimationFrame(check);return}requestAnimationFrame(()=>requestAnimationFrame(()=>{deSample.end=performance.now();deSample.latency=deSample.end-deSample.start;deSample.rows=rows.length;deSample.count=Number(rows[0].getAttribute('aria-setsize'));deSample.complete=true}))};requestAnimationFrame(check)
    };document.addEventListener('contextmenu',capture,true)
   })
   await page.mouse.click(overlap.point.x,overlap.point.y,{button:'right'});await frame.getByRole('menuitem',{name:'选择此处对象（1002）',exact:true}).click();await frame.waitForFunction(()=>window.deSample?.complete)
   const sample=await frame.evaluate(()=>deSample);assert.equal(sample.trusted,true);assert.equal(sample.count,1002);assert.ok(sample.rows>0&&sample.rows<=60);entry.menus.push({round,...sample});await page.keyboard.press('Escape');save()
  }
  entry.menuCleanup=await dispose();const menu=stats(entry.menus.map(sample=>sample.latency));result.gates.push({history,metric:'full-overlap-menu',...menu,limit:budgets.menuP95,passed:menu.p95<=budgets.menuP95});save()

  for(const mixed of [false,true]){
   await mount(history,{interior:true});const ids=await frame.evaluate(mixed=>drawingBench.charts[0].getDrawings().slice(0,mixed?1002:20).map(drawing=>drawing.logicalId),mixed)
   assert.equal(ids.length,mixed?1002:20);await frame.evaluate(ids=>drawingBench.charts[0].executeDrawingCommand({type:'select',ids}),ids)
   await frame.getByRole('button',{name:'绘图管理',exact:true}).click()
   for(let round=1;round<=(diagnostic?1:mixed?budgets.mixedRounds:budgets.ordinaryRounds);round++)for(const direction of [-1,1]){
    await manager.getByRole('button',{name:'精确平移',exact:true}).click();await form.getByRole('spinbutton',{name:'K线根数',exact:true}).fill(String(direction))
    if(!mixed)await form.getByRole('spinbutton',{name:'价格位移',exact:true}).fill(String(-direction*.01))
    await frame.evaluate(({ids,direction,mixed})=>{
     const pro=drawingBench.charts[0],bars=pro.getChart().getDataList(),indices=new Map(bars.map((bar,index)=>[bar.timestamp,index])),expected=pro.getDrawings().filter(drawing=>ids.includes(drawing.logicalId)).map(drawing=>({id:drawing.logicalId,anchors:drawing.anchors.map(anchor=>({...anchor,timestamp:bars[indices.get(anchor.timestamp)+direction].timestamp,value:anchor.value+(mixed?0:-direction*.01)}))}))
     window.deSample={ids,expected,observerSupported:PerformanceObserver.supportedEntryTypes.includes('longtask')};if(!deSample.observerSupported)throw Error('longtask observer required')
     const tasks=[],observer=new PerformanceObserver(list=>tasks.push(...list.getEntries().map(({startTime,duration})=>({startTime,duration}))));observer.observe({type:'longtask',buffered:true})
     const capture=event=>{if(!event.isTrusted||event.target.closest('button')?.textContent.trim()!=='确认平移')return;document.removeEventListener('click',capture,true);deSample.start=performance.now();deSample.trusted=true
      const check=()=>{const state=pro.getDrawingHistoryState(),last=pro.getDrawingState().lastResult;if(state.pending||last?.command!=='translate'&&last?.type!=='translate'&&last?.status!=='completed'){requestAnimationFrame(check);return}
       const objects=new Map(pro.getDrawings().map(drawing=>[drawing.logicalId,drawing])),native=new Map(pro.getChart().getOverlays().map(overlay=>[overlay.id,overlay]))
       const matches=expected.every(target=>{const actual=objects.get(target.id),projection=native.get(target.id);return actual?.anchors.length===target.anchors.length&&projection?.points.length===target.anchors.length&&target.anchors.every((anchor,index)=>actual.anchors[index].timestamp===anchor.timestamp&&Math.abs(actual.anchors[index].value-anchor.value)<1e-9&&projection.points[index].timestamp===anchor.timestamp&&Math.abs(projection.points[index].value-anchor.value)<1e-9)})
       if(!matches||Object.values(pro.getDrawingState().analytics).some(value=>value.status!=='ready')){requestAnimationFrame(check);return}
       requestAnimationFrame(()=>requestAnimationFrame(async()=>{deSample.end=performance.now();deSample.latency=deSample.end-deSample.start;deSample.objects=objects.size;deSample.native=native.size;deSample.status=last.status;deSample.items=last.items.map(item=>item.status);deSample.history=state;await new Promise(resolve=>setTimeout(resolve,100));tasks.push(...observer.takeRecords().map(({startTime,duration})=>({startTime,duration})));observer.disconnect();deSample.longTasks=tasks.filter(task=>task.startTime<deSample.end&&task.startTime+task.duration>deSample.start);deSample.maximumLongTask=Math.max(0,...deSample.longTasks.map(task=>task.duration));deSample.complete=true}))
      };requestAnimationFrame(check)
     };document.addEventListener('click',capture,true)
    },{ids,direction,mixed})
    let profiler
    if(diagnostic&&process.env.TC_DE_PROFILE==='1'&&mixed&&round===1&&direction===-1){profiler=await page.context().newCDPSession(page);await profiler.send('Profiler.enable');await profiler.send('Profiler.start')}
    await form.getByRole('button',{name:'确认平移',exact:true}).click();await frame.waitForFunction(()=>window.deSample?.complete,{},{timeout:60000});const sample=await frame.evaluate(()=>deSample)
    if(profiler){const {profile}=await profiler.send('Profiler.stop');writeFileSync(process.argv[2]+`.${history}.mixed.cpuprofile`,JSON.stringify(profile));await profiler.detach()}
    assert.equal(sample.trusted,true);assert.equal(sample.status,'completed');assert.equal(sample.objects,1002);assert.equal(sample.native,1002);assert.equal(sample.items.length,ids.length);assert.ok(sample.items.every(status=>status==='confirmed'));assert.equal(sample.history.pending,0);assert.equal(sample.history.uncertainLogicalIds.length,0);assert.deepEqual(sample.history.projectionErrors,{});assert.ok(Number.isFinite(sample.maximumLongTask));assert.ok(Number.isFinite(sample.latency))
    entry[mixed?'mixed':'ordinary'].push({round,direction,...sample});save()
   }
   entry[mixed?'mixedCleanup':'ordinaryCleanup']=await dispose();const summary=stats(entry[mixed?'mixed':'ordinary'].map(sample=>sample.latency)),limit=mixed?budgets.mixedMaximum:budgets.ordinaryMaximum;result.gates.push({history,metric:mixed?'mixed1002-translate':'ordinary20-translate',...summary,limit,passed:summary.maximum<=limit});save()
  }
 }
 assert.deepEqual(result.errors,[]);result.passed=!diagnostic&&result.gates.length===10&&result.gates.every(gate=>gate.passed);save();console.log(JSON.stringify({passed:result.passed,gates:result.gates}));if(!diagnostic)assert.ok(result.passed,'Expressiveness performance gates failed')
}finally{save();await browser.close()}
