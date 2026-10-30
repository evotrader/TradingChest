import assert from 'node:assert/strict'
import {expect} from '@playwright/test'

/** Public UI of the installed package; no source-tree or host imports. */
export async function runReplayWorkspaceExample(page,{native=false}={}){
 await page.getByLabel('图表布局',{exact:true}).selectOption('2')
 if(native){await page.getByLabel('标的 secondary-1',{exact:true}).selectOption('SYNTHETIC.B');await page.getByLabel('周期 secondary-1',{exact:true}).selectOption({label:'5m'})}
 else await page.getByLabel('周期 secondary-1',{exact:true}).selectOption({label:'1h'})
 await page.waitForFunction(native=>{const ws=native?window.replayWorkspaceDemo?.workspace:window.tcExample?.workspace.current;return ws?.getCells().length===2&&ws.getCells().every(c=>c.chart?.getAnalysisContext())},native)
 const range=await page.evaluate(native=>{const ws=native?replayWorkspaceDemo.workspace:tcExample.workspace.current;const values=ws.getCells().map(c=>({bars:c.chart.getChart().getDataList(),period:c.period}));const duration=p=>p.multiplier*(p.timespan==='day'?86400000:p.timespan==='hour'?3600000:60000);return {from:Math.min(...values.map(v=>v.bars[0].timestamp)),to:Math.max(...values.map(v=>v.bars.at(-1).timestamp+duration(v.period)))+1,target:values[0].bars[20].timestamp+duration(values[0].period)}},native)
 const iso=value=>new Date(value).toISOString().replace(/:00\.000Z$/,'').replace(/\.000Z$/,'').replace(/Z$/,'')
 await page.getByLabel('复盘开始',{exact:true}).fill(iso(range.from));await page.getByLabel('复盘结束（不含）',{exact:true}).fill(iso(range.to))
 await page.locator('[data-replay-action=start]').click()
 const phase=value=>page.waitForFunction(({native,value})=>(native?replayWorkspaceDemo.workspace:tcExample.workspace.current).getReplayState().phase===value,{native,value})
 await phase('paused');await page.locator('[data-replay-action=forward]').click();await phase('paused')
 await page.getByLabel('定位时刻',{exact:true}).fill(iso(range.target));await page.locator('[data-replay-action=seek]').click();await phase('paused')
 await page.locator('.tc-replay-notes summary').click();await page.getByRole('tab',{name:'书签与备注',exact:true}).click();await page.getByRole('button',{name:'在当前时刻添加书签',exact:true}).click()
 await page.getByLabel('书签标题',{exact:true}).fill('实际安装包书签');await page.getByLabel('书签备注',{exact:true}).fill('纯文本 <note>');await page.getByRole('button',{name:'应用书签',exact:true}).click()
 await page.getByLabel('复盘会话备注',{exact:true}).fill('当前历史研究笔记');await page.getByRole('button',{name:'应用会话备注',exact:true}).click()
 await page.getByLabel('工作台名称',{exact:true}).fill('安装包复盘');await page.getByRole('button',{name:'另存',exact:true}).click();await expect(page.locator('.tc-workspace-notice')).toContainText('已保存')
 const original=await page.evaluate(native=>(native?replayWorkspaceDemo.workspace:tcExample.workspace.current).getReplayRecord(),native)
 await page.locator('[data-replay-action=stop]').click();await phase('idle');await page.getByRole('button',{name:'加载工作台',exact:true}).click();await expect(page.locator('.tc-workspace-notice')).toContainText('已恢复');await phase('paused')
 const restored=await page.evaluate(native=>(native?replayWorkspaceDemo.workspace:tcExample.workspace.current).getReplayRecord(),native)
 assert.deepEqual(restored,original)
 await page.locator('[data-replay-action=stop]').click();await phase('idle')
 if(native){await page.getByRole('button',{name:'下一次时钟读取失败',exact:true}).click();await page.locator('[data-replay-action=resume]').click();await expect(page.locator('.tc-replay-controls')).toContainText('本次时钟读取失败');await phase('idle')}
 await page.locator('[data-replay-action=resume]').click();await phase('paused');await page.locator('[data-replay-action=stop]').click();await phase('idle')
 return {installedPackage:true,cells:2,pausedRestore:true,notes:restored.notes,bookmarkId:restored.bookmarks[0].id}
}
