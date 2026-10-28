import {launchBrowser} from './support.mjs'
import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
import {runLevelAlertBoundaries,runLevelAlertTouch} from './drawing-level-alerts-boundaries.mjs'
import {checkLegacyLevelAlerts} from './drawing-level-alerts-legacy.mjs'
const browser=await launchBrowser(),result={passed:false,scope:'isolated-native-level-alerts',scenarios:[],errors:[]},save=()=>writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n')
let page
try{
 page=await browser.newPage({viewport:{width:1280,height:1100}});page.on('pageerror',error=>result.errors.push(error.message))
 await page.goto(`${process.env.TC_BROWSER_BASE}/tests/browser/drawing-level-alerts.html`);await page.waitForFunction(()=>window.ready&&pro.getAnalysisContext())
 const manager=page.getByRole('complementary',{name:'画线提醒管理',exact:true}),editor=page.getByRole('complementary',{name:'绘图管理',exact:true})
 const wait=()=>page.waitForFunction(()=>pro.getDrawingHistoryState().pending===0)
 const open=async id=>{await page.evaluate(id=>pro.executeDrawingCommand({type:'select',ids:[id]}),id);await page.getByRole('region',{name:'绘图属性',exact:true}).getByRole('button',{name:'添加提醒',exact:true}).click()}
 const close=()=>manager.getByRole('button',{name:'关闭提醒管理',exact:true}).click()
 for(const toolId of ['fibonacciLine','fibonacciExtension']){
  await page.getByRole('button',{name:'全部绘图工具',exact:true}).click();await page.getByRole('textbox',{name:'搜索绘图工具',exact:true}).fill(toolId)
  const tool=await page.evaluate(id=>pro.getDrawingTools().find(tool=>tool.toolId===id),toolId);await page.locator('.tc-drawing-tool-picker').getByText(tool.labels['zh-CN'],{exact:true}).click()
  const pane=await page.evaluate(()=>{const r=pro.getChart().getDom('candle_pane','main').getBoundingClientRect();return {x:r.x,y:r.y}})
  for(let i=0;i<tool.minPoints;i++)await page.mouse.click(pane.x+340+i*90,pane.y+200+(i%2)*70)
  await wait();const source=await page.evaluate(toolId=>pro.getDrawings().find(d=>d.overlay.name===toolId),toolId);assert.ok(source)
  // Extend through the existing settings form so tail observations are in the real domain.
  await page.evaluate(id=>pro.executeDrawingCommand({type:'select',ids:[id]}),source.logicalId);await page.getByRole('region',{name:'绘图属性',exact:true}).getByRole('button',{name:'绘图设置',exact:true}).click()
  if(toolId==='fibonacciExtension'){await editor.getByLabel('向右延长',{exact:true}).check();await editor.getByRole('button',{name:'确认修改',exact:true}).click();await wait()}
  else {await editor.getByRole('textbox',{name:'级别 4 正文',exact:true}).fill('级别消息');assert.equal(await editor.getByRole('button',{name:'级别 4 添加提醒',exact:true}).isDisabled(),true);assert.equal(await editor.getByRole('button',{name:'添加提醒',exact:true}).isDisabled(),true);await editor.getByRole('button',{name:'确认修改',exact:true}).click();await wait()}
  await editor.getByRole('button',{name:'关闭绘图管理',exact:true}).click();await open(source.logicalId)
  const level=source.parameters.levels.items[3];await manager.getByLabel('提醒级别',{exact:true}).selectOption(level.id);await manager.getByLabel('提醒频率',{exact:true}).selectOption('once-per-bar');await manager.getByRole('button',{name:'创建提醒',exact:true}).click()
  const oracle=toolId==='fibonacciLine'?source.anchors[1].value+(source.anchors[0].value-source.anchors[1].value)*level.value:source.anchors[2].value+(source.anchors[1].value-source.anchors[0].value)*level.value
  await page.evaluate(async price=>{levelBench.update(price-1);await levelBench.frame();levelBench.update(price+1);await levelBench.frame()},oracle)
  const state=await page.evaluate(id=>pro.getDrawingAlertState().find(s=>s.rule.drawingLogicalId===id),source.logicalId);assert.equal(state.records.length,1);assert.ok(Math.abs(state.records[0].referencePrice-oracle)<1e-9);assert.equal(state.records[0].level.levelId,level.id)
  const figure=await page.evaluate(async({id,levelId})=>(await levelBench.figures(id)).find(f=>f.key==='fibonacci-level:'+levelId),{id:source.logicalId,levelId:level.id}),y=await page.evaluate(price=>pro.getChart().getYAxes({paneId:'candle_pane'})[0].convertToPixel(price),oracle);assert.ok(figure);assert.ok(Math.abs(figure.attrs.coordinates[0].y-y)<1e-8)
  const row=manager.locator(`[data-drawing-alert-id="${state.rule.id}"]`);await row.getByRole('button',{name:'定位',exact:true}).click();await row.getByText(/触发历史/).click();assert.equal(await row.getByText(/参考价/).count(),1)
  await close();result.scenarios.push(toolId+'-trusted-create-level-trigger-native-price-locate-history');save()
 }
 const legacy=await page.evaluate(()=>levelBench.seed({legacy:true}));const before=await page.evaluate(id=>pro.getDrawings().find(d=>d.logicalId===id),legacy)
 await open(legacy);assert.equal(await manager.getByRole('button',{name:'创建提醒',exact:true}).isDisabled(),true);await close();assert.deepEqual(await page.evaluate(id=>pro.getDrawings().find(d=>d.logicalId===id),legacy),before)
 await open(legacy);await manager.getByRole('button',{name:'初始化级别',exact:true}).click();await manager.getByLabel('提醒级别',{exact:true}).waitFor();assert.equal(await manager.getByLabel('提醒级别',{exact:true}).inputValue(),'')
 const initialized=await page.evaluate(id=>pro.getDrawings().find(d=>d.logicalId===id),legacy),target=initialized.parameters.levels.items[3]
 await manager.getByLabel('提醒级别',{exact:true}).selectOption(target.id);await manager.getByRole('button',{name:'创建提醒',exact:true}).click();await close();await page.getByRole('button',{name:'撤销绘图',exact:true}).click();await wait()
 assert.equal(await page.evaluate(id=>pro.getDrawingAlertState().find(s=>s.rule.drawingLogicalId===id).enabled,legacy),false);await page.getByRole('button',{name:'重做绘图',exact:true}).click();await wait();await open(legacy)
 const legacyRule=await page.evaluate(id=>pro.getDrawingAlertState().find(s=>s.rule.drawingLogicalId===id).rule.id,legacy);await manager.locator(`[data-drawing-alert-id="${legacyRule}"]`).getByRole('button',{name:'继续监控',exact:true}).click();assert.equal(await page.evaluate(id=>pro.getDrawingAlertState().find(s=>s.rule.id===id).enabled,legacyRule),true);await close()
 result.scenarios.push('legacy-read-cancel-zero-write-explicit-initialize-select-undo-redo-explicit-resume');save()
 const dense=await page.evaluate(()=>levelBench.seed({count:64}));await open(dense);const denseSource=await page.evaluate(id=>pro.getDrawings().find(d=>d.logicalId===id),dense);await manager.getByLabel('提醒级别',{exact:true}).selectOption(denseSource.parameters.levels.items[63].id);await manager.getByRole('button',{name:'创建提醒',exact:true}).click();await close();assert.equal(await page.evaluate(async id=>(await levelBench.figures(id)).filter(f=>f.key?.startsWith('fibonacci-level:')).length,dense),64)
 result.scenarios.push('64-visible-levels-select-stable-last-level-and-native-figures');save()
 result.scenarios.push(...await runLevelAlertBoundaries(page));save()
 const saved=await page.evaluate(()=>({layout:levelBench.captureLayout(pro),alerts:pro.captureDrawingAlerts()}));assert.equal(saved.alerts.version,2)
 result.legacyReader=await checkLegacyLevelAlerts(browser,saved.alerts);save()
 for(const reverse of [false,true]){await page.evaluate(async({layout,alerts,reverse})=>levelBench.reopen(layout,alerts,reverse),{...saved,reverse});const restored=await page.evaluate(()=>pro.getDrawingAlertState());assert.ok(restored.every(s=>!s.enabled));assert.deepEqual(await page.evaluate(()=>pro.captureDrawingAlerts()),saved.alerts)}
 result.scenarios.push('separate-layout-v2-alert-capture-dispose-reopen-both-orders-all-paused-markers-retained');save()
 // Actual component/history wiring, with no replacement source snapshots.
 const counts=await page.evaluate(async()=>{
  for(const s of pro.getDrawingAlertState())pro.executeDrawingAlertCommand({type:'delete',id:s.rule.id})
  const source=pro.getDrawings()[0],levelId=source.parameters.levels.items[3].id
  for(let i=0;i<100;i++){const result=pro.executeDrawingAlertCommand({type:'create',id:'count'+i,drawingLogicalId:source.logicalId,target:{kind:'level',levelId},frequency:'once-per-bar'});if(result.status!=='completed')throw Error(result.message)}
  levelBench.resetReads();levelBench.update(levelBench.bars.at(-1).close+.01);const consume=levelBench.rounds.filter(r=>r.method==='consume');levelBench.resetReads()
  await pro.executeDrawingCommand({type:'update',ids:[source.logicalId],patch:{parameters:{showLevelText:false}}});const targeted=levelBench.sourceReads
  levelBench.resetReads();const base=pro.getDrawings().find(d=>d.logicalId!==source.logicalId);const changes=Array.from({length:1002},(_,index)=>({...structuredClone(base),logicalId:'unrelated'+index,overlay:{...base.overlay,id:'unrelated'+index}}));pro.restoreDrawings('local',[...pro.getDrawings(),...changes]);levelBench.resetReads();await pro.executeDrawingCommand({type:'update',ids:changes.map(d=>d.logicalId),patch:{overlay:{styles:{line:{color:'#123456'}}}}});const unrelated=levelBench.sourceReads
  const count=pro.getDrawingAlertState().length
  for(const state of pro.getDrawingAlertState())pro.executeDrawingAlertCommand({type:'delete',id:state.rule.id})
  for(const drawing of pro.getDrawings().filter(d=>d.logicalId.startsWith('unrelated')).slice(0,100)){const result=pro.executeDrawingAlertCommand({type:'create',drawingLogicalId:drawing.logicalId,target:{kind:'level',levelId:drawing.parameters.levels.items[3].id},frequency:'once-per-bar'});if(result.status!=='completed')throw Error(result.message)}
  levelBench.resetReads();levelBench.update(levelBench.bars.at(-1).close+.01);const distinct=levelBench.rounds.filter(r=>r.method==='consume')
  return {consume,targeted,unrelated,count,distinct,history:pro.getDrawingHistoryState()}
 });assert.ok(counts.distinct.length&&counts.distinct.every(round=>round.reads<=100)&&counts.distinct.some(round=>round.reads===100));assert.ok(counts.consume.length&&counts.consume.every(round=>round.reads<=1));assert.equal(counts.targeted,1);assert.equal(counts.unrelated,0);assert.equal(counts.count,100);assert.equal(counts.history.pending,0);assert.deepEqual(counts.history.uncertainLogicalIds,[]);assert.deepEqual(counts.history.projectionErrors,{});result.sourceCounts=counts
 result.scenarios.push('actual-component-history-runtime-source-reuse-100-rules-and-1002-unrelated-confirmations');save()
 await page.setViewportSize({width:320,height:850});await page.getByRole('button',{name:'提醒管理',exact:true}).click();await manager.getByLabel('提醒消息',{exact:true}).fill('输入法草稿');await manager.getByLabel('提醒消息',{exact:true}).dispatchEvent('keydown',{key:'Escape',isComposing:true});assert.equal(await manager.count(),1);await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.querySelector('.tc-drawing-alert-manager').contains(document.activeElement)));await page.keyboard.press('Escape');assert.equal(await manager.count(),0);assert.equal(await page.getByRole('button',{name:'提醒管理',exact:true}).evaluate(el=>el===document.activeElement),true)
 result.scenarios.push('narrow-320-ime-escape-tab-focus-restoration');assert.deepEqual(result.errors,[]);result.cleanup=await page.evaluate(()=>levelBench.dispose());assert.deepEqual(result.cleanup,{subscriptions:0,dom:0});result.scenarios.push(await runLevelAlertTouch(browser));result.passed=true;save();console.log(JSON.stringify({passed:true,scenarios:result.scenarios.length}))
}catch(error){result.failure=error.stack;save();await page?.screenshot({path:process.env.TC_BROWSER_EVIDENCE+'/failure.png'}).catch(()=>{});throw error}finally{await browser.close()}
