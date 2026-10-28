import {launchBrowser} from './support.mjs'
import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'

const browser=await launchBrowser(),result={passed:false,scope:'actual-component-identity-transition',scenarios:[],errors:[]}
const save=()=>writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n')
let page
try{
 page=await browser.newPage({viewport:{width:1280,height:1100}});page.on('pageerror',error=>result.errors.push(error.message))
 await page.goto(`${process.env.TC_BROWSER_BASE}/tests/browser/drawing-level-alerts.html`);await page.waitForFunction(()=>window.ready&&pro.getAnalysisContext())
 const setup=await page.evaluate(async()=>{
  const line=await levelBench.seed({kind:'horizontalStraightLine',id:'context-line'}),fib=await levelBench.seed({id:'context-fib'}),price=levelBench.bars.at(-1).close,bars=levelBench.bars,position=bars.length-6
  for(const [index,close] of [[position-1,price-1],[position,price+1],[bars.length-1,price-1]])Object.assign(bars[index],{open:close,high:close+1,low:close-1,close})
  await levelBench.replaceHistory(bars);await levelBench.frame()
  return {line,fib,price,position,levelId:pro.getDrawings().find(d=>d.logicalId===fib).parameters.levels.items[3].id}
 })
 const manager=page.getByRole('complementary',{name:'画线提醒管理',exact:true})
 for(const id of [setup.line,setup.fib]){
  await page.evaluate(id=>pro.executeDrawingCommand({type:'select',ids:[id]}),id)
  await page.getByRole('region',{name:'绘图属性',exact:true}).getByRole('button',{name:'添加提醒',exact:true}).click()
  if(id===setup.fib)await manager.getByLabel('提醒级别',{exact:true}).selectOption(setup.levelId)
  await manager.getByLabel('提醒条件',{exact:true}).selectOption('crossing-up');await manager.getByLabel('提醒频率',{exact:true}).selectOption('once-per-bar');await manager.getByRole('button',{name:'创建提醒',exact:true}).click();await manager.getByRole('button',{name:'关闭提醒管理',exact:true}).click()
 }
 const ready=()=>page.waitForFunction(()=>{const state=levelBench.dataState;return state?.dataStatus==='ready'&&!state.restoring&&!state.replay})
 const markers=()=>page.evaluate(()=>pro.getDrawingAlertState().map(({rule,enabled,hasTriggered,lastBarTimestamp,records,replay})=>({id:rule.id,enabled,hasTriggered,lastBarTimestamp,records,replay:{hasTriggered:replay.hasTriggered,lastBarTimestamp:replay.lastBarTimestamp,records:replay.records}})))
 const counts=()=>page.evaluate(()=>({live:levelBench.events.length,replay:levelBench.replayEvents.length}))
 await page.evaluate(async position=>{pro.startReplay(position);await levelBench.frame();pro.getReplayEngine().stepForward();await levelBench.frame()},setup.position)
 assert.deepEqual(await counts(),{live:0,replay:2});await page.evaluate(()=>pro.stopReplay());await ready()
 await page.evaluate(async price=>{levelBench.update(price+1);await levelBench.frame()},setup.price)
 assert.deepEqual(await counts(),{live:2,replay:2});const initialMarkers=await markers();assert.ok(initialMarkers.every(s=>s.enabled&&s.hasTriggered&&s.replay.hasTriggered))
 result.scenarios.push('ui-create-line-and-level-real-live-replay-markers');save()

 const period=async text=>page.locator('.klinecharts-pro-period-bar .period').filter({hasText:new RegExp('^'+text+'$')}).click()
 // Keep history pending so the assertions observe the actual detach/reset gap.
 await page.evaluate(()=>levelBench.holdHistory());await period('5m');await page.waitForFunction(()=>levelBench.pendingHistory.some(r=>r.period===5))
 assert.deepEqual(await markers(),initialMarkers);assert.deepEqual(await counts(),{live:2,replay:2})
 await page.evaluate(()=>levelBench.releaseHistory());await ready();assert.ok((await page.evaluate(()=>pro.getDrawingAlertState())).every(s=>s.enabled&&s.status==='context-mismatch'))
 await page.evaluate(async price=>{levelBench.update(price-1);await levelBench.frame();levelBench.holdHistory()},setup.price)
 await period('1m');await page.waitForFunction(()=>levelBench.pendingHistory.some(r=>r.period===1));assert.deepEqual(await markers(),initialMarkers)
 await page.evaluate(()=>levelBench.releaseHistory());await ready();assert.deepEqual(await markers(),initialMarkers);assert.deepEqual(await counts(),{live:2,replay:2})
 await page.evaluate(async price=>{levelBench.update(price+1);await levelBench.frame()},setup.price);assert.deepEqual(await counts(),{live:2,replay:2})
 await page.evaluate(async price=>{levelBench.update(price-1,true);await levelBench.frame();levelBench.update(price+1);await levelBench.frame()},setup.price);assert.deepEqual(await counts(),{live:4,replay:2})
 result.scenarios.push('trusted-period-roundtrip-keeps-enabled-both-markers-and-seeds-before-cross');save()

 const sources=await page.evaluate(()=>pro.getDrawings()),beforeSymbol=await markers()
 const symbol=async ticker=>{await page.locator('.klinecharts-pro-period-bar .symbol').click();await page.locator('.klinecharts-pro-symbol-search-modal-list').getByText(ticker,{exact:true}).click()}
 await page.evaluate(()=>levelBench.holdHistory());await symbol('OTHER.X');await page.waitForFunction(()=>levelBench.pendingHistory.some(r=>r.ticker==='OTHER.X'));assert.deepEqual(await markers(),beforeSymbol)
 assert.equal(await page.evaluate(()=>pro.getDrawings().length),0);await page.evaluate(()=>levelBench.releaseHistory());await ready()
 assert.ok((await page.evaluate(()=>pro.getDrawingAlertState())).every(s=>s.enabled&&s.status==='context-mismatch'))
 await page.evaluate(async price=>{levelBench.update(price-1);await levelBench.frame();levelBench.holdHistory()},setup.price)
 await symbol('LEVEL.X');await page.waitForFunction(()=>levelBench.pendingHistory.some(r=>r.ticker==='LEVEL.X'));assert.deepEqual(await markers(),beforeSymbol)
 // Restore the original sources before their confirmed identity becomes available.
 await page.evaluate(sources=>pro.restoreDrawings('local',sources),sources);assert.deepEqual(await markers(),beforeSymbol)
 await page.evaluate(()=>levelBench.releaseHistory());await ready();assert.deepEqual(await markers(),beforeSymbol);assert.deepEqual(await counts(),{live:4,replay:2})
 await page.evaluate(async price=>{levelBench.update(price+1);await levelBench.frame()},setup.price);assert.deepEqual(await counts(),{live:4,replay:2})
 await page.evaluate(async price=>{levelBench.update(price-1,true);await levelBench.frame();levelBench.update(price+1);await levelBench.frame()},setup.price);assert.deepEqual(await counts(),{live:6,replay:2})
 await page.evaluate(async position=>{pro.startReplay(position);await levelBench.frame();pro.getReplayEngine().stepForward();await levelBench.frame()},setup.position)
 assert.deepEqual(await counts(),{live:6,replay:2});await page.evaluate(()=>pro.stopReplay());await ready()
 result.scenarios.push('trusted-symbol-roundtrip-restores-real-sources-retains-live-and-replay-dedup');save()

 await page.evaluate(ids=>pro.executeDrawingCommand({type:'delete',ids}),[setup.line,setup.fib]);await page.waitForFunction(()=>pro.getDrawingHistoryState().pending===0)
 assert.ok((await page.evaluate(()=>pro.getDrawingAlertState())).every(s=>!s.enabled&&s.status==='source-missing'))
 const deletedMarkers=await markers();await page.evaluate(sources=>pro.restoreDrawings('local',sources),sources);assert.deepEqual(await markers(),deletedMarkers)
 result.scenarios.push('actual-source-deletion-still-disables-without-automatic-resume');result.markers=await markers();result.events=await counts()
 result.cleanup=await page.evaluate(()=>levelBench.dispose());assert.deepEqual(result.cleanup,{subscriptions:0,dom:0});assert.deepEqual(result.errors,[]);result.passed=true;save();console.log(JSON.stringify({passed:true,scenarios:result.scenarios.length}))
}catch(error){result.failure=error.stack;save();await page?.screenshot({path:process.env.TC_BROWSER_EVIDENCE+'/failure.png'}).catch(()=>{});throw error}finally{await browser.close()}
