import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
import {launchBrowser} from './support.mjs'
const browser=await launchBrowser(),results=[],errors=[]
try{
 const page=await browser.newPage({viewport:{width:1400,height:1100}});page.on('pageerror',e=>errors.push(e.message))
 await page.goto(`${process.env.TC_BROWSER_BASE}/tests/browser/drawing-sharing.html?database=tc-shared-input-${Date.now()}`)
 await page.waitForFunction(()=>workspace?.getCells()[0]?.chart?.getDrawingState().sharing?.host)
 await page.getByRole('combobox',{name:'图表布局',exact:true}).selectOption('2')
 await page.waitForFunction(()=>workspace.getCells().length===2&&workspace.getCells().every(c=>c.chart?.getDrawingState().sharing?.host))
 const primary=page.locator('[data-cell-id="primary"]')
 for(const scope of ['workspace','host']){
  await primary.getByRole('button',{name:'绘图管理',exact:true}).click();await primary.getByLabel('新绘图作用域',{exact:true}).selectOption(scope);await primary.getByRole('button',{name:'关闭绘图管理',exact:true}).click()
  for(const tool of ['rect','brush','textAnnotation','polyline']){
   await primary.getByRole('button',{name:'全部绘图工具',exact:true}).click();await primary.getByRole('textbox',{name:'搜索绘图工具',exact:true}).fill(tool);await primary.locator('.tc-drawing-tool-picker button').filter({hasText:tool==='rect'?/^矩形/:tool==='brush'?/^画笔/:tool==='textAnnotation'?/^文字$/:/^折线/}).click()
   const r=await page.evaluate(()=>{const r=workspace.getCells()[0].chart.getChart().getDom('candle_pane','main').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}}),x=r.x+r.width*(.25+.08*['rect','brush','textAnnotation','polyline'].indexOf(tool)),y=r.y+r.height*.45
   if(tool==='brush'){await page.mouse.move(x,y);await page.mouse.down();for(let i=1;i<=12;i++)await page.mouse.move(x+i*5,y+Math.sin(i)*10);await page.mouse.up()}
   else{await page.mouse.click(x,y);if(tool!=='textAnnotation')await page.mouse.click(x+80,y+50);if(tool==='polyline'){await page.mouse.click(x+120,y+10);await primary.getByRole('button',{name:'完成绘制（Enter）',exact:true}).click()}}
   if(tool==='textAnnotation'){const editor=page.getByRole('dialog',{name:'编辑绘图文字'});await editor.getByRole('textbox').fill('直接共享\n真实绘制');await editor.getByRole('button',{name:'确认',exact:true}).click()}
   await page.waitForFunction(()=>workspace.getCells().every(c=>c.chart.getDrawings().length===1&&c.chart.getDrawingHistoryState().pending===0)).catch(async error=>{console.error(JSON.stringify(await page.evaluate(()=>workspace.getCells().map(c=>({state:c.chart.getDrawingState(),overlays:c.chart.getChart().getOverlays().map(o=>({id:o.id,name:o.name,step:o.currentStep,points:o.points}))})))));await page.screenshot({path:process.argv[2]+'.png'});throw error})
   assert.ok(await page.evaluate(scope=>workspace.getCells().every(c=>{const d=c.chart.getDrawings()[0];return d.presentation.scope===scope&&c.chart.getChart().getOverlays({id:d.logicalId}).length===1&&!Object.keys(c.chart.getDrawingHistoryState().projectionErrors??{}).length}),scope))
   await page.evaluate(()=>workspace.getCells()[0].chart.undoDrawing());await page.waitForFunction(()=>workspace.getCells().every(c=>c.chart.getDrawings().length===0))
   await page.evaluate(()=>workspace.getCells()[0].chart.redoDrawing());await page.waitForFunction(()=>workspace.getCells().every(c=>c.chart.getDrawings().length===1))
   await page.evaluate(()=>{const p=workspace.getCells()[0].chart;return p.executeDrawingCommand({type:'delete',ids:p.getDrawings().map(d=>d.logicalId)})});await page.waitForFunction(()=>workspace.getCells().every(c=>c.chart.getDrawings().length===0))
   results.push({scope,tool,create:true,project:true,undoRedo:true});console.log(scope,tool,'PASS')
  }
 }
 assert.deepEqual(errors,[])
}finally{writeFileSync(process.argv[2],JSON.stringify({results,errors},null,2));await browser.close()}
