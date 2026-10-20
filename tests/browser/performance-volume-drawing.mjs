import {launchBrowser} from './support.mjs'
import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
const browser=await launchBrowser(),result={syntheticInputs:true,cases:{},gates:[],errors:[],measurement:'真实控制点事件的处理与自有绘制 CPU、后续渲染帧延迟；同根替换核对两个工具的成交量与均价。不是物理屏幕延迟。'}
const stats=xs=>{const sorted=[...xs].sort((a,b)=>a-b);return {n:xs.length,p50:sorted[Math.ceil(xs.length*.5)-1],p95:sorted[Math.ceil(xs.length*.95)-1]}}
const save=()=>writeFileSync(process.argv[2],JSON.stringify(result,null,2))
try{
 const page=await browser.newPage({viewport:{width:1280,height:1400},deviceScaleFactor:1});page.on('pageerror',e=>result.errors.push(e.message));await page.goto(`${process.env.TC_BROWSER_BASE}/tests/browser/drawing-performance.html`);await page.waitForFunction(()=>window.ready);result.browser=browser.version()
 for(const [count,layout] of [[10000,1],[50000,1],[10000,2],[10000,4]]){
  const key=`${count}x${layout}`,samples=[];result.cases[key]={count,layout,rows:192,samples}
  for(let round=0;round<10;round++){
   const mounted=await page.evaluate(options=>drawingBench.mount(options),{count,layout,n:0,volume:true});assert.ok(mounted.drawn.every(d=>d.count===2&&d.visible===2&&d.pane.width>0))
   const handle=page.getByRole('button',{name:'绘图控制点 2 · 量价区间',exact:true}).first();await handle.waitFor();const box=await handle.boundingBox();assert.ok(box);const point={x:box.x+box.width/2,y:box.y+box.height/2}
   await page.mouse.move(point.x,point.y);await page.mouse.down();await page.evaluate(()=>drawingBench.arm())
   for(let i=0;i<100;i++){await page.mouse.move(point.x-(i%2?18:42),point.y);await page.waitForFunction(n=>drawingBench.moves.length===n,i+1)}
   await page.mouse.up();await page.evaluate(()=>drawingBench.stop());await page.waitForFunction(()=>drawingBench.charts[0].getDrawingHistoryState().pending===0)
   const moves=await page.evaluate(()=>drawingBench.moves);assert.equal(moves.length,100);assert.ok(moves.every(m=>m.renderCallbacks>0));for(const m of moves)for(const tool of ['anchoredVwap','fixedRangeVolumeProfile'])assert.ok(m.volumeFigures?.[`0:${tool}`]>0,`主图 ${tool} 没有真实绘制`);assert.ok(moves.every((m,i)=>!i||m.anchor!==moves[i-1].anchor),'控制点每次实际改变参与区间');await page.evaluate(()=>drawingBench.resetVolumeRange())
   const updates=[];for(let i=0;i<100;i++)updates.push(await page.evaluate(()=>drawingBench.updateVolume()))
   const cleanup=await page.evaluate(()=>drawingBench.dispose());assert.deepEqual(cleanup,{subscriptions:0,dom:0});samples.push({...mounted,moves,updates,cleanup});save()
  }
  const summary={cold:stats(samples.map(s=>s.cold)),first:samples[0].cold,warm:stats(samples.slice(1).map(s=>s.cold)),cpu:stats(samples.flatMap(s=>s.moves.map(m=>m.cpu))),latency:stats(samples.flatMap(s=>s.moves.map(m=>m.latency))),updates:stats(samples.flatMap(s=>s.updates.map(m=>m.latency)))};Object.assign(result.cases[key],summary)
  for(const [metric,limit] of [['cpu',50],['latency',120],['updates',120]])result.gates.push({key,metric,p95:summary[metric].p95,limit,passed:summary[metric].p95<=limit})
  console.log(key,JSON.stringify(summary));save()
 }
 assert.deepEqual(result.errors,[]);assert.ok(result.gates.every(g=>g.passed),JSON.stringify(result.gates.filter(g=>!g.passed)))
}finally{save();await browser.close()}
