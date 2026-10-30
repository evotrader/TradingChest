import {launchBrowser} from './support.mjs'
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
const {expect}=createRequire(import.meta.url)('@playwright/test')
const output=process.argv[2],browser=await launchBrowser(),result={syntheticInputs:true,errors:[],flows:[]}
try{
 const page=await browser.newPage({viewport:{width:1280,height:1200}});page.on('pageerror',e=>result.errors.push(e.message))
 await page.goto(`${process.env.TC_BROWSER_BASE}/tests/browser/replay-workspace.html`);await page.waitForFunction(()=>window.ready)
 await page.evaluate(()=>replayBench.mount({count:2000,layout:2,legacy:false,ui:true}))
 const action=id=>page.locator(`[data-replay-action="${id}"]`),button=label=>page.getByRole('button',{name:label,exact:true})
 const phase=async value=>page.waitForFunction(value=>replayBench.workspace.getReplayState().phase===value,value)
 await action('start').click();await phase('paused');result.flows.push('start-through-visible-controls')
 const target=await page.evaluate(()=>replayBench.bars[1000].timestamp)
 await page.getByLabel('定位时刻',{exact:true}).fill(new Date(target).toISOString().slice(0,19));await action('seek').click();await page.waitForFunction(target=>replayBench.workspace.getReplayState().cursor===target,target)
 const slider=page.getByLabel('复盘时间进度');await slider.focus();await slider.press('ArrowLeft');assert.equal(await page.evaluate(()=>replayBench.workspace.getReplayState().cursor),target);await slider.press('Enter');await page.waitForFunction(target=>replayBench.workspace.getReplayState().cursor!==target,target);result.flows.push('slider-preview-then-keyboard-commit')
 await page.locator('.tc-replay-notes summary').click();await page.getByLabel('筛选窗格').selectOption('primary');await page.getByLabel('筛选事件或书签关键词').fill('事件 300')
 await page.locator('.tc-replay-notes li button').first().click();await expect(page.locator('.tc-replay-notes')).toContainText('精确 K 线时标')
 await button('为此事件添加书签').click();await page.getByLabel('书签标题',{exact:true}).fill('审阅 <事件>');await page.getByLabel('书签备注',{exact:true}).fill('当前笔记 & 原始引用');await button('应用书签').click()
 await page.getByLabel('复盘会话备注').fill('会话备注');await button('应用会话备注').click();await page.getByLabel('工作台名称',{exact:true}).fill('同步复盘记录');await button('另存').click();await expect(page.locator('.tc-workspace-notice')).toContainText('已保存')
 const record=await page.evaluate(()=>replayBench.workspace.getReplayRecord());assert.equal(record.bookmarks.length,1);assert.equal(record.bookmarks[0].title,'审阅 <事件>');assert.ok(record.bookmarks[0].eventRef);result.flows.push('visible-event-bookmark-notes-and-indexeddb-save')
 await action('stop').click();await phase('idle');await action('resume').click();await phase('paused');assert.deepEqual((await page.evaluate(()=>replayBench.workspace.getReplayRecord())).bookmarks,record.bookmarks)
 await page.evaluate(()=>window.originalReplayChart=replayBench.workspace.getCells()[0].chart);await button('加载工作台').click();await page.waitForFunction(()=>replayBench.workspace.getCells()[0].chart!==window.originalReplayChart&&replayBench.workspace.getReplayState().phase==='paused');result.flows.push('saved-paused-restore-is-atomic')
 await action('stop').click();await phase('idle');await page.evaluate(()=>replayBench.fail('replay:primary'));await action('resume').click();await expect(page.locator('.tc-replay-controls')).toContainText('复盘时钟失败');await phase('idle');await page.evaluate(()=>replayBench.fail('replay:primary',false));assert.equal((await page.evaluate(()=>replayBench.workspace.getReplayRecord())).bookmarks[0].id,record.bookmarks[0].id)
 await page.evaluate(()=>replayBench.fail('hang:primary'));await action('resume').click();await phase('loading');await action('stop').click();await phase('idle');await page.evaluate(()=>replayBench.fail('hang:primary',false));result.flows.push('failure-and-ignored-source-cancellation-retain-record')
 await action('start').click();await expect(page.getByRole('alertdialog',{name:'保留复盘记录'})).toBeVisible();await page.getByRole('alertdialog',{name:'保留复盘记录'}).getByRole('button',{name:'取消',exact:true}).click();assert.deepEqual((await page.evaluate(()=>replayBench.workspace.getReplayRecord())).bookmarks,record.bookmarks)
 await page.getByRole('tab',{name:'书签与备注',exact:true}).click();await page.getByLabel('复盘会话备注').fill('还未应用的草稿');await page.getByLabel('复盘会话备注').press('Escape');await expect(page.getByRole('alertdialog',{name:'处理备注草稿'})).toBeVisible();await button('保留并应用草稿').click();assert.equal((await page.evaluate(()=>replayBench.workspace.getReplayRecord())).notes,'还未应用的草稿');result.flows.push('replacement-cancel-and-draft-preservation')
 for(const width of [768,390]){await page.setViewportSize({width,height:1100});await expect(action('resume')).toBeVisible();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await action('resume').click();await phase('paused');await action('forward').click();await phase('paused');await action('stop').click();await phase('idle');result.flows.push(`usable-${width}px`)}
 await page.screenshot({path:output.replace('evidence.json','replay-ui-390.png'),fullPage:true})
 result.cleanup=await page.evaluate(()=>replayBench.dispose());assert.deepEqual(result.cleanup,{subscriptions:0,dom:0});assert.deepEqual(result.errors,[]);result.passed=true
}catch(error){result.failure=String(error);throw error}finally{writeFileSync(output,JSON.stringify(result,null,2));await browser.close()}
