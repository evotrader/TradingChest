import {launchBrowser} from './support.mjs'
import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
const browser=await launchBrowser(),output=process.argv[2],result={syntheticInputs:true,dpr:1,viewport:{width:1280,height:1400},cases:{},gates:[],errors:[],measurement:'Trusted pointer event through real preview update and a subsequent rendering frame; JavaScript handlers plus owned rendering callback CPU. Not physical display latency.'}
const stats=xs=>{const sorted=[...xs].sort((a,b)=>a-b);return {n:xs.length,p50:sorted[Math.ceil(xs.length*.5)-1],p95:sorted[Math.ceil(xs.length*.95)-1]}}
const save=()=>writeFileSync(output,JSON.stringify(result,null,2)+'\n')
try{
 const page=await browser.newPage({viewport:result.viewport,deviceScaleFactor:1});page.on('pageerror',e=>result.errors.push(e.message));await page.goto(`${process.env.TC_BROWSER_BASE}/tests/browser/drawing-performance.html`);await page.waitForFunction(()=>window.ready)
 result.browser=browser.version()
 const cases=[10000,50000].flatMap(count=>[[1,100],[2,100],[4,100],[1,500],[1,1000]].map(([layout,n])=>({count,layout,n})))
 for(const options of cases){
  const key=`${options.count}x${options.layout}-objects${options.n}`,samples=[]
  for(let round=0;round<10;round++){
   const mounted=await page.evaluate(options=>drawingBench.mount(options),options);assert.ok(mounted.drawn.every(d=>d.count===options.n&&d.visible===options.n&&d.inBounds===options.n&&d.pane.width>0&&d.pane.height>0))
   const handle=page.getByRole('button',{name:'绘图控制点 1 · 压测 0000',exact:true});await handle.waitFor();const box=await handle.boundingBox();assert.ok(box);const point={x:box.x+22,y:box.y+22}
   await page.mouse.move(point.x,point.y);await page.mouse.down();await page.evaluate(()=>drawingBench.arm())
   for(let index=0;index<100;index++){await page.mouse.move(point.x+(index%11)-5,point.y+(index%7)-3);await page.waitForFunction(n=>drawingBench.moves.length===n,index+1)}
   await page.mouse.up();await page.evaluate(()=>drawingBench.stop());await page.waitForFunction(()=>drawingBench.charts[0].getDrawingHistoryState().pending===0)
   const moves=await page.evaluate(()=>drawingBench.moves);assert.equal(moves.length,100);assert.ok(moves.every(m=>m.renderCallbacks>0),'Latency sample did not include an actual chart rendering callback')
   const primary=page.locator('.klinecharts-pro').first();await primary.getByRole('button',{name:'绘图管理',exact:true}).click();const manager=primary.getByRole('complementary',{name:'绘图管理'}),search=manager.getByLabel('搜索绘图对象',{exact:true});await page.evaluate(()=>drawingBench.tree=[])
   for(let i=0;i<10;i++){await page.evaluate(()=>drawingBench.armTree('input'));await search.fill('压测 '+String(i).padStart(4,'0'));await page.waitForFunction(n=>drawingBench.tree.length===n,i*2+1);await manager.locator(`[data-drawing-id="bench-${String(i).padStart(4,'0')}"] .tc-drawing-object-name`).waitFor();await page.evaluate(()=>drawingBench.armTree('click'));await manager.locator(`[data-drawing-id="bench-${String(i).padStart(4,'0')}"] .tc-drawing-object-name`).click();await page.waitForFunction(n=>drawingBench.tree.length===n,i*2+2)}
   const tree=await page.evaluate(()=>drawingBench.tree),cleanup=await page.evaluate(()=>drawingBench.dispose());assert.deepEqual(cleanup,{subscriptions:0,dom:0});samples.push({...mounted,moves,tree,cleanup});result.cases[key]={options,samples};save()
  }
  const summary={cold:stats(samples.map(s=>s.cold)),cpu:stats(samples.flatMap(s=>s.moves.map(m=>m.cpu))),latency:stats(samples.flatMap(s=>s.moves.map(m=>m.latency))),tree:stats(samples.flatMap(s=>s.tree)),first:samples[0].cold,warm:stats(samples.slice(1).map(s=>s.cold))};Object.assign(result.cases[key],summary)
  const limits=options.n===100?[20,50,100]:options.n===500?[33.4,80,150]:[50,120,200]
  for(const [i,metric] of ['cpu','latency','tree'].entries())result.gates.push({key,metric,p95:summary[metric].p95,limit:limits[i],passed:summary[metric].p95<=limits[i]})
  console.log(key,JSON.stringify(summary));save()
 }
 assert.deepEqual(result.errors,[]);assert.ok(result.gates.every(g=>g.passed),JSON.stringify(result.gates.filter(g=>!g.passed)))
}finally{save();await browser.close()}
