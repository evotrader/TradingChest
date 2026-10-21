import assert from 'node:assert/strict'

/** Installed package and peer registration, native stores, visible editing and owner teardown. */
export async function runThirdPartyZone(page){
 const name='EXAMPLE/AnalysisZone',a=page.locator('#a'),b=page.locator('#b'),mode=await page.locator('#store').inputValue()
 const ready=()=>page.waitForFunction(()=>drawingDemo.ready&&drawingDemo.charts.length===3&&drawingDemo.charts.every(c=>c.getDrawingState().sharing?.host))
 const managerA=a.getByRole('complementary',{name:'绘图管理'}),managerB=b.getByRole('complementary',{name:'绘图管理'})
 await a.getByRole('button',{name:'绘图管理',exact:true}).click();await managerA.getByLabel('新绘图作用域',{exact:true}).selectOption('host');await managerA.getByRole('button',{name:'关闭绘图管理',exact:true}).click()
 await a.getByRole('button',{name:'全部绘图工具',exact:true}).click();await a.getByRole('textbox',{name:'搜索绘图工具',exact:true}).fill('example-analysis-zone');await a.locator('.tc-drawing-tool-picker button').first().click();await a.locator('.klinecharts-pro-widget').scrollIntoViewIfNeeded()
 const r=await page.evaluate(()=>{const r=drawingDemo.charts[0].getChart().getDom('candle_pane','main').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})
 await page.mouse.click(r.x+r.width*.3,r.y+r.height*.35);await page.mouse.click(r.x+r.width*.65,r.y+r.height*.65)
 await page.waitForFunction(name=>drawingDemo.charts.slice(0,2).every(c=>c.getDrawings().some(d=>d.overlay.name===name)),name)
 const id=await page.evaluate(name=>drawingDemo.charts[0].getDrawings().find(d=>d.overlay.name===name).logicalId,name)
 const properties=a.getByRole('region',{name:'绘图属性'})
 await properties.getByRole('button',{name:'描边颜色',exact:true}).click();await properties.getByRole('button',{name:'#f44336',exact:true}).click();await page.waitForFunction(id=>drawingDemo.charts.slice(0,2).every(c=>c.getDrawings().find(d=>d.logicalId===id)?.overlay.styles.line.color==='#f44336'),id)
 await a.getByRole('button',{name:'撤销绘图',exact:true}).click();await page.waitForFunction(id=>drawingDemo.charts.slice(0,2).every(c=>c.getChart().getOverlays({id})[0]?.styles.line.color==='#1677ff'),id)
 await a.getByRole('button',{name:'重做绘图',exact:true}).click();await page.waitForFunction(id=>drawingDemo.charts.slice(0,2).every(c=>c.getChart().getOverlays({id})[0]?.styles.line.color==='#f44336'),id)
 await b.getByRole('button',{name:'绘图管理',exact:true}).click();await managerB.getByRole('button',{name:'编辑 示例分析区',exact:true}).click();await managerB.getByRole('checkbox',{name:'显示中线',exact:true}).uncheck();await managerB.getByRole('combobox',{name:'分析区名称',exact:true}).selectOption('支撑区');await managerB.getByRole('button',{name:'确认修改',exact:true}).click();await managerB.getByRole('button',{name:'关闭绘图管理',exact:true}).click()
 await page.waitForFunction(id=>drawingDemo.charts.slice(0,2).every(c=>{const d=c.getDrawings().find(d=>d.logicalId===id);return d.parameters.midline===false&&d.parameters.label==='支撑区'}),id)
 await page.locator('#save').click();await page.locator('#status').filter({hasText:'共享绘图已保存'}).waitFor();await page.locator('#refresh').click();await page.waitForFunction(id=>drawingDemo.charts.every(c=>c.getDrawings().some(d=>d.logicalId===id)),id)
 for(const [index,root]of [a,b].entries()){
  const workspace=root.locator('.tc-workspace');await workspace.getByLabel('工作台名称',{exact:true}).fill('第三方接入 '+index);await workspace.getByRole('button',{name:'另存',exact:true}).click();await workspace.locator('.tc-workspace-notice').filter({hasText:'已保存'}).waitFor()
 }
 await page.reload();await ready();if(mode==='http'){await page.locator('#store').selectOption(mode);await ready()}
 for(const [index,root]of [a,b].entries()){
  const workspace=root.locator('.tc-workspace'),selector=workspace.locator('select').filter({has:page.locator('option').filter({hasText:'第三方接入 '+index})});const value=await selector.locator('option').evaluateAll((options,label)=>options.find(option=>option.textContent.includes(label)).value,'第三方接入 '+index)
  await selector.selectOption(value);await workspace.getByRole('button',{name:'加载工作台',exact:true}).click();await workspace.locator('.tc-workspace-notice').filter({hasText:'已恢复'}).waitFor()
 }
 await page.waitForFunction(id=>drawingDemo.charts.every(c=>{const d=c.getDrawings().find(d=>d.logicalId===id);return d?.parameters.midline===false&&d.parameters.label==='支撑区'&&d.overlay.styles.line.color==='#f44336'}),id)
 const actual=await page.evaluate(async id=>{const chart=drawingDemo.charts[1].getChart(),overlay=chart.getOverlays({id})[0],draw=overlay.createPointFigures;let figures;overlay.createPointFigures=args=>{figures=draw(args);return figures};chart.resize();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));overlay.createPointFigures=draw;return {name:overlay.name,styles:overlay.styles,figures}},id)
 assert.equal(actual.name,name);assert.equal(actual.styles.line.color,'#f44336');assert.equal(actual.figures.filter(f=>f.type==='line').length,0);assert.ok(actual.figures.some(f=>f.type==='polygon'));assert.ok(actual.figures.some(f=>f.type==='text'&&f.attrs.text==='支撑区'))
 await page.evaluate(()=>drawingDemo.workspaces[0].dispose())
 await b.getByRole('button',{name:'绘图管理',exact:true}).click();await managerB.getByRole('button',{name:'编辑 示例分析区',exact:true}).click();await managerB.getByRole('button',{name:'取消修改',exact:true}).click();await managerB.getByRole('button',{name:'关闭绘图管理',exact:true}).click()
 const surviving=b.getByRole('region',{name:'绘图属性'});await surviving.getByRole('button',{name:'填充颜色',exact:true}).click();await surviving.getByRole('button',{name:'#4caf50',exact:true}).click();await page.waitForFunction(id=>drawingDemo.workspaces[1].getCells()[0].chart.getChart().getOverlays({id})[0]?.styles.polygon.color==='#4caf50',id)
 return {tool:name,created:true,sharedTwoCharts:true,parameterFigure:true,styleUndoRedo:true,nativeLayoutReopen:true,survivesOtherOwnerDispose:true}
}
