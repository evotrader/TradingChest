import {launchBrowser} from './support.mjs'
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
const {expect}=createRequire(import.meta.url)('@playwright/test')
const browser=await launchBrowser()
const evidence=process.env.TC_BROWSER_EVIDENCE??'/tmp/tradingchest-analysis-browser'
mkdirSync(evidence,{recursive:true})
const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[]
page.on('pageerror',e=>errors.push(e.message))
try{
 await page.goto((process.env.TC_BROWSER_BASE??'http://127.0.0.1:4173')+'/tests/browser/analysis.html')
 await page.waitForFunction(()=>window.ready);await page.evaluate(()=>setup());await page.waitForFunction(()=>test.state.ready>0)
 const initial=await page.evaluate(()=>test.chart.getIndicators().map(i=>({name:i.name,params:i.calcParams})))
 assert.equal(initial.find(i=>i.name==='MA').params.length,4);assert.equal(initial.find(i=>i.name==='RSI').params.length,3)
 const instances=await page.evaluate(async()=>{
  const a=await test.chart.addIndicator({name:'example:combo',placement:'sub',calcParams:[2,'close',false]}),b=await test.chart.addIndicator({name:'example:combo',placement:'sub',calcParams:[4,'open',true]})
  test.chart.updateIndicator(a.id,{calcParams:[5,'close',true]})
  const values=test.chart.getIndicators().filter(i=>i.name==='example:combo');test.custom={a,b};return values
 })
 assert.equal(new Set(instances.map(i=>i.id)).size,2);assert.deepEqual(instances.map(i=>i.calcParams),[[5,'close',true],[4,'open',true]])
 await page.getByText('指标',{exact:true}).click();await page.locator('.klinecharts-pro-indicator-modal-search input').fill('组合演示')
 const row=page.locator('[data-indicator-name="example:combo"][data-placement="sub"]')
 await row.getByRole('button',{name:'组合演示 ＋',exact:true}).click();await expect(row.locator('[data-indicator-id]')).toHaveCount(3)
 await row.locator('[data-indicator-id]').first().getByRole('button',{name:'设置',exact:true}).click()
 await page.locator('.klinecharts-pro-indicator-setting-modal-content input[type="number"]').fill('7')
 await page.locator('.klinecharts-pro-indicator-setting-modal-content select').selectOption('1')
 await page.getByRole('button',{name:'确定',exact:true}).click()
 assert.deepEqual(await page.evaluate(()=>test.chart.getIndicators().find(i=>i.id===test.custom.a.id).calcParams),[7,'open',true])
 await row.locator('[data-indicator-id]').last().getByRole('button',{name:'移除',exact:true}).click();await expect(row.locator('[data-indicator-id]')).toHaveCount(2)
 await page.getByRole('dialog',{name:'指标',exact:true}).getByRole('button',{name:'Close',exact:true}).click()
 await page.evaluate(async()=>{const layout=test.capture();await test.restore(layout);const custom=test.chart.getIndicators().filter(i=>i.name==='example:combo');if(custom.length!==2)throw Error('External instances were not restored');for(const i of custom)test.chart.removeIndicator(i.id)});
 const readonly=await page.evaluate(async()=>{
  const handle=await test.chart.addIndicator({name:'example:readonly',placement:'main'}),read=()=>{const indicator=test.chart.getChart().getIndicators({id:handle.id})[0];return indicator.createTooltipDataSource({chart:test.chart.getChart(),indicator,crosshair:{dataIndex:0}})}
  const before=read();await test.restore(test.capture());const after=read();test.chart.removeIndicator(handle.id);return {before,after}
 });for(const tooltip of [readonly.before,readonly.after]){assert.equal(tooltip.name,'Custom units');assert.equal(tooltip.legends[0].value,'unit-x');assert.ok(!tooltip.features.some(f=>f.id==='setting'))}
 const unknown=await page.evaluate(()=>{const h=test.chart.addAnalysisLayer(test.context(),{id:'unknown-price',label:'External price',type:'line',placement:'sub',valueType:'price',dataBasis:null,data:[{timestamp:test.bars[0].timestamp,value:10}]});const i=test.chart.getChart().getIndicators({name:'TC_ANALYSIS'}).find(i=>i.shortName.includes('价格口径未知'));const label=i?.shortName;h.dispose();return label});assert.ok(unknown?.includes('价格口径未知'))
 await page.evaluate(()=>test.addLayers());await page.waitForFunction(()=>test.chart.getChart().getIndicators({name:'TC_ANALYSIS'}).every(i=>i.result.length===20))
 await expect(page.locator('[data-analysis-point-id="day1"]')).toHaveText('2026-01-01: 1')
 await expect(page.locator('[data-analysis-point-id="gap"]')).toBeDisabled();await page.locator('[data-analysis-point-id="day3"]').click()
 assert.equal(await page.evaluate(()=>test.state.points.at(-1).point.value),1.0012)
 await page.evaluate(()=>{try{test.handles.labels.replaceData([{id:'bad',label:'Bad',value:NaN}])}catch{}})
 await expect(page.locator('[data-analysis-point-id]')).toHaveCount(3);await expect(page.locator('[data-analysis-label-series="labels"] [role="alert"]')).toContainText('分析标签数值无效')
 await page.evaluate(()=>test.handles.labels.replaceData([{id:'day1',label:'2026-01-01',value:1},{id:'gap',label:'2026-01-02',value:null},{id:'day3',label:'2026-01-03',value:1.0012}]))
 await expect(page.locator('[data-analysis-label-series="labels"] [role="alert"]')).toHaveCount(0)
 const source=await page.evaluate(()=>{
  const all=test.chart.getChart().getIndicators({name:'TC_ANALYSIS'}),hist=all.find(i=>i.shortName==='负柱'),line=all.find(i=>i.shortName==='价格线'),band=all.find(i=>i.shortName==='分析带')
  const labelPath=document.querySelector('[data-analysis-label-series="labels"] path').getAttribute('d')
  return {negative:hist.result[3].value,lineGap:line.result[6],bandGap:band.result[6],labelPath,paneIds:all.map(i=>i.paneId),bindings:test.bindings()}
 })
 assert.equal(source.negative,-3);assert.deepEqual(source.lineGap,{});assert.deepEqual(source.bandGap,{});assert.equal((source.labelPath.match(/M /g)??[]).length,2);assert.equal(source.bindings.paneIds,2)
 await expect(page.locator('[data-analysis-layer="events"]')).toContainText('原始缺口')
 const hit=await page.evaluate(()=>{
  const engine=test.chart.getChart(),i=engine.getIndicators({name:'TC_ANALYSIS'}).find(i=>i.shortName==='事件'),h=i.extendData.getHits().find(h=>h.event.id==='same-a'),rect=engine.getDom(i.paneId,'main').getBoundingClientRect();return {x:rect.left+h.x,y:rect.top+h.y}
 });await page.mouse.click(hit.x,hit.y);assert.equal(await page.evaluate(()=>test.state.events.at(-1).event.id),'same-a')
 await page.screenshot({path:evidence+'/analysis-all.png'})
 const saved=await page.evaluate(async()=>{const layout=test.capture();await test.restore(layout);return layout})
 assert.ok(saved.indicators.every(i=>i.name!=='TC_ANALYSIS'));assert.ok(saved.panes.every(p=>!source.paneIds.filter(id=>id!=='candle_pane').includes(p.id)))
 assert.equal(await page.evaluate(()=>test.chart.getChart().getIndicators({name:'TC_ANALYSIS'}).length),4)
 await page.evaluate(()=>test.chart.startReplay(5));await expect(page.locator('[data-analysis-label-series="labels"]')).toContainText('标签结果无精确可用时刻')
 await expect(page.locator('[data-analysis-point-id]')).toHaveCount(0);await expect(page.locator('[data-analysis-layer="events"]')).not.toContainText('迟到可用');await expect(page.locator('[data-analysis-layer="events"]')).not.toContainText('未来终点 18');await expect(page.locator('[data-analysis-layer="events"]')).toContainText('进行中的区间')
 const clipped=await page.evaluate(()=>test.chart.getChart().getIndicators({name:'TC_ANALYSIS'}).find(i=>i.shortName==='事件').extendData.events.find(e=>e.id==='range'));assert.equal(clipped.endTimestamp,await page.evaluate(()=>test.bars[4].timestamp));assert.ok(!('data'in clipped))
 await page.evaluate(()=>test.chart.getReplayEngine().goToPosition(11));await expect(page.locator('[data-analysis-layer="events"]')).toContainText('迟到可用');await page.evaluate(()=>test.chart.getReplayEngine().goToPosition(3));await expect(page.locator('[data-analysis-layer="events"]')).not.toContainText('迟到可用')
 await page.evaluate(()=>test.chart.stopReplay());await expect(page.locator('.klinecharts-pro-replay-bar')).toHaveCount(0);await expect(page.locator('[data-analysis-point-id="day1"]')).toBeVisible()
 // Main restored to a different basis, then comparison zero-base validation fails.
 const retained=await page.evaluate(async()=>{
  const feed={searchSymbols:async()=>[],getHistoryKLineData:async()=>test.bars.map(b=>({...b,open:b.open*2,high:b.high*2,low:b.low*2,close:b.close*2})),subscribe:()=>{test.comparisonSubscriptions=(test.comparisonSubscriptions??0)+1;if(test.comparisonFailSubscribe)throw Error('Isolated comparison subscription failed after attaching')},unsubscribe:()=>{test.comparisonSubscriptions--},dispose:()=>{}}
  await test.chart.addComparison({ticker:'OTHER'},feed);test.chart.startReplay(5)
  test.before={token:test.context().token,basis:test.context().basis,bars:test.chart.getChart().getDataList(),bindings:test.bindings()};test.state.basis='adjusted';test.state.bars=test.bars.map((b,index)=>index?b:{...b,open:0,high:0,low:0,close:0})
  test.chart.stopReplay();return test.before
 })
 await expect(page.locator('.klinecharts-pro-data-error')).toContainText('回放恢复失败')
 const after=await page.evaluate(()=>({token:test.context().token,basis:test.context().basis,bars:test.chart.getChart().getDataList(),bindings:test.bindings(),replay:!!test.chart.getReplayEngine()}))
 assert.equal(after.replay,true);assert.equal(after.token,retained.token);assert.equal(after.basis,retained.basis);assert.deepEqual(after.bars,retained.bars);assert.deepEqual(after.bindings,retained.bindings);await expect(page.locator('[data-analysis-point-id]')).toHaveCount(0)
 await page.evaluate(()=>{test.state.bars=test.bars;test.chart.stopReplay()});await expect(page.locator('.klinecharts-pro-replay-bar')).toHaveCount(0)
 assert.equal(await page.evaluate(()=>test.context().basis),'adjusted');assert.notEqual(await page.evaluate(()=>test.context().token),retained.token);assert.equal(await page.evaluate(()=>test.chart.getChart().getIndicators({name:'TC_ANALYSIS'}).length),0)
 const stale=await page.evaluate(()=>{try{test.handles.line.replaceData([]);return false}catch{return true}});assert.equal(stale,true)
 for(const kind of ['main','comparison']){
  const before=await page.evaluate(kind=>{test.addLayers();test.chart.startReplay(5);test.before={token:test.context().token,basis:test.context().basis,bars:test.chart.getChart().getDataList(),bindings:test.bindings()};test.state.basis=`${kind}-subscription-basis`;if(kind==='main')test.state.failSubscribe=true;else test.comparisonFailSubscribe=true;test.chart.stopReplay();return test.before},kind)
  await expect(page.locator('.klinecharts-pro-data-error')).toContainText('回放恢复失败')
  const failed=await page.evaluate(()=>({context:test.context(),bars:test.chart.getChart().getDataList(),bindings:test.bindings(),mainSubscriptions:test.state.subscriptions,comparisonSubscriptions:test.comparisonSubscriptions,replay:test.chart.getComparisons().replay}))
  assert.equal(failed.context.token,before.token);assert.equal(failed.context.basis,before.basis);assert.deepEqual(failed.bars,before.bars);assert.deepEqual(failed.bindings,before.bindings);assert.equal(failed.mainSubscriptions,0);assert.equal(failed.comparisonSubscriptions,0);assert.equal(failed.replay,true)
  await page.evaluate(()=>{test.state.failSubscribe=false;test.comparisonFailSubscribe=false;test.chart.stopReplay()});await expect(page.locator('.klinecharts-pro-replay-bar')).toHaveCount(0);assert.notEqual(await page.evaluate(()=>test.context().token),before.token)
 }
 await page.evaluate(()=>test.chart.dispose());assert.equal(await page.locator('.klinecharts-pro-widget').count(),0)
 await page.evaluate(()=>setup());await page.waitForFunction(()=>test.state.ready>0)
 await page.evaluate(async()=>{test.chart.startReplay(5);const last=test.bars.at(-1),next={...last,timestamp:last.timestamp+60000};test.queued=next;await test.chart.applySnapshot({symbol:test.chart.getSymbol(),period:test.chart.getPeriod(),basis:'raw',bars:[...test.bars,next]});test.state.failSubscribe=true;test.chart.stopReplay()})
 await expect(page.locator('.klinecharts-pro-data-error')).toContainText('回放恢复失败');assert.equal(await page.evaluate(()=>test.chart.getChart().getDataList().length),5)
 await page.evaluate(()=>{test.state.failSubscribe=false;test.chart.stopReplay()});await expect(page.locator('.klinecharts-pro-replay-bar')).toHaveCount(0)
 await page.waitForFunction(()=>test.chart.getChart().getDataList().length===21);assert.equal(await page.evaluate(()=>test.chart.getChart().getDataList().at(-1).timestamp),await page.evaluate(()=>test.queued.timestamp));await page.evaluate(()=>test.chart.dispose())
 await page.evaluate(()=>setup());await page.waitForFunction(()=>test.state.ready>0)
 const cancellation=await page.evaluate(async()=>{const pending=test.chart.addIndicator({name:'example:lazy',placement:'main'}).then(()=>false,error=>error.name==='AbortError');while(!window.releaseLazy)await Promise.resolve();test.chart.setSymbol({ticker:'OTHER'});window.releaseLazy();const cancelled=await pending,instances=test.chart.getChart().getIndicators({name:'example:lazy'}).length;let missingRejected=false;try{test.chart.updateIndicator('missing',{visible:false})}catch{missingRejected=true}test.chart.dispose();return {cancelled,instances,missingRejected}})
 assert.deepEqual(cancellation,{cancelled:true,instances:0,missingRejected:true})
 const cleanup=await page.evaluate(async()=>{let leaks=0;for(let i=0;i<100;i++){const host=document.createElement('div');host.style.cssText='width:800px;height:500px';document.body.append(host);const s=setup(host);for(let wait=0;wait<100&&!s.state.ready;wait++)await new Promise(r=>setTimeout(r,1));const c=s.chart.getChart();s.addLayers();s.chart.dispose();const binding=runtimeBindings.get(c);if(s.state.subscriptions||host.children.length||binding)leaks++;host.remove()}return {cycles:100,leaks}})
 assert.deepEqual(cleanup,{cycles:100,leaks:0});assert.deepEqual(errors,[])
 writeFileSync(evidence+'/analysis-results.json',JSON.stringify({passed:true,source,cleanup,errors},null,2));console.log(JSON.stringify({passed:true,cleanup}))
}catch(e){await page.screenshot({path:evidence+'/failure.png'}).catch(()=>{});throw e}finally{await browser.close()}
