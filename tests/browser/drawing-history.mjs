import {launchBrowser} from './support.mjs'
import assert from 'node:assert/strict';
const browser = await launchBrowser()
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.TC_BROWSER_BASE||'http://127.0.0.1:4173')+'/tests/browser/workspace.html');await page.waitForFunction(()=>window.ready);await page.evaluate(()=>setupWorkspace());
 const result=await page.evaluate(async()=>{
  const pro=charts.primary,engine=pro.getChart();engine.createIndicator({name:'VOL',id:'duplicate_vol',paneId:'second_volume',calcParams:[2,3,4]},true);if(engine.getIndicators({name:'VOL'}).length!==2)throw Error('Repeated indicator fixture was not created');const paneId='second_volume',deadline=performance.now()+10000;while(engine.getIndicators({id:'duplicate_vol'})[0]?.result.length!==engine.getDataList().length||!(engine.getSize(paneId,'main')?.height>0)){if(performance.now()>deadline)throw Error('Repeated indicator fixture did not become drawable');await new Promise(r=>setTimeout(r,1))}await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const original={logicalId:'volume-local',owner:'local',overlay:{id:'volume-local',name:'horizontalStraightLine',paneId,groupId:'drawing_tools',points:[{timestamp:engine.getDataList()[100].timestamp,value:5}],styles:{line:{color:'#1677ff'}},lock:false,visible:true}};
  pro.restoreDrawings('local',[original]);const initial=engine.getOverlays({id:original.logicalId})[0].paneId;
  await pro.commitDrawing({kind:'update',logicalId:original.logicalId,after:{...original,overlay:{...original.overlay,styles:{line:{color:'#f44336'}}}},source:'property-bar'});
  const edited=engine.getOverlays({id:original.logicalId})[0].paneId;
  await pro.undoDrawing();const undone=engine.getOverlays({id:original.logicalId})[0].paneId;
  await pro.redoDrawing();const redone=engine.getOverlays({id:original.logicalId})[0].paneId;
  pro.restoreDrawings('backend',[{...original,logicalId:'volume-backend',owner:'backend',backendId:'actual-api-id',overlay:{...original.overlay,id:'volume-backend'}}]);
  const {captureLayout,restoreLayout}=await import('/src/persistence/v4.ts');const layout=captureLayout(pro,{localDrawingIds:[original.logicalId]});const restorePaneId='restored_volume_probe';
  for(const indicator of layout.indicators){if(indicator.paneId===paneId){indicator.paneId=restorePaneId;indicator.calcParams=[8,9,10];}else if(indicator.name==='VOL')indicator.calcParams=[2,3,4];}
  for(const pane of layout.panes)if(pane.id===paneId)pane.id=restorePaneId;
  for(const axis of layout.axes)if(axis.paneId===paneId)axis.paneId=restorePaneId;
  for(const drawing of layout.drawings)if(drawing.overlay.paneId===paneId)drawing.overlay.paneId=restorePaneId;
  await restoreLayout(pro,layout);
  const restored=engine.getOverlays({id:original.logicalId})[0].paneId,backendRestored=engine.getOverlays({id:'volume-backend'})[0].paneId;
  await pro.commitDrawing({kind:'delete',logicalId:original.logicalId,after:null,source:'keyboard'});await pro.undoDrawing();
  const deleteUndone=engine.getOverlays({id:original.logicalId})[0].paneId;
  let protectedRejected=false;try{pro.restoreDrawings('local',[{...original,logicalId:'alert_system',overlay:{...original.overlay,id:'alert_system',name:'alertLine'}}]);}catch{protectedRejected=true;}
  workspace.dispose();return {paneId,restorePaneId,initial,edited,undone,redone,restored,backendRestored,deleteUndone,protectedRejected,subscriptions};
 });
 for(const key of ['initial','edited','undone','redone'])assert.equal(result[key],result.paneId,key);
 for(const key of ['restored','backendRestored','deleteUndone'])assert.equal(result[key],result.restorePaneId,key);
 assert.equal(result.protectedRejected,true);assert.equal(result.subscriptions,0);assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,...result}));
}finally{await browser.close();}
