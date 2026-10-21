import {launchBrowser} from './support.mjs'
import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
const browser=await launchBrowser(),results=[]
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[]
 page.on('pageerror',error=>errors.push(error.message))
 await page.goto(`${process.env.TC_BROWSER_BASE}/tests/browser/drawing-workbench.html?database=tc-tools-${Date.now()}`);await page.waitForFunction(()=>window.ready)
 const catalog=await page.evaluate(()=>pro.getDrawingTools())
 const wait=async n=>page.waitForFunction(n=>pro.getDrawings().length===n&&pro.getDrawingHistoryState().pending===0,n)
 for(const descriptor of catalog){
  if(await page.getByRole('complementary',{name:'绘图管理'}).count())await page.getByRole('button',{name:'关闭绘图管理'}).click()
  await page.getByRole('button',{name:'全部绘图工具',exact:true}).click();await page.getByRole('textbox',{name:'搜索绘图工具',exact:true}).fill(descriptor.toolId)
  await page.locator('.tc-drawing-tool-picker').getByText(descriptor.labels['zh-CN'],{exact:true}).click()
  const r=await page.evaluate(()=>{const r=pro.getChart().getDom('candle_pane','main').getBoundingClientRect();return {x:r.x,y:r.y}})
  const locations=Array.from({length:Math.max(descriptor.minPoints,3)},(_,i)=>({x:r.x+240+i*60,y:r.y+180+(i%2?55:-i*8)}))
  if(descriptor.toolId==='longPosition')locations[2].y=r.y+110
  if(descriptor.toolId==='shortPosition'){locations[1].y=r.y+120;locations[2].y=r.y+260}
  if(descriptor.mode==='continuous'){
   await page.mouse.move(locations[0].x,locations[0].y);await page.mouse.down();for(let i=1;i<=20;i++)await page.mouse.move(locations[0].x+i*5,locations[0].y+Math.sin(i/3)*20);await page.mouse.up()
  }else{for(const point of locations.slice(0,descriptor.minPoints))await page.mouse.click(point.x,point.y);if(descriptor.mode==='variable')await page.getByRole('button',{name:'完成绘制（Enter）',exact:true}).click()}
  if(descriptor.mode==='text'){const dialog=page.getByRole('dialog',{name:'编辑绘图文字'});await dialog.getByRole('textbox').fill(`${descriptor.labels['zh-CN']}\n隔离合成图形`);await dialog.getByRole('button',{name:'确认',exact:true}).click()}
  await wait(1)
  const original=await page.evaluate(()=>pro.getDrawings()[0]);assert.equal(original.overlay.name,descriptor.overlayName);assert.ok(original.anchors.length>=descriptor.minPoints)
  const writesBefore=await page.evaluate(()=>commits.length)
  await page.getByRole('button',{name:'绘图管理',exact:true}).click();const manager=page.getByRole('complementary',{name:'绘图管理'})
  await manager.getByRole('button',{name:`编辑 ${descriptor.labels['zh-CN']}`,exact:true}).click()
  await manager.getByLabel('对象名称',{exact:true}).fill('取消的草稿');await manager.getByRole('button',{name:'取消修改',exact:true}).click()
  assert.equal(await page.evaluate(()=>pro.getDrawings()[0].presentation?.name),undefined);assert.equal(await page.evaluate(()=>commits.length),writesBefore)
  await manager.getByRole('button',{name:`编辑 ${descriptor.labels['zh-CN']}`,exact:true}).click()
  const control=['stroke','textColor','lineWidth'].find(control=>descriptor.styleControls.includes(control));assert.ok(control,'工具必须有实际可编辑的样式能力')
  const style={group:control==='textColor'?'text':'line',key:control==='lineWidth'?'size':'color',value:control==='lineWidth'?3:'#1256ab'}
  if(control==='lineWidth')await manager.getByRole('combobox',{name:'线宽',exact:true}).selectOption('3')
  else{await manager.getByRole('button',{name:control==='stroke'?'描边颜色':'文字颜色',exact:true}).click();await manager.getByLabel('自定义颜色',{exact:true}).fill(style.value)}
  await manager.getByRole('button',{name:'确认修改',exact:true}).click()
  await page.waitForFunction(style=>pro.getDrawings()[0].overlay.styles?.[style.group]?.[style.key]===style.value,style)
  const visible=await page.evaluate(async style=>{const chart=pro.getChart(),overlay=chart.getOverlays()[0],draw=overlay.createPointFigures;let figures;overlay.createPointFigures=args=>{figures=draw(args);return figures};chart.resize();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));overlay.createPointFigures=draw;return [figures].flat().some(figure=>{const effective={...chart.getStyles().overlay[figure.type],...overlay.styles?.[figure.type],...figure.styles};return style.key==='size'?effective.size===style.value||effective.borderSize===style.value:effective.color===style.value||effective.borderColor===style.value})},style)
  assert.equal(visible,true,`${descriptor.toolId}: 样式必须进入实际绘制 figure`)
  await manager.getByRole('button',{name:'关闭绘图管理'}).click();await page.locator('.klinecharts-pro-widget').focus();await page.keyboard.press('Control+z')
  await page.waitForFunction(style=>pro.getDrawings()[0].overlay.styles?.[style.group]?.[style.key]!==style.value,style);await page.locator('.klinecharts-pro-widget').focus();await page.keyboard.press('Control+Shift+z');await page.waitForFunction(style=>pro.getDrawings()[0].overlay.styles?.[style.group]?.[style.key]===style.value,style)
  const saved=await page.evaluate(async()=>{const {captureLayout,restoreLayout}=await import('/src/persistence/v4.ts');const value=captureLayout(pro,{annotationRefs:pro.getDrawings().filter(d=>d.owner==='backend').map(d=>d.backendId)});await restoreLayout(pro,value);window.toolLayout=value;return {version:value.version,drawings:value.drawings.length,refs:value.annotationRefs.length}})
  assert.equal(saved.version,4);assert.equal(saved.drawings,original.owner==='local'?1:0);assert.equal(saved.refs,original.owner==='backend'?1:0)
  await page.evaluate(id=>pro.executeDrawingCommand({type:'select',ids:[id]}),original.logicalId);await page.locator('.klinecharts-pro-widget').focus();await page.keyboard.press('Delete');await wait(0)
  await page.keyboard.press('Control+z');await wait(1);await page.locator('.klinecharts-pro-widget').focus();await page.keyboard.press('Control+Shift+z');await wait(0)
  if(original.owner==='local'){await page.evaluate(async()=>{const {restoreLayout}=await import('/src/persistence/v4.ts');await restoreLayout(pro,toolLayout)});await wait(1);assert.equal(await page.evaluate(style=>pro.getDrawings()[0].overlay.styles[style.group][style.key],style),style.value);await page.evaluate(()=>pro.executeDrawingCommand({type:'delete',ids:pro.getDrawings().map(d=>d.logicalId)}));await wait(0)}
  const remaining=await page.evaluate(()=>pro.getChart().getOverlays().map(o=>o.id));assert.deepEqual(remaining,[])
  results.push({toolId:descriptor.toolId,owner:original.owner,anchors:original.anchors.length,create:true,cancelEdit:true,confirmedEdit:true,undoRedo:true,delete:true,v4:true});console.log('tool',descriptor.toolId,'PASS')
 }
 assert.equal(results.length,56);assert.deepEqual(errors,[])
 const evidence={passed:true,scope:'isolated-native-engine-all-catalog-tools',results,errors};if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(evidence,null,2));await page.evaluate(()=>{pro.dispose();preferenceStore.dispose()});console.log(JSON.stringify(evidence))
}finally{await browser.close()}
