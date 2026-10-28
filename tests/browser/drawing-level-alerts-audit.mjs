import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
import {launchBrowser} from './support.mjs'

const browser=await launchBrowser(),result={passed:false,scope:'actual-component-level-alert-audit',scenarios:[],errors:[]}
const save=()=>writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n')
let page
try{
 page=await browser.newPage({viewport:{width:1280,height:1100}});page.on('pageerror',error=>result.errors.push(error.message))
 const load=async()=>{await page.goto(`${process.env.TC_BROWSER_BASE}/tests/browser/drawing-level-alerts.html`);await page.waitForFunction(()=>window.ready&&pro.getAnalysisContext())}
 const manager=page.getByRole('complementary',{name:'画线提醒管理',exact:true}),editor=page.getByRole('complementary',{name:'绘图管理',exact:true})
 const create=async({id='audit',ratio=3,line=false}={})=>{
  const source=await page.evaluate(async({id,ratio,line})=>{await levelBench.seed({id,kind:line?'horizontalStraightLine':'fibonacciLine'});const source=pro.getDrawings().find(d=>d.logicalId===id);source.anchors[0].value=line?-10:10;if(!line){source.anchors[1].value=20;source.parameters.levels.items[3].value=ratio}pro.restoreDrawings('local',pro.getDrawings().map(d=>d.logicalId===id?source:d));return source},{id,ratio,line})
  await page.getByRole('region',{name:'绘图属性',exact:true}).getByRole('button',{name:'添加提醒',exact:true}).click()
  if(!line)await manager.getByLabel('提醒级别',{exact:true}).selectOption(source.parameters.levels.items[3].id)
  await manager.getByLabel('提醒条件',{exact:true}).selectOption('crossing-up');await manager.getByLabel('提醒频率',{exact:true}).selectOption('once-per-bar');await manager.getByRole('button',{name:'创建提醒',exact:true}).click();await manager.getByRole('button',{name:'关闭提醒管理',exact:true}).click();return source
 }
 const settings=()=>page.locator('.klinecharts-pro-period-bar .item').filter({hasText:/^设置$/}).click(),modal=page.getByRole('dialog',{name:'设置',exact:true})
 const axis=async(label)=>{const current=await page.evaluate(()=>pro.getChart().getYAxes({paneId:'candle_pane'})[0].name);await modal.getByRole('combobox').filter({hasText:current==='logarithm'?'对数轴':'线性轴'}).first().click();await modal.getByRole('option',{name:label,exact:true}).click()}
 const states=()=>page.evaluate(()=>pro.getDrawingAlertState())
 const markers=()=>page.evaluate(()=>pro.getDrawingAlertState().map(({rule,hasTriggered,lastBarTimestamp,records,replay})=>({id:rule.id,hasTriggered,lastBarTimestamp,records,replay:{hasTriggered:replay.hasTriggered,lastBarTimestamp:replay.lastBarTimestamp,records:replay.records}})))
 const update=(close,append=false)=>page.evaluate(async({close,append})=>{levelBench.update(close,append);await levelBench.frame()},{close,append})
 const counts=()=>page.evaluate(()=>({live:levelBench.events.length,replay:levelBench.replayEvents.length}))
 if(process.env.TC_LEVEL_AUDIT_ONLY!=='dirty'){
  await load();await create();await create({id:'line',line:true});await update(-11)
  await settings();await axis('对数轴');assert.ok((await states()).every(s=>!s.enabled&&s.status==='unsupported'));await axis('线性轴');await modal.getByRole('button',{name:'Close',exact:true}).click();await update(-9)
  assert.equal((await counts()).live,0);assert.ok((await states()).every(s=>!s.enabled));result.scenarios.push('settings-immediately-disables-unprojectable-line-and-level-without-auto-resume');save()

  await load();await create({ratio:.5})
  const position=await page.evaluate(async()=>{const bars=levelBench.bars,position=bars.length-6;for(const [index,close] of [[position-1,14],[position,16],[bars.length-1,14]])Object.assign(bars[index],{open:close,high:close+1,low:close-1,close});await levelBench.replaceHistory(bars);return position})
  await page.evaluate(async position=>{pro.startReplay(position);await levelBench.frame();pro.getReplayEngine().stepForward();await levelBench.frame();pro.stopReplay();await levelBench.frame()},position);await update(16)
  assert.deepEqual(await counts(),{live:1,replay:1});let saved=await markers()
  await settings();await axis('对数轴');await modal.getByRole('button',{name:'恢复默认',exact:true}).click();assert.deepEqual(await markers(),saved);assert.equal((await states())[0].status,'waiting')
  await update(14);assert.deepEqual(await counts(),{live:1,replay:1});await update(16,true);assert.deepEqual(await counts(),{live:2,replay:1})
  await update(14,true);saved=await markers();await page.locator('.klinecharts-pro-widget').focus();await page.keyboard.press('Alt+l');assert.equal(await page.evaluate(()=>pro.getChart().getYAxes({paneId:'candle_pane'})[0].name),'logarithm');await page.keyboard.press('Alt+l');assert.deepEqual(await markers(),saved)
  await update(16);assert.deepEqual(await counts(),{live:2,replay:1});await update(14,true);await update(16);assert.deepEqual(await counts(),{live:3,replay:1});result.scenarios.push('defaults-and-alt-l-retain-both-markers-and-await-a-fresh-confirmation');save()

  await load();await create();await update(-11);await update(-9);const before=await markers()
  await page.evaluate(()=>{const layout=levelBench.captureLayout(pro);layout.axes.find(axis=>axis.default&&axis.paneId==='candle_pane').name='logarithm';levelBench.stageAuditLayout(layout,true)})
  await page.getByRole('button',{name:'恢复审计布局',exact:true}).click();await page.waitForFunction(()=>levelBench.auditRestoreResult?.status==='rejected');assert.deepEqual(await page.evaluate(()=>levelBench.auditRestoreResult),{status:'rejected',message:'隔离布局轴恢复失败',failedAfterAxis:true});assert.equal(await page.evaluate(()=>pro.getChart().getYAxes({paneId:'candle_pane'})[0].name),'normal');assert.equal((await states())[0].enabled,true);assert.deepEqual(await markers(),before);assert.deepEqual(await counts(),{live:1,replay:0})
  result.scenarios.push('failed-layout-after-native-axis-mutation-rolls-back-axis-and-enabled-intent');save()
  await page.evaluate(()=>{const layout=levelBench.captureLayout(pro);layout.axes.find(axis=>axis.default&&axis.paneId==='candle_pane').name='logarithm';levelBench.stageAuditLayout(layout)})
  await page.getByRole('button',{name:'恢复审计布局',exact:true}).click();await page.waitForFunction(()=>levelBench.auditRestoreResult?.status==='completed');assert.ok((await states()).every(s=>!s.enabled&&s.status==='unsupported'));assert.deepEqual(await markers(),before)
  await page.evaluate(()=>{const layout=levelBench.captureLayout(pro);layout.axes.find(axis=>axis.default&&axis.paneId==='candle_pane').name='normal';levelBench.stageAuditLayout(layout)})
  await page.getByRole('button',{name:'恢复审计布局',exact:true}).click();await page.waitForFunction(()=>levelBench.auditRestoreResult?.status==='completed');assert.equal((await states())[0].enabled,false);assert.deepEqual(await markers(),before);await update(-11,true);await update(-9);assert.equal((await counts()).live,1)
  result.scenarios.push('same-instance-layout-axis-validation-without-resuming-or-losing-markers');save()
 }
 await load();await create();const source=await page.evaluate(()=>pro.getDrawings()[0]);await page.getByRole('region',{name:'绘图属性',exact:true}).getByRole('button',{name:'绘图设置',exact:true}).click();await editor.getByRole('button',{name:'级别 4 添加提醒',exact:true}).click()
 await editor.getByRole('textbox',{name:'级别 4 比例',exact:true}).fill('.25');assert.equal(await manager.getByRole('button',{name:'创建提醒',exact:true}).isDisabled(),true);await manager.getByText('请先确认或取消设置草稿',{exact:true}).waitFor()
 await manager.locator('form').evaluate(form=>form.requestSubmit());assert.equal((await states()).length,1);assert.equal(await manager.getByLabel('提醒级别',{exact:true}).inputValue(),source.parameters.levels.items[3].id)
 // Keep the manager mounted while confirming the underlying form by keyboard.
 await editor.getByRole('button',{name:'确认修改',exact:true}).focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>pro.getDrawingHistoryState().pending===0);await manager.getByRole('button',{name:'创建提醒',exact:true}).click();assert.equal((await states()).length,2);await update(17);await update(18);assert.equal((await states())[1].records[0].referencePrice,17.5)
 result.scenarios.push('open-manager-dirty-guards-button-and-submit-preserves-selection-until-confirmed');result.cleanup=await page.evaluate(()=>levelBench.dispose());assert.deepEqual(result.cleanup,{subscriptions:0,dom:0});assert.deepEqual(result.errors,[]);result.passed=true;save();console.log(JSON.stringify({passed:true,scenarios:result.scenarios.length}))
}catch(error){result.failure=error.stack;save();await page?.screenshot({path:process.env.TC_BROWSER_EVIDENCE+'/failure.png'}).catch(()=>{});throw error}finally{await browser.close()}
