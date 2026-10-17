import {launchBrowser} from './support.mjs'
import assert from 'node:assert/strict';
const browser = await launchBrowser()
try{
 const page=await browser.newPage({viewport:{width:1280,height:1200}}),errors=[];
 const heapSession=await page.context().newCDPSession(page);let heapUnavailable;
 await page.exposeFunction('collectComparisonHeap',async()=>{if(heapUnavailable)return {unavailable:heapUnavailable};try{await heapSession.send('HeapProfiler.collectGarbage');return {usedSize:(await heapSession.send('Runtime.getHeapUsage')).usedSize}}catch(reason){heapUnavailable=String(reason);return {unavailable:heapUnavailable}}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.TC_BROWSER_BASE||'http://127.0.0.1:4173')+'/tests/browser/comparison.html');await page.waitForFunction(()=>window.ready);await page.evaluate(()=>setup());
 const result=await page.evaluate(async()=>{
  const one=charts.one,two=charts.two,engine=one.getChart(),bars=mainBars.one;
  const a=bars.slice(5).filter((_,i)=>i!==15).map(b=>({...b,open:b.open*2,high:b.high*2,low:b.low*2,close:b.close*2}));
  const b=bars.slice(10).map((b,i)=>({...b,open:b.open*3+(i%7)*.5,high:b.high*3+(i%7)*.5,low:b.low*3+(i%7)*.5,close:b.close*3+(i%7)*.5}));
  const first=await one.addComparison({ticker:'SAME.X'},makeFeed('left-a',a));await one.addComparison({ticker:'B.X'},makeFeed('left-b',b));
  const right=await two.addComparison({ticker:'SAME.X'},makeFeed('right-a',bars.map(x=>({...x,close:x.close+.01,high:x.high+.01}))));
  const base=one.getComparisons().baseTimestamp,index=bars.findIndex(b=>b.timestamp===base);
  const wait=async()=>{for(let i=0;i<100;i++){if(engine.getIndicators({name:'COMPARE'}).every(i=>i.result.length===engine.getDataList().length&&i.result[engine.getDataList().findIndex(b=>b.timestamp===one.getComparisons().baseTimestamp)]?.pct===0))return;await new Promise(r=>setTimeout(r,10))}throw Error('Comparison calculation did not settle')};await wait();
  const lines=engine.getIndicators({name:'COMPARE'}),axes=engine.getYAxes({paneId:'candle_pane'}),axisIds=[...new Set(lines.map(i=>i.yAxisId))],samePixel=lines.map(i=>engine.convertToPixel({dataIndex:index,value:i.result[index].pct},{paneId:'candle_pane',yAxisId:i.yAxisId}).y);
  const {captureLayout}=await import('/src/persistence/v3.ts');const layout=captureLayout(one),comparisonExcludedFromPersistence=layout.indicators.every(i=>i.name!=='COMPARE')&&layout.axes.every(a=>!axisIds.includes(a.id));
  const gapIndex=bars.findIndex(x=>x.timestamp===bars[20].timestamp),gap=engine.getIndicators({id:first.indicatorId})[0].result[gapIndex].pct;
  const selected=lines.map(i=>({id:i.id,name:i.name,base:i.result[index].pct,pct:i.result[index+5].pct}));
  const originalBase=base;engine.scrollToDataIndex(80,0);engine.setBarSpace(4);const afterPan=one.getComparisons().baseTimestamp;
  const older={...bars[0],timestamp:bars[0].timestamp-60000};feeds['main-one'].replace([older,...bars]);await one.reloadData({preserveViewport:true});await wait();const afterPrepend=one.getComparisons().baseTimestamp;
  one.startReplay(index+3);await new Promise(r=>setTimeout(r,20));const replay=one.getComparisons(),replayCount=engine.getDataList().length;one.getReplayEngine().goToPosition(2);await new Promise(r=>setTimeout(r,20));const early=engine.getIndicators({name:'COMPARE'}).every(i=>i.result.every(v=>v.pct===undefined));
  feeds['left-a'].replace(a.map(x=>({...x,open:x.open*1.1,high:x.high*1.1,low:x.low*1.1,close:x.close*1.1})));one.stopReplay();
  for(let i=0;i<200&&one.getComparisons().replay;i++)await new Promise(r=>setTimeout(r,10));if(one.getComparisons().replay)throw Error('Comparison replay failed to resume');
  const retainedCount=20;one.startReplay(retainedCount);await new Promise(r=>setTimeout(r,20));
  const refreshed=[older,...bars],invalidMain=refreshed.map(bar=>bar.timestamp===one.getComparisons().baseTimestamp?{...bar,open:0,high:0,low:0,close:0}:bar);
  feeds['main-one'].replace(invalidMain);one.stopReplay();
  for(let i=0;i<200&&!document.getElementById('one').textContent.includes('回放恢复失败');i++)await new Promise(r=>setTimeout(r,10));
  const invalidResumeRetained=one.getComparisons().replay&&one.getReplayEngine()!==null&&engine.getDataList().length===retainedCount;
  if(!invalidResumeRetained)throw Error('Invalid refreshed main base lost the retained replay prefix');
  feeds['main-one'].replace(refreshed);one.stopReplay();for(let i=0;i<200&&one.getComparisons().replay;i++)await new Promise(r=>setTimeout(r,10));if(one.getComparisons().replay)throw Error('Valid main recovery failed');
  const eventually=async(predicate)=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(r=>setTimeout(r,10))}throw Error('Replay transaction did not settle')};
  const memberFeed=feeds['left-b'].feed,memberRead=memberFeed.getHistoryKLineData;
  let releaseMember,memberRequested=false;memberFeed.getHistoryKLineData=()=>{memberRequested=true;return new Promise(resolve=>releaseMember=resolve)};
  one.startReplay(20);const acceptedReturn=one.getComparisons().handles.find(h=>h.symbol.ticker==='B.X').plottedReturn;one.stopReplay();await eventually(()=>memberRequested);
  one.getReplayEngine().goToPosition(3);releaseMember(b.map((bar,i)=>({...bar,close:bar.close+(i?100:0),high:bar.high+100})));await new Promise(r=>setTimeout(r,40));
  const resumeSeekRetained=one.getComparisons().replay&&one.getReplayEngine()?.getState().position===3&&engine.getDataList().length===3;
  if(!resumeSeekRetained)throw Error('Old comparison resume overrode a newer public replay seek');
  memberFeed.getHistoryKLineData=memberRead;one.stopReplay();await eventually(()=>!one.getComparisons().replay);
  memberRequested=false;memberFeed.getHistoryKLineData=()=>{memberRequested=true;return new Promise(resolve=>releaseMember=resolve)};
  const refresh=one.refreshComparisons().then(()=>false,error=>error.name==='AbortError');await eventually(()=>memberRequested);one.startReplay(20);
  const pausedReturn=one.getComparisons().handles.find(h=>h.symbol.ticker==='B.X').plottedReturn;releaseMember(b.map((bar,i)=>({...bar,close:bar.close+(i?100:0),high:bar.high+100})));
  const enterReplayCancelledRefresh=await refresh&&one.getComparisons().replay&&one.getComparisons().handles.find(h=>h.symbol.ticker==='B.X').plottedReturn===pausedReturn&&pausedReturn===acceptedReturn;
  if(!enterReplayCancelledRefresh)throw Error('Pre-replay comparison refresh changed the accepted replay cutoff');
  memberFeed.getHistoryKLineData=memberRead;one.stopReplay();await eventually(()=>!one.getComparisons().replay);
  const mainFeed=feeds['main-one'].feed,mainRead=mainFeed.getHistoryKLineData;let releaseMain,mainRequested=false;
  mainFeed.getHistoryKLineData=()=>{mainRequested=true;return new Promise(resolve=>releaseMain=resolve)};
  one.startReplay(20);one.stopReplay();await eventually(()=>mainRequested);one.getReplayEngine().goToPosition(3);releaseMain(refreshed);await new Promise(r=>setTimeout(r,40));
  const resumeMainSeekRetained=one.getComparisons().replay&&one.getReplayEngine()?.getState().position===3&&engine.getDataList().length===3;
  if(!resumeMainSeekRetained)throw Error('Old main reload overrode a newer public replay seek');
  mainRequested=false;one.stopReplay();await eventually(()=>mainRequested);one.getReplayEngine().stepForward();releaseMain(refreshed);await new Promise(r=>setTimeout(r,40));
  const resumeMainStepRetained=one.getComparisons().replay&&one.getReplayEngine()?.getState().position===4&&engine.getDataList().length===4;
  if(!resumeMainStepRetained)throw Error('Old main reload overrode a newer public replay step');
  mainFeed.getHistoryKLineData=mainRead;one.stopReplay();await eventually(()=>!one.getComparisons().replay);
  one.removeComparison(first.id);const otherUnaffected=two.getComparisons().handles[0].id===right.id;
  const afterRemove=one.getComparisons().handles.length;one.dispose();two.dispose();
  return {base,index,resumeSeekRetained,enterReplayCancelledRefresh,resumeMainSeekRetained,resumeMainStepRetained,invalidResumeRetained,comparisonExcludedFromPersistence,axisIds,axes:axes.map(a=>({name:a.name,id:a.id,ticks:a.getTicks().map(t=>t.text)})),samePixel,gap,selected,expectedB:(b[5].close/b[0].close-1)*100,originalBase,afterPan,afterPrepend,replay:replay.replay,replayCount,early,otherUnaffected,afterRemove,resources,errors:window.errors};
 });
 const cleanup=await page.evaluate(async()=>{
  const nativeRaf=window.requestAnimationFrame,nativeCancel=window.cancelAnimationFrame,nativeAdd=window.addEventListener,nativeRemove=window.removeEventListener,pending=new Set(),resize=new Set();
  window.requestAnimationFrame=callback=>{const owned=new Error().stack.includes('ChartProComponent.tsx');let id;id=nativeRaf.call(window,time=>{pending.delete(id);callback(time)});if(owned)pending.add(id);return id};
  window.cancelAnimationFrame=id=>{pending.delete(id);nativeCancel.call(window,id)};
  window.addEventListener=function(type,handler,...args){if(type==='resize')resize.add(handler);return nativeAdd.call(this,type,handler,...args)};
  window.removeEventListener=function(type,handler,...args){if(type==='resize')resize.delete(handler);return nativeRemove.call(this,type,handler,...args)};
  const heap=[{cycle:0,...await window.collectComparisonHeap()}];
  try{
   for(let i=0;i<100;i++){
    await setup();const h=await charts.one.addComparison({ticker:'CLEANUP.X'},makeFeed(`cleanup-${i}`,mainBars.one));
    if(i%3===0)charts.one.removeComparison(h.id);else if(i%3===1)charts.one.setSymbol({ticker:'CHANGED.X'});
    charts.one.dispose();charts.two.dispose();await new Promise(resolve=>nativeRaf.call(window,()=>nativeRaf.call(window,resolve)));
    if(i===49||i===99)heap.push({cycle:i+1,...await window.collectComparisonHeap()});
    if(resources.subscriptions||resources.providers||pending.size||resize.size)throw Error('Comparison resources remained active '+JSON.stringify({resources,frames:pending.size,resize:resize.size}));
   }
   return {cycles:100,subscriptions:resources.subscriptions,providers:resources.providers,comparisonAnimationFrames:pending.size,resizeListeners:resize.size,heap};
  }finally{window.requestAnimationFrame=nativeRaf;window.cancelAnimationFrame=nativeCancel;window.addEventListener=nativeAdd;window.removeEventListener=nativeRemove;}
 });
 const {heap,...active}=cleanup;assert.deepEqual(active,{cycles:100,subscriptions:0,providers:0,comparisonAnimationFrames:0,resizeListeners:0});
 console.log(JSON.stringify(result));
 assert.equal(result.comparisonExcludedFromPersistence,true);assert.equal(result.axisIds.length,1);assert.equal(result.axes.length,2);assert.ok(result.axes.every(a=>a.name==='normal'));assert.ok(result.samePixel.every(x=>Math.abs(x-result.samePixel[0])<1e-8));assert.ok(result.selected.every(i=>i.base===0));assert.equal(result.gap,undefined);assert.ok(result.axes.find(a=>a.id===result.axisIds[0]).ticks.every(text=>text.endsWith('%')));assert.ok(Math.abs(result.selected[2].pct-result.expectedB)<1e-8);assert.notEqual(result.selected[0].pct,result.selected[2].pct);assert.equal(result.originalBase,result.afterPan);assert.equal(result.originalBase,result.afterPrepend);assert.equal(result.replay,true);assert.equal(result.invalidResumeRetained,true);assert.equal(result.early,true);assert.equal(result.otherUnaffected,true);assert.equal(result.afterRemove,1);assert.deepEqual(result.resources,{subscriptions:0,providers:0});assert.deepEqual(result.errors,[]);assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,...result,cleanup}));
}finally{await browser.close();}
