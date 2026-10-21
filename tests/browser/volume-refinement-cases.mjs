import assert from 'node:assert/strict'
export async function volumeRefinement(page,results){
 await page.setViewportSize({width:1280,height:900});await page.evaluate(()=>{document.querySelector('#chart').style.width='1100px';pro.getChart().resize()})
 const manager=page.getByRole('complementary',{name:'绘图管理'}),bar=page.getByRole('region',{name:'绘图属性'})
 const seed=name=>page.evaluate(async name=>{
  await pro.executeDrawingCommand({type:'select',ids:[]});await pro.executeDrawingCommand({type:'delete',ids:pro.getDrawings().map(d=>d.logicalId)})
  const chart=pro.getChart(),bars=chart.getDataList(),samples=name==='anchoredVwap'?[bars.at(-40)]:[bars.at(-40),bars.at(-20)],id='refinement-volume',anchors=samples.map(bar=>({kind:'market',timestamp:bar.timestamp,value:bar.close}))
  pro.restoreDrawings('local',[{logicalId:id,owner:'local',anchors,parameters:name==='anchoredVwap'?{source:'close'}:{},overlay:{id,name,paneId:'candle_pane',groupId:'drawing_tools',points:anchors.map(a=>({timestamp:a.timestamp,value:a.value})),visible:true,lock:false,styles:null,extendData:null}}]);await pro.executeDrawingCommand({type:'select',ids:[id]})
 },name)
 const capture=()=>page.evaluate(async()=>{
  const chart=pro.getChart(),overlay=chart.getOverlays({id:'refinement-volume'})[0],draw=overlay.createPointFigures;let figures
  overlay.createPointFigures=args=>{figures=draw(args);return figures};chart.resize();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));overlay.createPointFigures=draw
  if(!figures)throw Error('实际 figure 回调没有执行')
  return {figures,summary:pro.getDrawingState().analytics['refinement-volume'],width:chart.getSize('candle_pane','main').width}
 })
 await seed('anchoredVwap');await bar.getByRole('button',{name:'绘图设置',exact:true}).click()
 await manager.getByRole('combobox',{name:'VWAP 带模式',exact:true}).selectOption('standard-deviation')
 await manager.getByRole('button',{name:'确认修改',exact:true}).click();await page.waitForFunction(()=>pro.getDrawingState().analytics['refinement-volume']?.bands?.values.length===3)
 const expected=await page.evaluate(()=>{const chart=pro.getChart(),bars=chart.getDataList(),data=bars.slice(-40),volume=data.reduce((sum,b)=>sum+b.volume,0),center=data.reduce((sum,b)=>sum+b.close*b.volume,0)/volume,sigma=Math.sqrt(data.reduce((sum,b)=>sum+b.volume*(b.close-center)**2,0)/volume),axis=chart.getYAxes({paneId:'candle_pane'})[0];return {center,sigma,y:[1,2,3].flatMap(m=>[axis.convertToPixel(center-m*sigma),axis.convertToPixel(center+m*sigma)])}})
 const actual=await capture();assert.ok(Number.isFinite(actual.summary.summary.vwap));assert.ok(Math.abs(actual.summary.summary.vwap-expected.center)<1e-10)
 assert.equal(actual.figures.filter(f=>f.type==='line').length,7);assert.equal(actual.figures.filter(f=>f.type==='polygon').length,6)
 for(let i=0;i<3;i++){const value=actual.summary.bands.values[i];assert.ok(Number.isFinite(value.lower)&&Number.isFinite(value.upper));assert.ok(Math.abs(value.upper-(expected.center+(i+1)*expected.sigma))<1e-10)}
 for(const y of expected.y)assert.ok(actual.figures.some(f=>f.type==='line'&&Math.abs(f.attrs.coordinates.at(-1).y-y)<1e-6))
 results.push({scenario:'trusted-vwap-settings-three-bands-actual-figures-independent-oracle',passed:true})
 await bar.getByRole('button',{name:'绘图设置',exact:true}).click();await manager.getByRole('combobox',{name:'VWAP 带模式',exact:true}).selectOption('percentage')
 await manager.getByRole('checkbox',{name:'带倍数 1',exact:true}).uncheck();await manager.getByRole('checkbox',{name:'带倍数 3',exact:true}).uncheck()
 await manager.getByRole('button',{name:'确认修改',exact:true}).click();await page.waitForFunction(()=>pro.getDrawingState().analytics['refinement-volume']?.bands?.mode==='percentage')
 const percent=(await capture()).summary;assert.equal(percent.bands.values.length,1);assert.ok(Math.abs(percent.bands.values[0].upper-percent.summary.vwap*1.02)<1e-10)
 await manager.getByRole('button',{name:'关闭绘图管理',exact:true}).click();await page.getByRole('button',{name:'撤销绘图',exact:true}).click();await page.waitForFunction(()=>pro.getDrawingState().analytics['refinement-volume'].bands.mode==='standard-deviation')
 await page.evaluate(async()=>{const chart=pro.getChart(),id=chart.getYAxes({paneId:'candle_pane'})[0].id;await pro.executeDrawingCommand({type:'update',ids:['refinement-volume'],patch:{parameters:{bandMode:'percentage',bandMultipliers:[100]}}});chart.overrideYAxis({id,paneId:'candle_pane',name:'logarithm'});chart.resize()})
 const log=await capture();assert.ok(log.figures.some(f=>f.type==='line'));assert.ok(log.figures.some(f=>f.type==='rectText'&&JSON.stringify(f.attrs).includes('部分 VWAP 带边界')))
 await page.evaluate(()=>{const chart=pro.getChart();chart.overrideYAxis({id:chart.getYAxes({paneId:'candle_pane'})[0].id,paneId:'candle_pane',name:'normal'});chart.resize()})
 results.push({scenario:'percentage-bands-single-undo-and-log-domain-preserves-center',passed:true})
 await seed('fixedRangeVolumeProfile');const before=await capture()
 await bar.getByRole('button',{name:'绘图设置',exact:true}).click()
 await manager.getByRole('combobox',{name:'分布位置',exact:true}).selectOption('right');await manager.getByRole('combobox',{name:'分布宽度',exact:true}).selectOption('0.5');await manager.getByRole('combobox',{name:'价位线延长',exact:true}).selectOption('pane-right')
 await manager.getByRole('checkbox',{name:'显示 VAH',exact:true}).uncheck();await manager.getByRole('combobox',{name:'POC 线宽',exact:true}).selectOption('3');await manager.getByRole('combobox',{name:'POC 线型',exact:true}).selectOption('dotted')
 await manager.getByRole('button',{name:'POC 颜色',exact:true}).click();await manager.getByRole('button',{name:'#f44336',exact:true}).click()
 await manager.getByRole('button',{name:'确认修改',exact:true}).click();await page.waitForFunction(()=>pro.getDrawings()[0].parameters.profileSide==='right')
 const profile=await capture();assert.deepEqual(profile.summary.summary,before.summary.summary);assert.deepEqual(profile.summary.actualRange,before.summary.actualRange)
 const lines=profile.figures.filter(f=>f.type==='line');assert.equal(lines.length,2);for(const line of lines)assert.equal(line.attrs.coordinates.at(-1).x,profile.width)
 assert.ok(lines.some(line=>line.styles.color==='#f44336'&&line.styles.size===3&&line.styles.dashedValue[0]===1));assert.ok(!profile.figures.some(f=>f.type==='rectText'&&JSON.stringify(f.attrs).includes('VAH')))
 const rectangle=profile.figures.filter(f=>f.type==='rect').map(f=>f.attrs);assert.ok(rectangle.every(r=>r.x>=0&&r.x+r.width<=profile.width))
 await manager.getByRole('button',{name:'关闭绘图管理',exact:true}).click()
 results.push({scenario:'trusted-profile-display-settings-color-and-unchanged-math',passed:true})
}
