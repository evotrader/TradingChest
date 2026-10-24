import {launchBrowser} from './support.mjs'
import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
import {drawingAlertCases} from './drawing-alerts-cases.mjs'
const browser=await launchBrowser(),result={passed:false,syntheticInputs:true,scope:'native-engine-fixture',scenarios:[],errors:[]}
const save=()=>writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n')
try{
 const page=await browser.newPage({viewport:{width:1280,height:1100}});page.on('pageerror',error=>result.errors.push(error.message))
 await page.goto(`${process.env.TC_BROWSER_BASE}/tests/browser/drawing-alerts.html`);await page.waitForFunction(()=>window.ready&&pro.getAnalysisContext())
 // Draw through trusted input before opening the properties entry.
 await page.getByRole('button',{name:'全部绘图工具',exact:true}).click();await page.getByRole('textbox',{name:'搜索绘图工具',exact:true}).fill('水平线');await page.locator('.tc-drawing-tool-picker').getByRole('button',{name:'水平线 Alt+H',exact:true}).click()
 const pane=await page.locator('.klinecharts-pro-widget').boundingBox();await page.mouse.click(pane.x+400,pane.y+220)
 await page.waitForFunction(()=>pro.getDrawings().length===1&&pro.getDrawingHistoryState().pending===0)
 const source=await page.evaluate(()=>pro.getDrawings()[0]);await page.evaluate(id=>pro.executeDrawingCommand({type:'select',ids:[id]}),source.logicalId)
 await page.getByRole('region',{name:'绘图属性',exact:true}).getByRole('button',{name:'添加提醒',exact:true}).click()
 const manager=page.getByRole('complementary',{name:'画线提醒管理',exact:true})
 await manager.getByLabel('提醒条件',{exact:true}).selectOption('crossing-up');await manager.getByLabel('提醒频率',{exact:true}).selectOption('once-per-bar');await manager.getByLabel('提醒消息',{exact:true}).fill('真实用户流程提醒')
 await manager.getByRole('button',{name:'创建提醒',exact:true}).click();await page.waitForFunction(()=>pro.getDrawingAlertState().length===1)
 const price=source.anchors[0].value
 await page.evaluate(async price=>{alertBench.update(price-1);await alertBench.frame();alertBench.update(price+1);await alertBench.frame()},price)
 assert.equal(await page.evaluate(()=>alertBench.events.length),1);assert.equal(await manager.getByText('真实用户流程提醒',{exact:true}).count(),1)
 await manager.getByRole('button',{name:'暂停',exact:true}).click();await manager.getByRole('button',{name:'继续监控',exact:true}).click()
 await page.evaluate(async price=>{alertBench.update(price-1);alertBench.update(price+1);await alertBench.frame()},price);assert.equal(await page.evaluate(()=>alertBench.events.length),1)
 await manager.getByRole('button',{name:'重置并启用',exact:true}).click();await page.evaluate(async price=>{alertBench.update(price-1);alertBench.update(price+1);await alertBench.frame()},price);assert.equal(await page.evaluate(()=>alertBench.events.length),2)
 await manager.getByRole('button',{name:'编辑',exact:true}).click();await manager.getByLabel('提醒消息',{exact:true}).fill('修改后的消息');await manager.getByRole('button',{name:'保存修改',exact:true}).click();await manager.getByRole('button',{name:'定位',exact:true}).click()
 await manager.getByText(/触发历史/).click();assert.equal(await manager.getByText(/触发价/).count(),2)
 result.scenarios.push('trusted-horizontal-drawing-properties-create-cross-pause-resume-rearm-edit-locate-history')
 // Full HTTP snapshots enter the same confirmed writer; no per-bar catch-up events.
 await page.evaluate(async price=>{const id=pro.getDrawingAlertState()[0].rule.id;pro.executeDrawingAlertCommand({type:'rearm',id});await alertBench.update(price-1,{snapshot:true});await alertBench.update(price+1,{snapshot:true});await alertBench.frame()},price)
 assert.equal(await page.evaluate(()=>alertBench.events.length),3)
 await page.evaluate(async price=>{const id=pro.getDrawingAlertState()[0].rule.id;pro.executeDrawingAlertCommand({type:'rearm',id});await alertBench.update(price-1,{snapshot:true});await alertBench.update(price+1,{snapshot:true,append:true,multiple:2});await alertBench.frame()},price)
 assert.equal(await page.evaluate(()=>alertBench.events.length),3)
 result.scenarios.push('actual-loader-http-same-bar-cross-and-multiple-bar-seed')
 await page.evaluate(async price=>{alertBench.connection('disconnected');alertBench.update(price-1);alertBench.connection('connected');alertBench.update(price+1);await alertBench.frame()},price);assert.equal(await page.evaluate(()=>alertBench.events.length),3)
 await page.evaluate(async price=>{alertBench.update(price-1,{append:true});alertBench.update(price+1);await alertBench.frame()},price);assert.equal(await page.evaluate(()=>alertBench.events.length),4)
 await page.evaluate(()=>{window.savedAlerts=pro.captureDrawingAlerts();pro.restoreDrawingAlerts(savedAlerts)})
 assert.equal(await page.evaluate(()=>pro.getDrawingAlertState()[0].enabled),false)
 await manager.getByRole('button',{name:'继续监控',exact:true}).click();await page.evaluate(async price=>{alertBench.update(price-1);alertBench.update(price+1);await alertBench.frame()},price);assert.equal(await page.evaluate(()=>alertBench.events.length),4)
 const original=await page.evaluate(()=>pro.captureDrawingAlerts());assert.equal(await page.evaluate(()=>{try{pro.restoreDrawingAlerts({...savedAlerts,scope:'different'});return false}catch{return true}}),true);assert.deepEqual(await page.evaluate(()=>pro.captureDrawingAlerts()),original)
 result.scenarios.push('disconnect-recovery-and-paused-restore-keep-same-bar-markers-scope-atomicity')
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'提醒管理',exact:true}).focus();await page.keyboard.press('Enter');await manager.waitFor()
 await page.setViewportSize({width:320,height:1100});await page.evaluate(()=>alertBench.frame());const bounds=await manager.boundingBox();assert.ok(bounds.x>=0&&bounds.width<=320)
 assert.ok(await manager.getByRole('button',{name:'关闭提醒管理',exact:true}).evaluate(node=>node.getBoundingClientRect().height>=44))
 await manager.getByLabel('提醒消息',{exact:true}).dispatchEvent('keydown',{key:'Escape',isComposing:true});assert.equal(await manager.count(),1)
 await page.keyboard.press('Escape');await manager.waitFor({state:'detached'});assert.equal(await page.getByRole('button',{name:'提醒管理',exact:true}).evaluate(node=>node===document.activeElement),true)
 result.scenarios.push('keyboard-ime-escape-focus-return-and-320px-44px-targets')
 await page.setViewportSize({width:1280,height:1100});await page.getByRole('button',{name:'提醒管理',exact:true}).click();await manager.getByRole('button',{name:'删除',exact:true}).click();assert.equal(await page.evaluate(()=>pro.getDrawingAlertState().length),0)
 await manager.getByRole('button',{name:'关闭提醒管理',exact:true}).click();result.scenarios.push(...await drawingAlertCases(page))
 await page.evaluate(()=>pro.dispose());assert.equal(await page.evaluate(()=>alertBench.subscriptions),0);assert.deepEqual(result.errors,[]);result.passed=true;save();console.log(JSON.stringify(result))
}catch(error){result.error=error.stack;save();throw error}finally{await browser.close()}
