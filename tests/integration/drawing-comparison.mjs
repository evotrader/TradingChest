import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
import path from 'node:path'

/** Same visible task as the official drawing-workbench comparison checklist. */
export async function runDrawingComparison(page,url,evidence){
 await page.addInitScript(()=>Object.defineProperty(Crypto.prototype,'randomUUID',{value:undefined,configurable:true}))
 await page.goto(url)
 const ready=()=>page.waitForFunction(()=>drawingDemo.ready&&drawingDemo.charts.length===3&&drawingDemo.charts.every(c=>c.getChart().getDataList().length===300&&c.getDrawingState().sharing?.host))
 await ready();await page.locator('#store').selectOption('idb');await ready();assert.equal(await page.locator('#store').inputValue(),'idb');const a=page.locator('#a'),manager=a.getByRole('complementary',{name:'绘图管理'}),steps=[]
 const open=()=>a.getByRole('button',{name:'绘图管理',exact:true}).click(),close=()=>a.getByRole('button',{name:'关闭绘图管理',exact:true}).click()
 await open();await manager.getByRole('button',{name:'选择搜索结果',exact:true}).click();const remove=manager.getByRole('button',{name:'删除选中对象',exact:true});if(await remove.isEnabled())await remove.click();await page.waitForFunction(()=>drawingDemo.charts.slice(0,2).every(c=>c.getDrawings().length===0));await manager.getByLabel('新绘图作用域',{exact:true}).selectOption('host');await close()
 const tools=[['horizontalStraightLine','水平线','支撑线一'],['horizontalStraightLine','水平线','支撑线二'],['rect','矩形','矩形区域'],['textAnnotation','文字','文字解释'],['fibonacciLine','斐波那契回撤','Fib 回撤']]
 for(const [index,[id,label,name]] of tools.entries()){
  await a.getByRole('button',{name:'全部绘图工具',exact:true}).click();await a.getByRole('textbox',{name:'搜索绘图工具',exact:true}).fill(id);await a.locator('.tc-drawing-tool-picker button').first().click();await a.locator('.klinecharts-pro-widget').scrollIntoViewIfNeeded()
  const r=await page.evaluate(()=>{const r=drawingDemo.charts[0].getChart().getDom('candle_pane','main').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}}),x=r.x+r.width*(.25+index*.07),y=r.y+r.height*(.32+index*.08)
  await page.mouse.click(x,y);if(['rect','fibonacciLine'].includes(id))await page.mouse.click(x+r.width*.2,y+r.height*.15)
  if(id==='textAnnotation'){const editor=page.getByRole('dialog',{name:'编辑绘图文字'});await editor.getByRole('textbox').fill('支撑区域\n等待价格确认');await editor.getByRole('button',{name:'确认',exact:true}).click()}
  await page.waitForFunction(n=>drawingDemo.charts.slice(0,2).every(c=>c.getDrawings().length===n),index+1)
  await open();await manager.getByRole('button',{name:'编辑 '+label,exact:true}).last().click();await manager.getByLabel('对象名称',{exact:true}).fill('对标任务 · '+name);await manager.getByLabel('周期可见性',{exact:true}).selectOption('current');await manager.getByRole('button',{name:'确认修改',exact:true}).click();await close();steps.push({tool:id,name,interval:'1m'})
 }
 await open();await manager.getByLabel('搜索绘图对象',{exact:true}).fill('对标任务');await manager.getByRole('button',{name:'选择搜索结果',exact:true}).click();await manager.getByLabel('批量线条颜色',{exact:true}).fill('#245cbd');await page.waitForFunction(()=>drawingDemo.charts.slice(0,2).every(c=>c.getDrawings().every(d=>d.overlay.styles?.line?.color==='#245cbd')))
 await manager.getByLabel('分组名称',{exact:true}).fill('交易准备');await manager.getByRole('button',{name:'分组',exact:true}).click();await page.waitForFunction(()=>drawingDemo.charts.slice(0,2).every(c=>c.getDrawings().every(d=>d.presentation?.groupName==='交易准备'&&d.presentation?.intervals?.kind==='current')))
 await close();await a.screenshot({path:path.join(evidence,'drawing-comparison-created.png')})
 await page.locator('#save').click();await page.locator('#status').filter({hasText:'共享绘图已保存'}).waitFor();await page.locator('#refresh').click();await page.waitForFunction(()=>drawingDemo.charts.every(c=>c.getDrawings().length===5));await page.locator('#save-layouts').click();await page.locator('#status').filter({hasText:'三个工作台已保存'}).waitFor()
 await page.reload();await ready();await page.locator('#restore-layouts').click();await page.locator('#status').filter({hasText:'恢复完成'}).waitFor();await page.waitForFunction(()=>drawingDemo.charts.every(c=>c.getDrawings().length===5))
 const restored=await page.evaluate(()=>drawingDemo.charts.map(c=>c.getDrawings().map(d=>({id:d.logicalId,name:d.presentation?.name,group:d.presentation?.groupName,interval:d.presentation?.intervals,color:d.overlay.styles?.line?.color}))))
 assert.deepEqual(restored[0],restored[1]);assert.deepEqual(restored[0],restored[2]);assert.ok(restored[0].every(d=>d.group==='交易准备'&&d.interval.kind==='current'&&d.color==='#245cbd'))
 await open();await manager.getByLabel('搜索绘图对象',{exact:true}).fill('对标任务');assert.equal(await manager.locator('.tc-drawing-object-name').count(),5);await a.screenshot({path:path.join(evidence,'drawing-comparison-restored.png')})
 const result={passed:true,randomUUIDAvailable:await page.evaluate(()=>typeof crypto.randomUUID==='function'),source:'installed public package, real browser actions and native IndexedDB',task:'two support lines, rectangle, text, Fib; multi-select style, group, current interval, shared charts, save and reopen',steps,restored,tradingView:'Official documentation comparison only; official demo connection failed. No live-product equivalence claimed.'};writeFileSync(path.join(evidence,'drawing-comparison.json'),JSON.stringify(result,null,2)+'\n')
 await page.locator('#dispose').click();return result
}
