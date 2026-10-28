import {launchBrowser} from './support.mjs'
import {writeFileSync,readFileSync} from 'node:fs'
import assert from 'node:assert/strict'
import {levelAlertBudgets} from './drawing-level-alerts-limits.mjs'
import {mixedTargets} from './drawing-workflow-limits.mjs'
const diagnostic=process.env.TC_LA_DIAGNOSTIC==='1',rounds=diagnostic?1:10,budgets=JSON.parse(readFileSync(new URL('./performance-budgets.json',import.meta.url)))
assert.ok(process.env.TC_DW_BASELINE,'TC_DW_BASELINE is required')
const baseline=JSON.parse(readFileSync(process.env.TC_DW_BASELINE,'utf8')),mixedLimits=new Map(mixedTargets(baseline,baseline).map(g=>[g.history,g.limit]))
const result={mode:diagnostic?'diagnostic':'formal',syntheticInputs:true,rounds,samples:[],dense:[],gates:[],errors:[],node:process.version,cpu:readFileSync('/proc/self/status','utf8').match(/^Cpus_allowed_list:\s*(.+)$/m)?.[1]},save=()=>writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n')
const percentile=values=>{assert.ok(values.length&&values.every(v=>Number.isFinite(v)&&v>=0));return [...values].sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1]}
const gate=(name,actual,limit,extra={})=>result.gates.push({name,actual,limit,passed:actual<=limit,...extra})
const clean=sample=>{assert.equal(sample.history.pending,0);assert.equal(sample.history.error,undefined);assert.deepEqual(sample.history.uncertainLogicalIds,[]);assert.deepEqual(sample.history.projectionErrors,{})}
const browser=await launchBrowser()
try{
 result.browser=browser.version();const page=await browser.newPage({viewport:{width:1280,height:1000},deviceScaleFactor:1});page.on('pageerror',error=>result.errors.push(error.message))
 await page.goto(`${process.env.TC_BROWSER_BASE}/tests/browser/drawing-level-alerts-performance.html`);await page.waitForFunction(()=>window.ready)
 for(const count of [10000,50000])for(const append of [false,true])for(let round=1;round<=rounds;round++)for(const rules of [0,100]){
  const sample=await page.evaluate(options=>sampleLevelAlerts(options),{count,rules,append});result.samples.push({...sample,round});save()
  assert.equal(sample.actualRules,rules);assert.equal(sample.sourceCount,100);assert.equal(sample.geometry.visibleLevels,700);assert.equal(sample.geometry.oracle,true);assert.equal(sample.confirmedBars,count+(append?100:0));assert.equal(sample.updates.length,100);assert.equal(sample.confirmations.length,100);assert.equal(sample.batches.length,rules?100:0);assert.deepEqual(sample.cleanup,{subscriptions:0,dom:0});clean(sample)
  console.log(JSON.stringify({count,append,rules,round,updateP95:percentile(sample.updates),events:sample.events.length}))
 }
 for(const count of [10000,50000])for(const append of [false,true]){
  const samples=rules=>result.samples.filter(s=>s.count===count&&s.append===append&&s.rules===rules),limit=rules=>append?levelAlertBudgets.append[count][rules]:budgets.cases[String(count)].update
  for(const rules of [0,100]){assert.equal(samples(rules).length,rounds);gate(`level-update-${count}-${append?'append':'same'}-${rules}`,percentile(samples(rules).flatMap(s=>s.updates)),limit(rules),{n:rounds*100})}
  const control=percentile(samples(0).flatMap(s=>s.updates)),candidate=percentile(samples(100).flatMap(s=>s.updates));gate(`level-increment-${count}-${append?'append':'same'}`,candidate-control,append?levelAlertBudgets.appendIncrement:10,{control,candidate,n:rounds*100});gate(`level-batch100-${count}-${append?'append':'same'}`,percentile(samples(100).flatMap(s=>s.batches)),10,{n:rounds*100})
 }
 await page.setViewportSize({width:1280,height:1400});await page.goto(`${process.env.TC_BROWSER_BASE}/tests/browser/drawing-refinement-performance.html?level-alerts=1`);await page.waitForFunction(()=>window.ready&&window.levelDense)
 const manager=page.getByRole('complementary',{name:'绘图管理',exact:true}),form=manager.getByRole('form',{name:'精确平移',exact:true})
 for(const history of [10000,50000]){
  const entry={history,mixed:[],restore:[]};result.dense.push(entry)
  const mount=async()=>{await page.evaluate(count=>drawingBench.mount({count,n:1000,volume:true}),history);return page.evaluate(()=>levelDense.prepare())}
  const dispose=async()=>{await page.evaluate(()=>levelDense.release());const cleanup=await page.evaluate(()=>drawingBench.dispose());assert.deepEqual(cleanup,{subscriptions:0,dom:0});return cleanup}
  entry.mixedGeometry=await mount();assert.equal(entry.mixedGeometry.replacement.length,50);assert.ok(entry.mixedGeometry.rules.every(rule=>rule.enabled))
  const ids=await page.evaluate(()=>drawingBench.charts[0].getDrawings().map(d=>d.logicalId));await page.evaluate(ids=>drawingBench.charts[0].executeDrawingCommand({type:'select',ids}),ids);await page.getByRole('button',{name:'绘图管理',exact:true}).click()
  for(let round=1;round<=rounds;round++)for(const direction of [-1,1]){
   await manager.getByRole('button',{name:'精确平移',exact:true}).click();await form.getByRole('spinbutton',{name:'K线根数',exact:true}).fill(String(direction));await page.evaluate(direction=>levelDense.armTranslate(direction),direction)
   await form.getByRole('button',{name:'确认平移',exact:true}).click();await page.waitForFunction(()=>window.levelDenseSample?.complete,{},{timeout:60000});const sample=await page.evaluate(()=>levelDenseSample);entry.mixed.push({round,...sample});save()
   assert.equal(sample.error,undefined);assert.equal(sample.trusted,true);assert.equal(sample.status,'completed');assert.equal(sample.objects,1002);assert.equal(sample.native,1002);assert.equal(sample.items.length,1002);assert.ok(sample.items.every(status=>status==='confirmed'));assert.deepEqual(sample.beforeRules,sample.afterRules);clean(sample)
  }
  entry.mixedCleanup=await dispose();gate(`level-mixed1002-${history}`,Math.max(...entry.mixed.map(s=>s.latency)),history===50000?levelAlertBudgets.mixed50kMaximum:mixedLimits.get(history),{n:rounds*2});save()
  for(let round=1;round<=rounds;round++){
   const geometry=await mount();await page.evaluate(()=>levelDense.armRestore());await page.getByRole('button',{name:'恢复启用提醒的布局',exact:true}).click();await page.waitForFunction(()=>window.levelDenseSample?.complete,{},{timeout:60000});const sample=await page.evaluate(()=>levelDenseSample);entry.restore.push({round,geometry,...sample});save()
   assert.equal(sample.error,undefined);assert.equal(sample.trusted,true);assert.equal(sample.sameInstance,true);assert.equal(sample.status,'restored');assert.equal(sample.objects,1002);assert.equal(sample.native,1002);assert.equal(sample.restoreResolutions,0);assert.equal(sample.eventsDuringRestore,0);assert.equal(sample.beforeRules.length,100);assert.ok(sample.beforeRules.every(rule=>rule.enabled));assert.deepEqual(sample.beforeRules,sample.afterRules);clean(sample)
   entry.restore.at(-1).observations=await page.evaluate(()=>levelDense.verifyRestoredObservations());assert.equal(entry.restore.at(-1).observations.enabled,100);entry.restore.at(-1).cleanup=await dispose();save()
   console.log(JSON.stringify({history,round,restore:sample.latency,longtask:sample.maximumLongTask}))
  }
  gate(`level-restore1002-${history}`,Math.max(...entry.restore.map(s=>s.latency)),levelAlertBudgets.restoreLatency[history],{n:rounds});gate(`level-restore1002-longtask-${history}`,Math.max(...entry.restore.map(s=>s.maximumLongTask)),levelAlertBudgets.restoreLongTask,{n:rounds});save()
 }
 assert.deepEqual(result.errors,[]);assert.equal(result.gates.length,22);result.passed=!diagnostic&&result.gates.every(g=>g.passed);save();console.log(JSON.stringify({mode:result.mode,passed:result.passed,gates:result.gates}));if(!diagnostic)assert.ok(result.passed,'Level alert performance budgets failed')
}catch(error){result.failure=error.stack;save();throw error}finally{save();await browser.close()}
