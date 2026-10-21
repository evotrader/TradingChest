import {launchBrowser} from './support.mjs'
import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
const diagnostic=process.env.TC_MIXED_DIAGNOSTIC==='1',rounds=diagnostic?1:10,browser=await launchBrowser(),result={syntheticInputs:true,mode:diagnostic?'diagnostic':'formal',workload:{curve:200,doubleCurve:200,arc:200,ordinary:400,avwap:1,bands:3,frvp:1,rows:192,levelExtent:'pane-right'},cases:{},gates:[],errors:[],measurement:'真实控制点事件至几何更新和后续帧；自有处理/绘制CPU、同根更新和对象树。非物理屏幕延迟。'}
const stats=xs=>{assert.ok(xs.length&&xs.every(Number.isFinite));const sorted=[...xs].sort((a,b)=>a-b);return {n:xs.length,p50:sorted[Math.ceil(xs.length*.5)-1],p95:sorted[Math.ceil(xs.length*.95)-1]}},save=()=>writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n')
try{
 const page=await browser.newPage({viewport:{width:1280,height:1400},deviceScaleFactor:1});page.on('pageerror',e=>result.errors.push(e.message));await page.goto(`${process.env.TC_BROWSER_BASE}/tests/browser/drawing-refinement-mixed.html`);await page.waitForFunction(()=>window.ready);result.browser=browser.version()
 for(const count of [10000,50000]){
  const key=String(count),samples=[];result.cases[key]={count,samples}
  for(let round=0;round<rounds;round++){
   const mounted=await page.evaluate(count=>drawingBench.mount({count,layout:1,n:1000,volume:true}),count);assert.equal(mounted.drawn[0].count,1002);assert.equal(mounted.drawn[0].visible,1002);assert.ok(mounted.drawn[0].inBounds>=1000)
   const target='bench-'+String((round%3)*200).padStart(4,'0');await page.evaluate(id=>drawingBench.charts[0].executeDrawingCommand({type:'select',ids:[id]}),target)
   const handle=page.getByRole('button',{name:'绘图控制点 1 · 压测 '+target.slice(-4),exact:true});await handle.waitFor();const box=await handle.boundingBox();assert.ok(box);const point={x:box.x+22,y:box.y+22}
   await page.mouse.move(point.x,point.y);await page.mouse.down();await page.evaluate(id=>drawingBench.arm(id),target)
   for(let i=0;i<100;i++){await page.mouse.move(point.x+(i%11)-5,point.y+(i%7)-3);await page.waitForFunction(n=>drawingBench.moves.length===n,i+1)}
   await page.mouse.up();await page.evaluate(()=>drawingBench.stop());await page.waitForFunction(()=>drawingBench.charts[0].getDrawingHistoryState().pending===0)
   const moves=await page.evaluate(()=>drawingBench.moves);assert.equal(moves.length,100)
   for(const [i,m]of moves.entries()){
    assert.ok(m.renderCallbacks>0&&m.bandLines>=7,JSON.stringify(m));for(const name of ['anchoredVwap','fixedRangeVolumeProfile'])assert.ok(m.volumeFigures?.[`0:${name}`]>0);for(const name of ['curve','doubleCurve','arc'])assert.ok(m.curveFigures?.[name]>0)
    assert.ok(m.geometry?.length>=3);if(i)assert.notDeepEqual(m.geometry,moves[i-1].geometry,'每次拖动必须真实改变目标几何')
   }
   await page.evaluate(()=>drawingBench.resetVolumeRange());const updates=[];for(let i=0;i<100;i++)updates.push(await page.evaluate(()=>drawingBench.updateVolume()))
   const root=page.locator('.klinecharts-pro').first();await root.getByRole('button',{name:'绘图管理',exact:true}).click();const manager=root.getByRole('complementary',{name:'绘图管理'}),search=manager.getByLabel('搜索绘图对象',{exact:true});await page.evaluate(()=>drawingBench.tree=[])
   for(let i=0;i<10;i++){
    const id='bench-'+String(i).padStart(4,'0');await page.evaluate(()=>drawingBench.armTree('input'));await search.fill('压测 '+String(i).padStart(4,'0'));await page.waitForFunction(n=>drawingBench.tree.length===n,i*2+1)
    const row=manager.locator(`[data-drawing-id="${id}"] .tc-drawing-object-name`);await row.waitFor();await page.evaluate(()=>drawingBench.armTree('click'));await row.click();await page.waitForFunction(n=>drawingBench.tree.length===n,i*2+2);await page.waitForFunction(id=>drawingBench.charts[0].getDrawingState().selectedIds.includes(id),id)
   }
   const tree=await page.evaluate(()=>drawingBench.tree);assert.equal(tree.length,20);const cleanup=await page.evaluate(()=>drawingBench.dispose());assert.deepEqual(cleanup,{subscriptions:0,dom:0});samples.push({round:round+1,target,...mounted,moves,updates,tree,cleanup});save()
  }
  const summary={cpu:stats(samples.flatMap(s=>s.moves.map(m=>m.cpu))),latency:stats(samples.flatMap(s=>s.moves.map(m=>m.latency))),updates:stats(samples.flatMap(s=>s.updates.map(m=>m.latency))),tree:stats(samples.flatMap(s=>s.tree))};Object.assign(result.cases[key],summary)
  for(const [metric,limit]of [['cpu',50],['latency',120],['updates',120],['tree',200]])result.gates.push({key,metric,p95:summary[metric].p95,limit,passed:summary[metric].p95<=limit})
  assert.equal(summary.cpu.n,rounds*100);assert.equal(summary.latency.n,rounds*100);assert.equal(summary.updates.n,rounds*100);assert.equal(summary.tree.n,rounds*20);console.log(key,JSON.stringify(summary));save()
 }
 assert.deepEqual(result.errors,[]);result.passed=result.gates.length===8&&result.gates.every(g=>g.passed);save();assert.ok(result.passed,JSON.stringify(result.gates.filter(g=>!g.passed)))
}finally{save();await browser.close()}
