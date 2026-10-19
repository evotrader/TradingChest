import {launchBrowser} from './support.mjs'
import assert from 'node:assert/strict'
const browser=await launchBrowser(),results=[],errors=[]
try{
 for(const mode of ['confirmed','lost']){
  const page=await browser.newPage({viewport:{width:1400,height:900}});page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message))
  await page.goto(`${process.env.TC_BROWSER_BASE??'http://127.0.0.1:4173'}/tests/browser/drawing-sharing.html?database=tc-cleanup-${mode}-${Date.now()}`);await page.waitForFunction(()=>workspace.getCells()[0]?.chart?.getDrawingState().sharing?.host)
  const result=await page.evaluate(async mode=>{
   const pro=workspace.getCells()[0].chart,chart=pro.getChart(),identity={namespace:'isolated-shared',symbol:{ticker:'TEST.X',market:'test',exchange:'X',priceCurrency:'USD'},priceBasisKey:'raw'},documentId=JSON.stringify(['isolated-shared','test','X','TEST.X','USD','raw']),host=await hostSessions.bind({identity,documentId}),timestamp=chart.getDataList().at(-10).timestamp,id='cleanup-race'
   const value={logicalId:id,owner:'local',overlay:{id,name:'segment',groupId:'drawing_tools',paneId:'candle_pane',lock:false,visible:true,extendData:null,styles:null,points:[{timestamp,value:100},{timestamp:timestamp+60000,value:101}]},anchors:[{kind:'market',timestamp,value:100},{kind:'market',timestamp:timestamp+60000,value:101}],presentation:{scope:'host'}}
   await host.history.submit('create',id,value,'programmatic');await host.save();await pro.executeDrawingCommand({type:'transfer',ids:[id],scope:'chart'})
   const record=host.getRecoveries()[0],write=store.write.bind(store);let release,entered;const waiting=new Promise(r=>entered=r),gate=new Promise(r=>release=r)
   store.write=async(...args)=>{entered();await gate;const result=await write(...args);if(mode==='lost')throw Error('native cleanup response lost');return result}
   const recovery=pro.executeDrawingCommand({type:'recover-transfer',id:record.id,scope:'chart'});await waiting
   const pending=pro.getDrawingHistoryState().pending;let switchError='';try{pro.setSymbol({ticker:'OTHER.X'})}catch(e){switchError=e.message}
   release();const recovered=await recovery;store.write=write
   const after={symbol:pro.getSymbol().ticker,ids:pro.getDrawings().map(d=>d.logicalId),canUndo:pro.getDrawingHistoryState().canUndo}
   let blockedAfterUnknown='',refresh
   if(mode==='lost'){try{pro.setSymbol({ticker:'OTHER.X'})}catch(e){blockedAfterUnknown=e.message}refresh=await pro.executeDrawingCommand({type:'shared',scope:'host',action:'refresh'})}
   const durable=await store.read(identity.namespace,documentId,new AbortController().signal),remaining=durable.document.transfers?.length??0
   const undo=await pro.executeDrawingCommand({type:'undo'}),undoScope=pro.getDrawings().find(d=>d.logicalId===id)?.presentation.scope,redo=await pro.executeDrawingCommand({type:'redo'}),redoScope=pro.getDrawings().find(d=>d.logicalId===id)?.presentation.scope
   return {mode,pending,switchError,recovered,after,blockedAfterUnknown,refresh,remaining,undo,redo,undoScope,redoScope}
  },mode)
  assert.ok(result.pending>0);assert.match(result.switchError,/未确认/);assert.equal(result.after.symbol,'TEST.X');assert.ok(result.after.ids.includes('cleanup-race'));assert.equal(result.after.canUndo,true);assert.equal(result.remaining,0)
  if(mode==='confirmed')assert.equal(result.recovered.status,'completed')
  else{assert.notEqual(result.recovered.status,'completed');assert.match(result.blockedAfterUnknown,/未确认/);assert.equal(result.refresh.status,'completed')}
  assert.equal(result.undo.status,'completed');assert.equal(result.redo.status,'completed');assert.equal(result.undoScope,'host');assert.equal(result.redoScope,'chart');results.push(result);await page.close()
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({scenarios:results.length,passed:true,results,errors}))
}finally{await browser.close()}
