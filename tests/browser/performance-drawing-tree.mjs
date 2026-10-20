import {launchBrowser} from './support.mjs'
import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
// Operator approved the 225ms tree ceiling on 2026-10-20; all 500 original events are retained.
const browser=await launchBrowser(),result={syntheticInputs:true,objects:1002,samples:[],errors:[],limit:225,measurement:'可信搜索、折叠、定位和排序事件至后续渲染帧；检查实际对象树和命令结果。'}
const save=()=>writeFileSync(process.argv[2],JSON.stringify(result,null,2))
try{
 const page=await browser.newPage({viewport:{width:1280,height:1400}});page.on('pageerror',e=>result.errors.push(e.message));await page.goto(`${process.env.TC_BROWSER_BASE}/tests/browser/drawing-performance.html`);await page.waitForFunction(()=>window.ready)
 for(let round=0;round<10;round++){
  const mounted=await page.evaluate(async()=>{const m=await drawingBench.mount({count:10000,layout:1,n:1000,volume:true}),p=drawingBench.charts[0];p.restoreDrawings('local',p.getDrawings().map(d=>({...d,presentation:{...d.presentation,groupId:'performance',groupName:'压测组'}})));return m});assert.equal(mounted.drawn[0].count,1002)
  await page.getByRole('button',{name:'绘图管理',exact:true}).click();const manager=page.getByRole('complementary',{name:'绘图管理'}),tree=manager.getByRole('tree',{name:'绘图对象',exact:true}),search=manager.getByLabel('搜索绘图对象',{exact:true});await page.evaluate(()=>drawingBench.tree=[])
  let count=0
  const measured=async(type,action)=>{await page.evaluate(type=>drawingBench.armTree(type),type);await action();await page.waitForFunction(n=>drawingBench.tree.length===n,++count)}
  for(let i=0;i<10;i++){
   const id=`bench-${String(i).padStart(4,'0')}`
   await measured('input',()=>search.fill(`压测 ${String(i).padStart(4,'0')}`));await manager.locator(`[data-drawing-id="${id}"]`).waitFor()
   await measured('click',()=>manager.locator(`[data-drawing-id="${id}"] .tc-drawing-object-name`).click());assert.ok((await page.evaluate(()=>drawingBench.charts[0].getDrawingState().selectedIds)).includes(id))
   await search.fill('');await tree.scrollIntoViewIfNeeded();await tree.evaluate(e=>e.scrollTop=0)
   await measured('click',()=>manager.getByRole('button',{name:'折叠组 压测组',exact:true}).click());assert.equal(await tree.locator('[data-drawing-id]').count(),0)
   await measured('click',()=>manager.getByRole('button',{name:'展开组 压测组',exact:true}).click())
   await manager.getByLabel('排序目标',{exact:true}).selectOption('volume-1');await manager.getByLabel('排序位置',{exact:true}).selectOption('before')
   await measured('click',()=>manager.getByRole('button',{name:'应用排序',exact:true}).click());await page.waitForFunction(id=>{const p=drawingBench.charts[0],o=p.getDrawings();return !p.getDrawingHistoryState().pending&&o.find(d=>d.logicalId===id).presentation.order>o.find(d=>d.logicalId==='volume-1').presentation.order},id)
   assert.ok(await tree.getByRole('treeitem').count()<30)
  }
  const timings=await page.evaluate(()=>drawingBench.tree);assert.equal(timings.length,50);result.samples.push({round:round+1,cold:mounted.cold,timings,cleanup:await page.evaluate(()=>drawingBench.dispose())});assert.deepEqual(result.samples.at(-1).cleanup,{subscriptions:0,dom:0});save()
 }
 const xs=result.samples.flatMap(s=>s.timings).sort((a,b)=>a-b);result.n=xs.length;result.p50=xs[Math.ceil(xs.length*.5)-1];result.p95=xs[Math.ceil(xs.length*.95)-1];result.passed=result.p95<=result.limit;assert.deepEqual(result.errors,[]);assert.ok(result.passed,JSON.stringify({p95:result.p95,limit:result.limit}));console.log(JSON.stringify({n:result.n,p95:result.p95,limit:result.limit}))
}finally{save();await browser.close()}
