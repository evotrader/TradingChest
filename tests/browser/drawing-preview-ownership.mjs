import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
import {launchBrowser} from './support.mjs'
const browser=await launchBrowser(),results=[],errors=[]
try{
 for(const mode of ['space','text-confirm','text-cancel']){
  const page=await browser.newPage({viewport:{width:1400,height:1100}});page.on('pageerror',e=>errors.push(e.message))
  await page.goto(`${process.env.TC_BROWSER_BASE}/tests/browser/drawing-sharing.html?database=tc-preview-owner-${mode}-${Date.now()}`);await page.waitForFunction(()=>workspace.getCells()[0]?.chart?.getDrawingState().sharing?.host)
  const primary=page.locator('[data-cell-id="primary"]')
  await primary.getByRole('button',{name:'绘图管理',exact:true}).click();await primary.getByLabel('新绘图作用域',{exact:true}).selectOption('host');await primary.getByRole('button',{name:'关闭绘图管理',exact:true}).click()
  await primary.getByRole('button',{name:'全部绘图工具',exact:true}).click();await primary.getByRole('textbox',{name:'搜索绘图工具',exact:true}).fill(mode==='space'?'rect':'textAnnotation');await primary.locator('.tc-drawing-tool-picker button').filter({hasText:mode==='space'?/^矩形/:/^文字$/}).click()
  const point=await page.evaluate(()=>{const r=workspace.getCells()[0].chart.getChart().getDom('candle_pane','main').getBoundingClientRect();return {x:r.x+r.width*.3,y:r.y+r.height*.5}});await page.mouse.click(point.x,point.y)
  if(mode!=='space')await page.getByRole('dialog',{name:'编辑绘图文字'}).waitFor()
  const id=await page.evaluate(()=>workspace.getCells()[0].chart.getChart().getOverlays()[0].id)
  if(mode==='space'){await page.keyboard.down('Space');assert.equal(await page.evaluate(id=>workspace.getCells()[0].chart.getChart().getOverlays({id}).length,id),0)}
  await page.evaluate(id=>{const e=workspace.getCells()[0].chart.getChart();if(e.getOverlays({id}).length)e.removeOverlay({id});const t=e.getDataList().at(-10).timestamp;e.createOverlay({id,name:'rect',lock:true,points:[{timestamp:t,value:80},{timestamp:t+60000,value:120}],extendData:{external:true}});window.ownerProbe={object:e.getOverlays({id})[0]};ownerProbe.before=JSON.stringify({points:ownerProbe.object.points,step:ownerProbe.object.currentStep,data:ownerProbe.object.extendData,lock:ownerProbe.object.lock})},id)
  if(mode==='space')await page.keyboard.up('Space')
  else{const editor=page.getByRole('dialog',{name:'编辑绘图文字'});await editor.getByRole('textbox').fill('不能写入宿主替换对象');await editor.getByRole('button',{name:mode==='text-confirm'?'确认':'取消',exact:true}).click()}
  const outcome=await page.evaluate(id=>{const p=workspace.getCells()[0].chart,o=p.getChart().getOverlays({id})[0];return {same:o===ownerProbe.object,preserved:JSON.stringify({points:o.points,step:o.currentStep,data:o.extendData,lock:o.lock})===ownerProbe.before,drawings:p.getDrawings().length}},id)
  assert.deepEqual(outcome,{same:true,preserved:true,drawings:0});await primary.getByText(mode==='space'?'原绘图 ID 已被宿主占用，未确认预览已取消':'绘图对象已被替换，本次文字编辑已取消',{exact:true}).waitFor()
  if(mode==='space'){
   const protectedProjection=await page.evaluate(async id=>{const p=workspace.getCells()[0].chart,e=p.getChart(),identity={namespace:'isolated-shared',symbol:{ticker:'TEST.X',market:'test',exchange:'X',priceCurrency:'USD'},priceBasisKey:'raw'},key=JSON.stringify(['isolated-shared','test','X','TEST.X','USD','raw']),session=await hostSessions.bind({identity,documentId:key}),t=e.getDataList().at(-10).timestamp;await session.history.submit('create',id,{logicalId:id,owner:'local',overlay:{id,name:'segment',groupId:'drawing_tools',paneId:'candle_pane',lock:false,visible:true,extendData:null,styles:null,points:[{timestamp:t,value:100},{timestamp:t+60000,value:101}]},anchors:[{kind:'market',timestamp:t,value:100},{kind:'market',timestamp:t+60000,value:101}],presentation:{scope:'host'}},'programmatic');return {same:e.getOverlays({id})[0]===ownerProbe.object,error:!!p.getDrawingHistoryState().projectionErrors[id]}},id)
   assert.deepEqual(protectedProjection,{same:true,error:true})
  }
  results.push({mode,...outcome});await page.close()
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({results,errors}))
}finally{writeFileSync(process.argv[2],JSON.stringify({results,errors},null,2));await browser.close()}
