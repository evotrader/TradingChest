import {runThirdPartyZone} from './third-party-zone.mjs'
import {runAttachedTools} from './attached-tools.mjs'
import assert from 'node:assert/strict'

/** Visible actions against an installed public-package example, with native IndexedDB. */
export async function runDrawingWorkbenchExample(page,url,{http=false}={}){
 await page.goto(url)
 const ready=()=>page.waitForFunction(()=>drawingDemo.ready&&drawingDemo.charts.length===3&&drawingDemo.charts.every(c=>c.getDrawingState().sharing?.host))
 await ready()
 const a=page.locator('#a'),b=page.locator('#b')
 await a.getByRole('button',{name:'绘图管理',exact:true}).click();await a.getByLabel('新绘图作用域',{exact:true}).selectOption('host');await a.getByRole('button',{name:'关闭绘图管理',exact:true}).click()
 await a.getByRole('button',{name:'全部绘图工具',exact:true}).click();await a.getByRole('textbox',{name:'搜索绘图工具',exact:true}).fill('矩形');await a.locator('.tc-drawing-tool-picker button').filter({hasText:/^矩形/}).click()
 await a.locator('.klinecharts-pro-widget').scrollIntoViewIfNeeded()
 const r=await page.evaluate(()=>{const r=drawingDemo.charts[0].getChart().getDom('candle_pane','main').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})
 await page.mouse.click(r.x+r.width*.3,r.y+r.height*.4);await page.mouse.click(r.x+r.width*.6,r.y+r.height*.7)
 await page.waitForFunction(()=>drawingDemo.charts[0].getDrawings().length===1&&drawingDemo.charts[1].getDrawings().length===1)
 assert.equal(await page.evaluate(()=>drawingDemo.charts[2].getDrawings().length),0)
 assert.ok(await page.evaluate(()=>drawingDemo.charts.slice(0,2).every(c=>c.getChart().getOverlays({id:c.getDrawings()[0].logicalId}).length===1)))
 await b.getByRole('button',{name:'绘图管理',exact:true}).click();await b.getByRole('button',{name:'编辑 矩形',exact:true}).click();await b.getByRole('complementary',{name:'绘图管理'}).getByRole('button',{name:'描边颜色',exact:true}).click();await b.getByRole('complementary',{name:'绘图管理'}).getByLabel('自定义颜色',{exact:true}).fill('#1249ab');await b.getByRole('button',{name:'确认修改',exact:true}).click();await b.getByRole('button',{name:'关闭绘图管理',exact:true}).click()
 await page.waitForFunction(()=>drawingDemo.charts.slice(0,2).every(c=>c.getDrawings()[0].overlay.styles.line.color==='#1249ab'))
 await a.getByRole('button',{name:'绘图管理',exact:true}).click();await a.getByRole('button',{name:'选择搜索结果',exact:true}).click();await a.getByRole('button',{name:'模板',exact:true}).click();await a.getByLabel('模板名称',{exact:true}).fill('示例矩形');await a.getByRole('button',{name:'保存为新模板',exact:true}).click()
 await page.waitForFunction(()=>drawingDemo.charts[0].getDrawingState().preferences.status==='saved'&&drawingDemo.charts[0].getDrawingState().preferences.value.templates.length===1)
 await a.getByRole('button',{name:'关闭绘图管理',exact:true}).click();await page.locator('#save').click();await page.locator('#status').filter({hasText:'共享绘图已保存'}).waitFor();await page.locator('#refresh').click();await page.waitForFunction(()=>drawingDemo.charts[2].getDrawings().length===1)
 await page.locator('#save-layouts').click();await page.locator('#status').filter({hasText:'三个工作台已保存'}).waitFor()
 await page.reload();await ready();await page.locator('#restore-layouts').click();await page.locator('#status').filter({hasText:'恢复完成'}).waitFor();await page.waitForFunction(()=>drawingDemo.charts.every(c=>c.getDrawings().length===1))
 assert.equal(await page.evaluate(()=>drawingDemo.charts[0].getDrawingState().preferences.value.templates[0].name),'示例矩形')
 assert.ok(await page.evaluate(()=>drawingDemo.charts.every(c=>c.getDrawings()[0].overlay.styles.line.color==='#1249ab')))
 if(http){
  await page.locator('#store').selectOption('http');await ready();assert.equal(await page.evaluate(()=>drawingDemo.charts[0].getDrawings().length),0)
  const writes=[];page.on('request',request=>{if(request.method()==='PUT'&&request.url().includes('/drawing-store'))writes.push(request.url())})
  await page.locator('#save').click();await page.locator('#status').filter({hasText:'共享绘图已保存'}).waitFor()
  await page.locator('#http-fault').selectOption('reject');await page.locator('#save').click();await page.locator('#status').filter({hasText:'隔离示例明确拒绝写入'}).waitFor();assert.equal(await page.evaluate(()=>drawingDemo.charts[0].getDrawingState().sharing.host.status),'error')
  await page.locator('#http-fault').selectOption('response-lost');await page.locator('#save').click();await page.waitForFunction(()=>drawingDemo.charts[0].getDrawingState().sharing.host.status==='uncertain');const attempts=writes.length
  await page.locator('#verify').click();await page.locator('#status').filter({hasText:'原共享写入已按固定 ID 核对'}).waitFor();assert.equal(writes.length,attempts);assert.equal(await page.evaluate(()=>drawingDemo.charts[0].getDrawingState().sharing.host.status),'saved')
  await page.locator('#refresh').click();await page.locator('#status').filter({hasText:'独立实例 C 已读取'}).waitFor()
 }else{
  const option=page.locator('#store option[value="http"]')
  assert.equal(await option.evaluate(element=>element.disabled),true)
  assert.notEqual(await option.getAttribute('disabled'),null)
 }
 await page.locator('#volume').click();await page.locator('#status').filter({hasText:'已添加当前周期 OHLCV 估算'}).waitFor()
 await page.waitForFunction(()=>{const p=drawingDemo.charts[0],v=p.getDrawings().filter(d=>['anchoredVwap','fixedRangeVolumeProfile'].includes(d.overlay.name));return v.length===2&&v.every(d=>p.getDrawingState().analytics[d.logicalId]?.status==='ready')})
 assert.ok(await page.evaluate(()=>{const p=drawingDemo.charts[0],d=p.getDrawings().find(d=>d.overlay.name==='anchoredVwap'),s=p.getDrawingState().analytics[d.logicalId],bars=p.getChart().getDataList().filter(b=>b.timestamp>=d.anchors[0].timestamp),total=bars.reduce((v,b)=>v+b.volume,0),amount=bars.reduce((v,b)=>v+(b.high+b.low+b.close)/3*b.volume,0);return Math.abs(s.summary.vwap-amount/total)<1e-9&&s.summary.volume===total}))
 const attachedTools=await runAttachedTools(page)
 const thirdParty=await runThirdPartyZone(page)
 await page.locator('#dispose').click();assert.equal(await page.evaluate(()=>drawingDemo.charts.length),0);assert.equal(await page.locator('.tc-workspace').count(),0)
 return {thirdParty,attachedTools,sharedTwoWorkspaces:true,independentRefresh:true,templateReload:true,nativeIndexedDB:true,layoutReload:true,volumeDrawings:true,httpAvailable:http}
}
