import {launchBrowser} from './support.mjs'
import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
const browser=await launchBrowser(),results=[],errors=[]
try{
 for(const dpr of [1,2]){
  const page=await browser.newPage({viewport:{width:390,height:900},hasTouch:true,isMobile:true,deviceScaleFactor:dpr});page.on('pageerror',e=>errors.push(e.message))
  await page.goto(`${process.env.TC_BROWSER_BASE}/tests/browser/drawing-workbench.html?database=tc-touch-${dpr}-${Date.now()}`);await page.waitForFunction(()=>window.ready)
  await page.evaluate(()=>{document.querySelector('#chart').style.width='320px';pro.getChart().resize()});await page.getByRole('button',{name:'全部绘图工具',exact:true}).tap();await page.getByRole('textbox',{name:'搜索绘图工具',exact:true}).fill('趋势线');await page.locator('.tc-drawing-tool-picker button').filter({hasText:/^趋势线/}).tap()
  const r=await page.evaluate(()=>{const r=pro.getChart().getDom('candle_pane','main').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})
  await page.touchscreen.tap(r.x+50,r.y+120);await page.touchscreen.tap(r.x+130,r.y+200);await page.waitForFunction(()=>pro.getDrawings().length===1)
  const handles=page.getByRole('button',{name:/^绘图控制点/});await handles.first().waitFor();for(const handle of await handles.all()){const b=await handle.boundingBox();assert.ok(Math.round(b.width*100)/100>=44);assert.ok(Math.round(b.height*100)/100>=44)}
  const center={x:r.x+90,y:r.y+160};await page.locator('.klinecharts-pro-widget').dispatchEvent('pointerdown',{pointerId:77,pointerType:'touch',isPrimary:true,clientX:center.x,clientY:center.y,button:0,bubbles:true});await page.getByRole('menu',{name:'绘图操作'}).waitFor();await page.locator('.klinecharts-pro-widget').dispatchEvent('pointerup',{pointerId:77,pointerType:'touch',clientX:center.x,clientY:center.y,button:0,bubbles:true})
  const menu=page.getByRole('menu',{name:'绘图操作'}),m=await menu.boundingBox(),root=await page.locator('.klinecharts-pro-content').boundingBox();assert.ok(m.x>=root.x&&m.x+m.width<=root.x+root.width+1);assert.ok(m.y+m.height<=root.y+root.height+1)
  await menu.getByRole('menuitem',{name:'设置',exact:true}).tap();await page.getByRole('complementary',{name:'绘图管理'}).waitFor();await page.getByRole('button',{name:'取消修改',exact:true}).tap();await page.getByRole('button',{name:'关闭绘图管理',exact:true}).tap()
  assert.equal(await page.evaluate(()=>pro.getDrawings().length),1);await page.screenshot({path:`${process.env.TC_BROWSER_EVIDENCE}/touch-${dpr}.png`});results.push({width:320,dpr,trustedTouchscreenDrawing:true,handleTarget:44,longPress:'DOM pointerType=touch simulation',menuBounds:true,settingsCancel:true});await page.evaluate(()=>{pro.dispose();preferenceStore.dispose()});await page.close()
 }
 assert.deepEqual(errors,[]);const result={passed:true,results,errors,scope:'browser-touch-simulation-not-physical-device'};writeFileSync(process.argv[2],JSON.stringify(result,null,2));console.log(JSON.stringify(result))
}finally{await browser.close()}
