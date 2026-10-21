import {launchBrowser} from './support.mjs'
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'

const budgets=JSON.parse(readFileSync(new URL('./drawing-refinement-budgets.json',import.meta.url)))
const baseline=process.env.TC_DR_BASELINE==='1'
const result={syntheticInputs:true,scope:'chart-local',mode:baseline?'baseline-first-reorder':'formal',budgets,samples:[],errors:[]}
const save=()=>writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n')
const browser=await launchBrowser()
try{
  assert.equal(baseline,true,'Formal actions must be implemented before registering the complete suite')
  const page=await browser.newPage({viewport:{width:1280,height:1400}})
  page.on('pageerror',error=>result.errors.push(error.message))
  await page.goto(`${process.env.TC_BROWSER_BASE}/tests/browser/drawing-refinement-performance.html`)
  await page.waitForFunction(()=>window.ready)
  await page.evaluate(async()=>{
    await drawingBench.mount({count:10000,layout:1,n:1000,volume:true})
    const chart=drawingBench.charts[0]
    chart.restoreDrawings('local',chart.getDrawings().map((drawing,index)=>({...drawing,presentation:{...drawing.presentation,order:index,groupId:'refinement',groupName:'精修压测'}})))
    await chart.executeDrawingCommand({type:'select',ids:['bench-0000']})
    await drawingBench.frame()
  })
  await page.getByRole('button',{name:'绘图管理',exact:true}).click()
  const manager=page.getByRole('complementary',{name:'绘图管理'})
  await manager.getByLabel('排序目标',{exact:true}).selectOption('bench-0500')
  await manager.getByLabel('排序位置',{exact:true}).selectOption('before')
  await page.evaluate(()=>{
    if(!PerformanceObserver.supportedEntryTypes.includes('longtask'))throw Error('longtask observer unavailable')
    const tasks=[]
    const observer=new PerformanceObserver(list=>tasks.push(...list.getEntries().map(({startTime,duration})=>({startTime,duration}))))
    observer.observe({type:'longtask',buffered:true})
    const before=drawingBench.charts[0].getDrawings(),orders=new Map(before.map(d=>[d.logicalId,d.presentation.order]))
    const sample={action:'reorder',history:10000,round:1,before:before.length,renderCalls:0}
    const originals=new Map()
    for(const name of ['stroke','fill','fillRect','fillText']){
      const original=CanvasRenderingContext2D.prototype[name];originals.set(name,original)
      CanvasRenderingContext2D.prototype[name]=function(...args){if(sample.start!==undefined&&sample.end===undefined&&this.canvas.closest?.('#charts'))sample.renderCalls++;return original.apply(this,args)}
    }
    window.drSample=sample
    document.addEventListener('click',function capture(event){
      if(!event.isTrusted||event.target.textContent!=='应用排序')return
      document.removeEventListener('click',capture,true)
      sample.start=performance.now()
      const check=()=>{
        const pro=drawingBench.charts[0],state=pro.getDrawingHistoryState()
        if(state.pending){requestAnimationFrame(check);return}
        const objects=pro.getDrawings(),a=objects.find(d=>d.logicalId==='bench-0000'),b=objects.find(d=>d.logicalId==='bench-0500')
        if(!(a.presentation.order>b.presentation.order)){requestAnimationFrame(check);return}
        requestAnimationFrame(()=>requestAnimationFrame(()=>{
          sample.end=performance.now();sample.latency=sample.end-sample.start
          sample.after=objects.length;sample.status=pro.getDrawingState().lastResult?.status
          sample.changed=objects.filter(d=>orders.get(d.logicalId)!==d.presentation.order).length
          sample.order={source:a.presentation.order,target:b.presentation.order}
          setTimeout(()=>{
            tasks.push(...observer.takeRecords().map(({startTime,duration})=>({startTime,duration})));observer.disconnect()
            sample.longTasks=tasks.filter(task=>task.startTime<sample.end&&task.startTime+task.duration>sample.start)
            sample.maximumLongTask=Math.max(0,...sample.longTasks.map(task=>task.duration))
            for(const [name,original]of originals)CanvasRenderingContext2D.prototype[name]=original
            sample.complete=true
          },100)
        }))
      }
      requestAnimationFrame(check)
    },true)
  })
  let profiler
  if(process.env.TC_DR_PROFILE==='1'){
    profiler=await page.context().newCDPSession(page);await profiler.send('Profiler.enable');await profiler.send('Profiler.start')
  }
  await manager.getByRole('button',{name:'应用排序',exact:true}).click()
  await page.waitForFunction(()=>window.drSample?.complete,{},{timeout:60000})
  if(profiler){const {profile}=await profiler.send('Profiler.stop');writeFileSync(process.argv[2]+'.cpuprofile',JSON.stringify(profile))}
  const sample=await page.evaluate(()=>window.drSample)
  result.samples.push(sample);save()
  assert.equal(sample.before,1002);assert.equal(sample.after,1002);assert.ok(sample.changed>=1000);assert.equal(sample.status,'completed');assert.ok(sample.renderCalls>0)
  assert.deepEqual(result.errors,[])
  result.passed=sample.latency<=budgets.maximumLatency&&sample.maximumLongTask<=budgets.maximumLongTask
  save()
  console.log(JSON.stringify({mode:result.mode,latency:sample.latency,maximumLongTask:sample.maximumLongTask,passed:result.passed}))
  assert.ok(result.passed,'First full reorder exceeded the reviewed maximum gate')
}finally{save();await browser.close()}
