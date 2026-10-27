import assert from 'node:assert/strict'

/** Real installed package, visible controls and native IndexedDB workspace persistence. */
export async function runAttachedTools(page){
 const root=page.locator('#a'),manager=root.getByRole('complementary',{name:'绘图管理',exact:true}),sources=[]
 for(const [name,label]of [['ExampleAttachedLine','示例附着线'],['ExampleAttachedBox','示例附着矩形']]){
  if(!await manager.count())await root.getByRole('button',{name:'绘图管理',exact:true}).click();await manager.getByRole('button',{name:'对象',exact:true}).click();await manager.getByLabel('新绘图作用域',{exact:true}).selectOption('chart');await manager.getByRole('button',{name:'关闭绘图管理',exact:true}).click()
  await root.getByRole('button',{name:'全部绘图工具',exact:true}).click();await root.getByRole('textbox',{name:'搜索绘图工具',exact:true}).fill(label);await root.locator('.tc-drawing-tool-picker').getByText(label,{exact:true}).click();await root.locator('.klinecharts-pro-widget').scrollIntoViewIfNeeded()
  const pane=await page.evaluate(()=>{const r=drawingDemo.charts[0].getChart().getDom('candle_pane','main').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})
  await page.mouse.click(pane.x+pane.width*.4,pane.y+pane.height*.4);await page.mouse.click(pane.x+pane.width*.6,pane.y+pane.height*.6)
  await page.waitForFunction(name=>drawingDemo.charts[0].getDrawings().some(d=>d.overlay.name===name)&&drawingDemo.charts[0].getDrawingHistoryState().pending===0,name)
  await root.getByRole('region',{name:'绘图属性'}).getByRole('button',{name:'绘图设置',exact:true}).click();await manager.getByRole('textbox',{name:'标注正文',exact:true}).fill('实际安装包\n第三方附着文字');await manager.getByRole('button',{name:'确认修改',exact:true}).click()
  await page.waitForFunction(name=>drawingDemo.charts[0].getDrawings().find(d=>d.overlay.name===name)?.parameters?.labelVisible===true,name)
  const before=await page.evaluate(name=>drawingDemo.charts[0].getDrawings().find(d=>d.overlay.name===name),name)
  await manager.getByRole('button',{name:'对象',exact:true}).click();await manager.getByRole('button',{name:'精确平移',exact:true}).click();const form=manager.getByRole('form',{name:'精确平移',exact:true});await form.getByRole('spinbutton',{name:'K线根数',exact:true}).fill('-1');await form.getByRole('spinbutton',{name:'价格位移',exact:true}).fill('1');await form.getByRole('combobox',{name:'价格单位',exact:true}).selectOption('tick');await form.getByRole('button',{name:'确认平移',exact:true}).click();await form.waitFor({state:'hidden'})
  const proof=await page.evaluate(async({name,before})=>{
   const pro=drawingDemo.charts[0],chart=pro.getChart(),drawing=pro.getDrawings().find(d=>d.overlay.name===name),bars=chart.getDataList(),overlay=chart.getOverlays({id:drawing.logicalId})[0],draw=overlay.createPointFigures;let figures
   overlay.createPointFigures=args=>{figures=draw(args);return figures};chart.resize();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));overlay.createPointFigures=draw
   return {drawing,hasLabel:figures.some(figure=>figure.key==='attached-text'),expected:before.anchors.map(anchor=>({timestamp:bars[bars.findIndex(bar=>bar.timestamp===anchor.timestamp)-1].timestamp,value:anchor.value+.25}))}
  },{name,before})
  assert.equal(proof.drawing.owner,'local');assert.equal(proof.hasLabel,true);for(const [i,expected]of proof.expected.entries()){assert.equal(proof.drawing.anchors[i].timestamp,expected.timestamp);assert.ok(Math.abs(proof.drawing.anchors[i].value-expected.value)<1e-9)}
  sources.push({name,id:proof.drawing.logicalId,anchors:proof.drawing.anchors,text:proof.drawing.overlay.extendData});await manager.getByRole('button',{name:'关闭绘图管理',exact:true}).click()
 }
 await page.locator('#save-layouts').click();await page.locator('#status').filter({hasText:'三个工作台已保存'}).waitFor();await page.locator('#restore-layouts').click();await page.locator('#status').filter({hasText:'恢复完成'}).waitFor()
 for(const source of sources){const restored=await page.evaluate(id=>drawingDemo.charts[0].getDrawings().find(d=>d.logicalId===id),source.id);assert.deepEqual(restored.anchors,source.anchors);assert.equal(restored.overlay.extendData,source.text);assert.equal(restored.parameters.labelVisible,true)}
 return {installedPackage:true,standardLineAndBox:true,attachedBody:true,realBarAndTick:true,workspaceV2Reopen:true}
}
