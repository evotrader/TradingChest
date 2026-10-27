import {launchBrowser} from './support.mjs'
import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
let page
const browser=await launchBrowser(),result={scope:'isolated-native-drawing-expressiveness',passed:false,results:[],errors:[]},save=()=>{if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n')}
try{
 page=await browser.newPage({viewport:{width:1280,height:960}});page.on('pageerror',error=>result.errors.push(error.message))
 await page.goto(`${process.env.TC_BROWSER_BASE}/tests/browser/drawing-expressiveness.html`);await page.waitForFunction(()=>window.ready&&pro.getAnalysisContext())
 const wait=()=>page.waitForFunction(()=>pro.getDrawingHistoryState().pending===0)
 const manager=page.getByRole('complementary',{name:'绘图管理'})
 const draw=async id=>{
  const tool=await page.evaluate(id=>pro.getDrawingTools().find(tool=>tool.toolId===id),id)
  await page.getByRole('button',{name:'全部绘图工具',exact:true}).click();await page.getByRole('textbox',{name:'搜索绘图工具',exact:true}).fill(id);await page.locator('.tc-drawing-tool-picker').getByText(tool.labels['zh-CN'],{exact:true}).click()
  const pane=await page.evaluate(()=>{const box=pro.getChart().getDom('candle_pane','main').getBoundingClientRect();return {x:box.x,y:box.y}})
  for(let i=0;i<tool.minPoints;i++)await page.mouse.click(pane.x+240+i*80,pane.y+180+(i%2?50:0))
  await page.waitForFunction(()=>pro.getDrawings().length===1&&pro.getDrawingHistoryState().pending===0)
  return tool
 }
 const figures=()=>page.evaluate(async()=>{const chart=pro.getChart(),overlay=chart.getOverlays()[0],draw=overlay.createPointFigures;let actual;overlay.createPointFigures=args=>{actual=draw(args);return actual};chart.resize();await frame();overlay.createPointFigures=draw;return actual})
 const clear=async()=>{if(await manager.count())await manager.getByRole('button',{name:'关闭绘图管理',exact:true}).click();await page.evaluate(()=>pro.executeDrawingCommand({type:'delete',ids:pro.getDrawings().map(d=>d.logicalId)}));await wait()}
 for(const id of ['horizontalStraightLine','straightLine','segment','rayLine','parallelStraightLine','priceChannelLine','rect','hostLine','hostBox']){
  const tool=await draw(id),original=await page.evaluate(()=>pro.getDrawings()[0]);assert.equal((await figures()).some(figure=>figure.key==='attached-text'),false)
  await page.getByRole('region',{name:'绘图属性'}).getByRole('button',{name:'绘图设置',exact:true}).click()
  await manager.getByRole('textbox',{name:'标注正文',exact:true}).fill(`${tool.labels['zh-CN']}\n确认后保存`)
  assert.equal(await manager.getByRole('checkbox',{name:'显示附着文字',exact:true}).isChecked(),true)
  await manager.getByRole('combobox',{name:'附着文字对齐',exact:true}).selectOption('right');await manager.getByRole('combobox',{name:'附着文字位置',exact:true}).selectOption('below')
  await manager.getByRole('button',{name:'确认修改',exact:true}).click();await wait()
  const confirmed=await page.evaluate(()=>pro.getDrawings()[0]);assert.deepEqual(confirmed.anchors,original.anchors);assert.equal(confirmed.overlay.extendData,`${tool.labels['zh-CN']}\n确认后保存`)
  const label=(await figures()).find(figure=>figure.key==='attached-text');assert.ok(label,id);assert.equal(label.attrs.text,confirmed.overlay.extendData);assert.equal(label.attrs.align,'right');assert.equal(label.attrs.baseline,'top')
  await manager.getByRole('button',{name:'关闭绘图管理',exact:true}).click();await page.getByRole('button',{name:'撤销绘图',exact:true}).click();await wait();assert.equal(await page.evaluate(()=>pro.getDrawings()[0].parameters?.labelVisible),undefined)
  await page.getByRole('button',{name:'重做绘图',exact:true}).click();await wait();assert.deepEqual(await page.evaluate(()=>pro.getDrawings()[0]),confirmed)
  const restored=await page.evaluate(async()=>{const {captureLayout,saveLayoutV4,loadLayoutV4,restoreLayout}=await import('/src/persistence/v4.ts');const layout=captureLayout(pro);if(saveLayoutV4('expressiveness',layout).status!=='ok')throw Error('save failed');const read=loadLayoutV4('expressiveness');if(read.status!=='ok')throw Error('read failed');await restoreLayout(pro,read.value);return pro.getDrawings()[0]})
  assert.deepEqual(restored,confirmed);assert.ok((await figures()).some(figure=>figure.key==='attached-text'))
  result.results.push({scenario:`pointer-edit-confirm-undo-save-reopen-${id}`,passed:true});save();await clear()
 }

 // Form submissions use actual controls; expectations are computed from loaded bar identities.
 await draw('segment')
 const before=await page.evaluate(()=>pro.getDrawings()[0])
 await page.getByRole('button',{name:'绘图管理',exact:true}).click()
 await manager.getByRole('button',{name:'精确平移',exact:true}).click()
 const form=manager.getByRole('form',{name:'精确平移',exact:true})
 await form.getByRole('spinbutton',{name:'K线根数',exact:true}).fill('-1');await form.getByRole('spinbutton',{name:'价格位移',exact:true}).fill('2');await form.getByRole('combobox',{name:'价格单位',exact:true}).selectOption('tick')
 const expected=await page.evaluate(()=>{const bars=pro.getChart().getDataList();return pro.getDrawings()[0].anchors.map(anchor=>({timestamp:bars[bars.findIndex(bar=>bar.timestamp===anchor.timestamp)-1].timestamp,value:anchor.value+.5,interpolation:anchor.interpolation}))})
 await form.getByRole('button',{name:'确认平移',exact:true}).click();await wait();await form.waitFor({state:'hidden'})
 const moved=await page.evaluate(()=>pro.getDrawings()[0]);for(let i=0;i<expected.length;i++){assert.equal(moved.anchors[i].timestamp,expected[i].timestamp);assert.ok(Math.abs(moved.anchors[i].value-expected[i].value)<1e-9)}
 await manager.getByRole('button',{name:'精确平移',exact:true}).click();await form.getByRole('spinbutton',{name:'K线根数',exact:true}).fill('2');await form.getByRole('button',{name:'取消平移',exact:true}).click();assert.deepEqual(await page.evaluate(()=>pro.getDrawings()[0]),moved)
 await page.getByRole('button',{name:'撤销绘图',exact:true}).click();await wait();assert.deepEqual(await page.evaluate(()=>pro.getDrawings()[0]),before)
 await manager.getByRole('button',{name:'精确平移',exact:true}).click();await form.getByRole('spinbutton',{name:'K线根数',exact:true}).fill('999999');await form.getByRole('button',{name:'确认平移',exact:true}).click();await form.getByRole('alert').filter({hasText:'已加载历史'}).waitFor();assert.deepEqual(await page.evaluate(()=>pro.getDrawings()[0]),before);await form.getByRole('button',{name:'取消平移',exact:true}).click()
 result.results.push({scenario:'real-bar-tick-form-confirm-cancel-range-reject-single-undo',passed:true});save();await clear()

 // Every candidate really intersects the same canvas point; the picker retains all IDs.
 const overlap=await page.evaluate(async()=>{
  const chart=pro.getChart(),bars=chart.getDataList(),bar=bars.at(-35),axis=chart.getYAxes({paneId:'candle_pane'})[0],height=chart.getSize('candle_pane','main').height,value=axis.convertFromPixel(height*.5)
  const objects=Array.from({length:1002},(_,index)=>{const id='overlap-'+String(index).padStart(4,'0'),anchors=[{kind:'market',timestamp:bar.timestamp,value}];return {logicalId:id,owner:'local',anchors,presentation:{name:'同名',order:index},overlay:{id,name:'horizontalStraightLine',paneId:'candle_pane',groupId:'drawing_tools',points:[{timestamp:bar.timestamp,value}],visible:true,lock:false,styles:null,extendData:null}}})
  pro.restoreDrawings('local',objects);await pro.executeDrawingCommand({type:'select',ids:[]});await frame()
  const pane=chart.getDom('candle_pane','main').getBoundingClientRect(),pixel=chart.convertToPixel({timestamp:bar.timestamp,value},{paneId:'candle_pane'});return {x:pane.x+pane.width*.75,y:pane.y+pixel.y,writes:commits.length}
 })
 await page.locator('.klinecharts-pro-widget').focus();await page.mouse.click(overlap.x,overlap.y,{button:'right'})
 await page.getByRole('menuitem',{name:'选择此处对象（1002）',exact:true}).click()
 const candidates=page.getByRole('listbox',{name:'选择此处对象',exact:true});await candidates.waitFor();await candidates.focus()
 assert.ok(await candidates.getByRole('option').count()<=60);assert.equal(await candidates.getByRole('option').first().getAttribute('aria-setsize'),'1002')
 await page.keyboard.press('End');assert.ok(await candidates.getByRole('option').count()<=60);await page.keyboard.press('Enter');await page.waitForFunction(()=>pro.getDrawingState().selectedIds[0]==='overlap-0000')
 assert.equal(await page.evaluate(()=>commits.length),overlap.writes)
 await page.mouse.click(overlap.x,overlap.y,{button:'right'});await page.getByRole('menuitem',{name:'选择此处对象（1002）',exact:true}).click();await candidates.focus();await page.keyboard.press('Home');await page.keyboard.press('Escape')
 assert.deepEqual(await page.evaluate(()=>pro.getDrawingState().selectedIds),['overlap-0000']);assert.equal(await candidates.count(),0)
 await page.mouse.click(overlap.x,overlap.y,{button:'right'});await page.getByRole('menuitem',{name:'选择此处对象（1002）',exact:true}).click()
 await page.evaluate(()=>pro.executeDrawingCommand({type:'update',ids:['overlap-1001'],patch:{overlay:{visible:false}}}));await page.waitForFunction(()=>document.querySelector('[role=option]')?.getAttribute('aria-setsize')==='1001')
 await candidates.focus();await page.keyboard.press('Home');await page.keyboard.press('Enter');await page.waitForFunction(()=>pro.getDrawingState().selectedIds[0]==='overlap-1000')
 result.results.push({scenario:'1002-real-overlaps-virtual-dom-full-keyboard-stable-id-filter-and-cancel',passed:true});save()
 await page.evaluate(()=>pro.executeDrawingCommand({type:'select',ids:[]}));await page.mouse.click(overlap.x,overlap.y,{button:'right'});await page.getByRole('menuitem',{name:'选择此处对象（1001）',exact:true}).click();await candidates.waitFor()
 await page.evaluate(async()=>{const last=pro.getChart().getDataList().at(-1);await pro.applySnapshot({symbol:pro.getSymbol(),period:pro.getPeriod(),basis:'isolated-raw',bars:[{...last,close:last.close*10,high:last.high*10}]});await frame()})
 await page.waitForFunction(()=>document.querySelector('[role=listbox][aria-label="选择此处对象"]')?.querySelectorAll('[role=option]').length===0);assert.deepEqual(await page.evaluate(()=>pro.getDrawingState().selectedIds),[]);assert.equal(await page.evaluate(()=>commits.length),overlap.writes);await page.keyboard.press('Escape')
 result.results.push({scenario:'open-candidates-refresh-on-confirmed-same-bar-quote-with-empty-selection',passed:true});save();await clear();await page.reload();await page.waitForFunction(()=>window.ready&&pro.getAnalysisContext())

 // Attached body editing shares the existing IME and cancellation path.
 await draw('segment')
 await page.evaluate(async()=>{const drawing=pro.getDrawings()[0];drawing.overlay.extendData={text:'原正文',metadata:{source:'host',reference:'opaque'}};drawing.parameters={labelVisible:true};pro.restoreDrawings('local',[drawing]);await pro.executeDrawingCommand({type:'select',ids:[]});await frame()})
 const originalBody=await page.evaluate(()=>pro.getDrawings()[0]),label=(await figures()).find(figure=>figure.key==='attached-text')
 const labelPoint=await page.evaluate(attrs=>{const pane=pro.getChart().getDom('candle_pane','main').getBoundingClientRect();return {x:pane.x+attrs.x,y:pane.y+attrs.y-6}},label.attrs)
 await page.mouse.dblclick(labelPoint.x,labelPoint.y);const editor=page.getByRole('dialog',{name:'编辑绘图文字',exact:true});await editor.getByRole('textbox').fill('取消正文');await page.keyboard.press('Escape');assert.deepEqual(await page.evaluate(()=>pro.getDrawings()[0]),originalBody)
 await page.mouse.dblclick(labelPoint.x,labelPoint.y);const input=editor.getByRole('textbox');await input.fill('修改\n多行');await input.dispatchEvent('compositionstart');await page.keyboard.press('Control+Enter');assert.equal(await editor.count(),1);await input.dispatchEvent('compositionend');await page.keyboard.press('Control+Enter');await wait();await editor.waitFor({state:'hidden'})
 assert.deepEqual(await page.evaluate(()=>pro.getDrawings()[0].overlay.extendData),{text:'修改\n多行',metadata:{source:'host',reference:'opaque'}})
 assert.deepEqual(await page.evaluate(()=>pro.getDrawings()[0].anchors),originalBody.anchors)
 result.results.push({scenario:'actual-label-hit-doubleclick-ime-cancel-and-metadata-preservation',passed:true});save();await clear()

 // Persisted presets carry appearance only; copying preserves body and creates another identity.
 await draw('segment');await page.evaluate(()=>pro.executeDrawingCommand({type:'update',ids:pro.getDrawings().map(d=>d.logicalId),patch:{text:'不能进入模板的正文',parameters:{labelVisible:true,labelAlign:'left',labelPosition:'below'}}}));await wait()
 await page.getByRole('button',{name:'绘图管理',exact:true}).click();await manager.getByRole('button',{name:'模板',exact:true}).click();await manager.getByRole('textbox',{name:'模板名称',exact:true}).fill('附着样式');await manager.getByRole('button',{name:'保存为新模板',exact:true}).click();await page.waitForFunction(()=>pro.getDrawingState().preferences.value.templates.length===1)
 await manager.getByRole('button',{name:'设为工具默认',exact:true}).click();await page.waitForFunction(()=>pro.getDrawingState().preferences.status==='saved')
 const preset=await page.evaluate(()=>{const p=pro.getDrawingState().preferences.value;return {template:p.templates[0],defaults:p.defaults.segment,last:p.lastStyles.segment}})
 for(const value of Object.values(preset)){assert.ok(!JSON.stringify(value).includes('不能进入模板的正文'));for(const key of ['anchors','overlay','logicalId','scope'])assert.equal(value[key],undefined);assert.equal(value.parameters.labelVisible,true)}
 await manager.getByRole('button',{name:'对象',exact:true}).click();const sourceCopy=await page.evaluate(()=>pro.getDrawings()[0]);await manager.getByRole('button',{name:'复制',exact:true}).click();await manager.getByRole('button',{name:'粘贴',exact:true}).click();await page.waitForFunction(()=>pro.getDrawings().length===2&&pro.getDrawingHistoryState().pending===0)
 const copied=await page.evaluate(()=>pro.getDrawings());assert.ok(copied[0].logicalId!==copied[1].logicalId);assert.ok(copied.every(d=>d.overlay.extendData===sourceCopy.overlay.extendData));await page.getByRole('button',{name:'撤销绘图',exact:true}).click();await wait();assert.equal(await page.evaluate(()=>pro.getDrawings().length),1)
 result.results.push({scenario:'native-IDB-templates-defaults-recents-exclude-body-and-copy-preserves-body-new-ID',passed:true});save();await clear()

 // Exercise real controller confirmation outcomes with the isolated backend writer.
 for(const outcome of ['confirmed','rejected','uncertain']){
  await page.reload();await page.waitForFunction(()=>window.ready&&pro.getAnalysisContext());await page.evaluate(()=>window.ownerMode='backend');await draw('segment');const original=await page.evaluate(()=>pro.getDrawings()[0])
  await page.getByRole('region',{name:'绘图属性'}).getByRole('button',{name:'绘图设置',exact:true}).click();await manager.getByRole('textbox',{name:'标注正文',exact:true}).fill('等待明确确认');await page.evaluate(outcome=>window.mode=outcome,outcome);const start=await page.evaluate(()=>commits.length)
  await manager.getByRole('button',{name:'确认修改',exact:true}).click();await wait();await page.waitForFunction(outcome=>pro.getDrawingState().lastResult?.status===outcome, outcome==='confirmed'?'completed':outcome)
  const actual=await page.evaluate(()=>({drawing:pro.getDrawings()[0],history:pro.getDrawingHistoryState(),writes:commits.length}));assert.equal(actual.writes,start+1)
  if(outcome==='confirmed'){assert.equal(actual.drawing.overlay.extendData,'等待明确确认');assert.equal(actual.drawing.parameters.labelVisible,true);assert.deepEqual(actual.drawing.anchors,original.anchors)}else assert.deepEqual(actual.drawing,original)
  if(outcome==='uncertain')assert.deepEqual(actual.history.uncertainLogicalIds,[original.logicalId]);await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>commits.length),start+1)
  result.results.push({scenario:`backend-label-${outcome}-no-unconfirmed-body-or-automatic-retry`,passed:true});save()
 }
 await page.reload();await page.waitForFunction(()=>window.ready&&pro.getAnalysisContext())
 // Label position is derived from current native figures under each supported axis projection.
 await draw('segment');await page.evaluate(()=>pro.executeDrawingCommand({type:'update',ids:pro.getDrawings().map(d=>d.logicalId),patch:{text:'轴投影',parameters:{labelVisible:true,labelPosition:'on'}}}));await wait();const unchanged=await page.evaluate(()=>pro.getDrawings()[0].anchors)
 for(const axis of ['normal','percentage','logarithm'])for(const reverse of [false,true]){
  const applied=await page.evaluate(({axis,reverse})=>{const chart=pro.getChart();chart.overrideYAxis({id:chart.getYAxes({paneId:'candle_pane'})[0].id,paneId:'candle_pane',name:axis,reverse});chart.scrollByDistance(5);chart.zoomAtCoordinate(.01,{x:350,y:150});const actual=chart.getYAxes({paneId:'candle_pane'})[0];return {name:actual.name,reverse:actual.reverse}},{axis,reverse});assert.deepEqual(applied,{name:axis,reverse});const actual=await figures();const text=actual.find(figure=>figure.key==='attached-text');assert.ok(text,`${axis}/${reverse}`);assert.ok(Number.isFinite(text.attrs.x)&&Number.isFinite(text.attrs.y));assert.deepEqual(await page.evaluate(()=>pro.getDrawings()[0].anchors),unchanged)
  const hit=await page.evaluate(attrs=>{const pane=pro.getChart().getDom('candle_pane','main').getBoundingClientRect();return {x:pane.x+attrs.x,y:pane.y+attrs.y}},text.attrs);await page.mouse.dblclick(hit.x,hit.y);await editor.waitFor();await page.keyboard.press('Escape')
 }
 result.results.push({scenario:'native-figures-linear-percentage-log-reverse-pan-zoom-retain-authoritative-anchors',passed:true});save()
 const independent=await page.evaluate(async()=>{
  const chart=pro.getChart(),main=chart.getYAxes({paneId:'candle_pane'})[0];chart.overrideYAxis({id:main.id,paneId:'candle_pane',name:'normal',reverse:false});chart.resize();await frame()
  const range={...chart.getYAxes({paneId:'candle_pane'})[0].getRange()};for(const key of ['from','to','realFrom','realTo','displayFrom','displayTo'])range[key]+=5
  const id=chart.createYAxis({id:'independent-label-axis',name:'normal',paneId:'candle_pane',position:'left',reverse:true,createRange:()=>({...range})});if(!id)throw Error('Independent native axis was not created');await frame()
  const drawing=pro.getDrawings()[0],result=await pro.executeDrawingCommand({type:'update',ids:[drawing.logicalId],patch:{yAxisId:id}});if(result.status!=='completed')throw Error(JSON.stringify(result));await frame()
  const bars=chart.getDataList(),points=pro.getDrawings()[0].anchors.map(anchor=>chart.convertToPixel({dataIndex:bars.findIndex(bar=>bar.timestamp===anchor.timestamp)+(anchor.interpolation?.fraction??0),value:anchor.value},{paneId:'candle_pane',yAxisId:id}));return {id,x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2}
 })
 const independentLabel=(await figures()).find(figure=>figure.key==='attached-text');assert.ok(independentLabel);assert.ok(Math.abs(independentLabel.attrs.x-independent.x)<1e-6);assert.ok(Math.abs(independentLabel.attrs.y-independent.y)<1e-6);assert.deepEqual(await page.evaluate(()=>pro.getDrawings()[0].anchors),unchanged)
 const independentHit=await page.evaluate(attrs=>{const pane=pro.getChart().getDom('candle_pane','main').getBoundingClientRect();return {x:pane.x+attrs.x,y:pane.y+attrs.y}},independentLabel.attrs);await page.mouse.dblclick(independentHit.x,independentHit.y);await editor.waitFor();await page.keyboard.press('Escape');result.results.push({scenario:'independent-native-reverse-axis-attached-label-has-correct-projection-and-real-hit',passed:true});save();await clear()
 await page.evaluate(()=>{const chart=pro.getChart();chart.overrideYAxis({id:chart.getYAxes({paneId:'candle_pane'})[0].id,paneId:'candle_pane',name:'normal',reverse:false})});await draw('segment');const visibleBefore=await page.evaluate(()=>pro.getDrawings()[0]);await page.getByRole('region',{name:'绘图属性'}).getByRole('button',{name:'绘图设置',exact:true}).click();await manager.getByRole('spinbutton',{name:'数值',exact:true}).first().fill(String(visibleBefore.anchors[0].value+.1));await manager.getByRole('combobox',{name:'周期可见性',exact:true}).selectOption('list');await manager.getByRole('checkbox',{name:'1m',exact:true}).uncheck();await manager.getByRole('button',{name:'确认修改',exact:true}).click();await wait();assert.equal(await page.evaluate(()=>pro.getChart().getOverlays()[0].visible),false)
 await manager.getByRole('button',{name:'关闭绘图管理',exact:true}).click();await page.getByRole('button',{name:'撤销绘图',exact:true}).click();await wait();assert.equal(await page.evaluate(()=>pro.getChart().getOverlays()[0].visible),true);assert.deepEqual(await page.evaluate(()=>pro.getDrawings()[0]),visibleBefore);await page.getByRole('button',{name:'重做绘图',exact:true}).click();await wait();assert.equal(await page.evaluate(()=>pro.getChart().getOverlays()[0].visible),false)
 result.results.push({scenario:'coordinates-and-interval-visibility-single-confirm-undo-redo-keep-native-projection-consistent',passed:true});save();await clear()
 // Narrow layouts and DPR retain all controls and exercise long-press candidate cancellation.
 for(const dpr of [1,2]){
  const narrow=await browser.newPage({viewport:{width:390,height:960},deviceScaleFactor:dpr,hasTouch:true});narrow.on('pageerror',error=>result.errors.push(error.message));await narrow.goto(`${process.env.TC_BROWSER_BASE}/tests/browser/drawing-expressiveness.html`);await narrow.waitForFunction(()=>window.ready&&pro.getAnalysisContext())
  const p=await narrow.evaluate(async()=>{document.querySelector('#chart').style.width='320px';pro.getChart().resize();await frame();const chart=pro.getChart(),b=chart.getDataList().at(-25),axis=chart.getYAxes({paneId:'candle_pane'})[0],height=chart.getSize('candle_pane','main').height,value=axis.convertFromPixel(height*.5),anchors=[{kind:'market',timestamp:b.timestamp,value}],objects=['a','b'].map((id,index)=>({logicalId:id,owner:'local',anchors,presentation:{name:'触摸对象',order:index},parameters:{labelVisible:true},overlay:{id,name:'horizontalStraightLine',paneId:'candle_pane',groupId:'drawing_tools',points:[{timestamp:b.timestamp,value}],visible:true,lock:false,styles:null,extendData:'文字'}}));pro.restoreDrawings('local',objects);await pro.executeDrawingCommand({type:'select',ids:['a']});await frame();const pane=chart.getDom('candle_pane','main').getBoundingClientRect(),pixel=chart.convertToPixel({timestamp:b.timestamp,value},{paneId:'candle_pane'});return {x:pane.x+pane.width*.65,y:pane.y+pixel.y}})
  const widget=narrow.locator('.klinecharts-pro-widget');await widget.dispatchEvent('pointerdown',{pointerId:71,pointerType:'touch',isPrimary:true,clientX:p.x,clientY:p.y,button:0,bubbles:true});await narrow.getByRole('menu',{name:'绘图操作'}).waitFor();await widget.dispatchEvent('pointerup',{pointerId:71,pointerType:'touch',clientX:p.x,clientY:p.y,button:0,bubbles:true})
  await narrow.getByRole('menuitem',{name:'选择此处对象（2）',exact:true}).tap();const list=narrow.getByRole('listbox',{name:'选择此处对象',exact:true});await list.waitFor();const bounds=await narrow.locator('.tc-drawing-context').boundingBox(),root=await narrow.locator('.klinecharts-pro-content').boundingBox();assert.ok(bounds.x>=root.x&&bounds.x+bounds.width<=root.x+root.width+1);await narrow.keyboard.press('Escape');assert.deepEqual(await narrow.evaluate(()=>pro.getDrawingState().selectedIds),['a'])
  await narrow.getByRole('button',{name:'绘图管理',exact:true}).tap();const panel=narrow.getByRole('complementary',{name:'绘图管理',exact:true});await panel.getByRole('button',{name:'精确平移',exact:true}).tap();const draft=panel.getByRole('form',{name:'精确平移',exact:true});for(const name of ['取消平移','确认平移']){const control=draft.getByRole('button',{name,exact:true});await control.scrollIntoViewIfNeeded();const box=await control.boundingBox();assert.ok(box.width>=44&&box.height>=44)}await draft.getByRole('spinbutton',{name:'K线根数',exact:true}).fill('1');await draft.getByRole('button',{name:'取消平移',exact:true}).tap();assert.equal(await narrow.evaluate(()=>commits.length),0);assert.deepEqual(await narrow.evaluate(()=>destroy()),{subscriptions:0,dom:0});await narrow.close();result.results.push({scenario:`320px-DPR${dpr}-longpress-full-candidates-and-unsubmitted-form-cancel`,longPress:'DOM pointerType=touch simulation',passed:true});save()
 }
 assert.deepEqual(result.errors,[]);result.cleanup=await page.evaluate(()=>destroy());assert.deepEqual(result.cleanup,{subscriptions:0,dom:0});result.passed=true;save();console.log(JSON.stringify({passed:true,scenarios:result.results.length}))
}catch(error){result.failure=error.stack;if(page){result.diagnostic=await page.evaluate(()=>({selected:pro?.getDrawingState().selectedIds,last:pro?.getDrawingState().lastResult,active:document.activeElement?.outerHTML,candidates:[...document.querySelectorAll('[role=option]')].map(element=>({text:element.textContent,selected:element.getAttribute('aria-selected'),position:element.getAttribute('aria-posinset')}))})).catch(()=>undefined);await page.screenshot({path:process.env.TC_BROWSER_EVIDENCE+'/failure.png'}).catch(()=>{})}save();throw error}finally{await browser.close()}
