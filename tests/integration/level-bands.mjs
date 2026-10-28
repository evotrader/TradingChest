import assert from 'node:assert/strict'

/** A third-party parameter name, installed package and native preference/document/workspace stores. */
export async function runLevelBands(page){
 const root=page.locator('#a'),manager=root.getByRole('complementary',{name:'绘图管理',exact:true})
 await page.locator('#level-legacy').click();await page.locator('#status').filter({hasText:'旧数组定义已载入'}).waitFor()
 const legacy=await page.evaluate(()=>drawingDemo.charts[0].getDrawings().find(value=>value.overlay.name==='EXAMPLE/LevelBands'));assert.deepEqual(legacy.parameters.zones,[-.25,.5,.5,1.25]);assert.equal(await page.evaluate(()=>drawingDemo.charts[0].getDrawingState().preferences.value.version),2)
 await root.getByRole('button',{name:'绘图管理',exact:true}).click();await manager.getByRole('button',{name:'编辑 示例级别带',exact:true}).click();await manager.getByRole('button',{name:'取消修改',exact:true}).click();assert.deepEqual(await page.evaluate(id=>drawingDemo.charts[0].getDrawings().find(value=>value.logicalId===id),legacy.logicalId),legacy)
 await manager.getByRole('button',{name:'编辑 示例级别带',exact:true}).click();await manager.getByRole('textbox',{name:'区域级别 2 正文',exact:true}).fill('第三方逐级正文');await manager.getByRole('textbox',{name:'区域级别 2 比例',exact:true}).fill('.75');await manager.getByRole('button',{name:'确认修改',exact:true}).click();await page.waitForFunction(id=>drawingDemo.charts[0].getDrawings().find(value=>value.logicalId===id)?.parameters.zones.version===1,legacy.logicalId)
 const confirmed=await page.evaluate(id=>drawingDemo.charts[0].getDrawings().find(value=>value.logicalId===id),legacy.logicalId);assert.equal(confirmed.parameters.zones.items[1].text,'第三方逐级正文');assert.equal(confirmed.parameters.zones.items[1].value,.75)
 await manager.getByRole('button',{name:'关闭绘图管理',exact:true}).click();await root.getByRole('button',{name:'撤销绘图',exact:true}).click();await page.waitForFunction(id=>Array.isArray(drawingDemo.charts[0].getDrawings().find(value=>value.logicalId===id)?.parameters.zones),legacy.logicalId);assert.deepEqual(await page.evaluate(id=>drawingDemo.charts[0].getDrawings().find(value=>value.logicalId===id),legacy.logicalId),legacy)
 await root.getByRole('button',{name:'重做绘图',exact:true}).click();await page.waitForFunction(id=>drawingDemo.charts[0].getDrawings().find(value=>value.logicalId===id)?.parameters.zones.version===1,legacy.logicalId)
 await root.getByRole('button',{name:'绘图管理',exact:true}).click();await manager.getByRole('button',{name:'模板',exact:true}).click();await manager.getByRole('textbox',{name:'模板名称',exact:true}).fill('第三方级别外观');await manager.getByRole('button',{name:'保存为新模板',exact:true}).click();await page.waitForFunction(()=>drawingDemo.charts[0].getDrawingState().preferences.value.templates.some(value=>value.name==='第三方级别外观'))
 const template=await page.evaluate(()=>drawingDemo.charts[0].getDrawingState().preferences.value.templates.find(value=>value.name==='第三方级别外观'));assert.ok(template.parameters.zones.items.every(item=>!('id' in item)&&!('text' in item)))
 await manager.getByRole('button',{name:'对象',exact:true}).click();await manager.getByRole('button',{name:'移至 宿主共享',exact:true}).click();await page.waitForFunction(id=>drawingDemo.charts.slice(0,2).every(chart=>chart.getDrawings().some(value=>value.logicalId===id&&value.parameters.zones.items[1].text==='第三方逐级正文')),legacy.logicalId);await manager.getByRole('button',{name:'关闭绘图管理',exact:true}).click()
 await page.locator('#save-layouts').click();await page.locator('#status').filter({hasText:'三个工作台已保存'}).waitFor();await page.locator('#dispose').click();await page.locator('#mount').click();await page.waitForFunction(()=>drawingDemo.ready&&drawingDemo.charts.length===3);await page.locator('#restore-layouts').click();await page.locator('#status').filter({hasText:'三个已保存工作台恢复完成'}).waitFor()
 assert.ok(await page.evaluate(({id,levels})=>drawingDemo.charts.slice(0,2).every(chart=>JSON.stringify(chart.getDrawings().find(value=>value.logicalId===id)?.parameters.zones)===JSON.stringify(levels)),{id:legacy.logicalId,levels:confirmed.parameters.zones}))
 const instances=await page.evaluate(async()=>{
  const results=[]
  for(const [index,pro] of drawingDemo.charts.slice(0,2).entries()){
   const id='instance-level-'+index,bars=pro.getChart().getDataList(),anchors=[{kind:'market',timestamp:bars.at(-20).timestamp,value:90},{kind:'market',timestamp:bars.at(-1).timestamp,value:110}]
   const created=await pro.commitDrawing({kind:'create',logicalId:id,source:'programmatic',after:{logicalId:id,owner:'local',anchors,presentation:{name:'实例独立级别 '+index},overlay:{id,name:'EXAMPLE/LevelBands',paneId:'candle_pane',groupId:'drawing_tools',points:anchors.map(a=>({timestamp:a.timestamp,value:a.value})),styles:null,extendData:null,visible:true,lock:false}}})
   if(created.status!=='confirmed'||(await pro.executeDrawingCommand({type:'initialize-levels',id,parameterKey:'zones'})).status!=='completed')throw Error('Instance defaults did not initialize')
   const levels=pro.getDrawings().find(d=>d.logicalId===id).parameters.zones
   if(pro.executeDrawingAlertCommand({type:'create',drawingLogicalId:id,target:{kind:'level',levelId:levels.items[1].id}}).status!=='completed')throw Error('Instance resolver was not wired')
   results.push({values:levels.items.map(l=>l.value),target:pro.getDrawingAlertState().at(-1).rule.target})
  }
  return results
 });assert.deepEqual(instances[0].values,[-.25,.5,.5,1.25]);assert.deepEqual(instances[1].values,[-1,.25,.75,2]);assert.equal(instances[0].target.resolverId,instances[1].target.resolverId);assert.notEqual(instances[0].target.levelId,instances[1].target.levelId)
 return {tool:'EXAMPLE/LevelBands',id:legacy.logicalId,legacyReadPure:true,v1Preferences:true,levelBody:true,appearanceOnlyTemplate:true,singleUndo:true,nativePersistentReopen:true,instanceDefaultsAndResolvers:instances}
}
export async function checkLevelBandsSurvivor(page,id){
 const root=page.locator('#b'),manager=root.getByRole('complementary',{name:'绘图管理',exact:true})
 await root.getByRole('button',{name:'绘图管理',exact:true}).click();await manager.getByRole('button',{name:'编辑 示例级别带',exact:true}).click();assert.equal(await manager.getByRole('textbox',{name:'区域级别 2 正文',exact:true}).inputValue(),'第三方逐级正文');await manager.getByRole('textbox',{name:'区域级别 2 正文',exact:true}).fill('另一个所有者销毁后仍可编辑');await manager.getByRole('button',{name:'确认修改',exact:true}).click();await page.waitForFunction(id=>drawingDemo.workspaces[1].getCells()[0].chart.getDrawings().find(value=>value.logicalId===id)?.parameters.zones.items[1].text==='另一个所有者销毁后仍可编辑',id);await manager.getByRole('button',{name:'关闭绘图管理',exact:true}).click()
 assert.equal(await page.evaluate(()=>{const pro=drawingDemo.workspaces[1].getCells()[0].chart,source=pro.getDrawings().find(d=>d.logicalId==='instance-level-1');if(!source)throw Error('Surviving instance drawing missing');return pro.executeDrawingAlertCommand({type:'create',drawingLogicalId:source.logicalId,target:{kind:'level',levelId:source.parameters.zones.items[1].id}}).status}),'completed')
 return true
}
