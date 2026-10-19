import {launchBrowser} from './support.mjs'
import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
const browser=await launchBrowser(),results=[],errors=[]
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message))
 await page.goto(`${process.env.TC_BROWSER_BASE}/tests/browser/history-routing.html?mode=queue`);await page.waitForFunction(()=>window.ready)
 const queued=await page.evaluate(async()=>{
  const pro=charts[0];await pro.commitDrawing({kind:'create',logicalId:'old-A',after:makeDrawing('old-A','backend'),source:'programmatic'})
  const blocking=pro.executeDrawingCommand({type:'preferences-retry'});while(reads<2)await Promise.resolve()
  const pending=pro.undoDrawing().then(value=>({value}),e=>({error:e.name,message:e.message})),command=pro.executeDrawingCommand({type:'undo'});pro.setSymbol({...pro.getSymbol(),ticker:'B.X'})
  while(readyCounts[0]<2)await new Promise(r=>setTimeout(r,1));await pro.commitDrawing({kind:'create',logicalId:'new-B',after:makeDrawing('new-B','backend'),source:'programmatic'});releasePreferences();await blocking
  return {public:await pending,command:await command,ids:pro.getDrawings().map(d=>d.logicalId),commits:commits.map(c=>[c.kind,c.logicalId])}
 })
 assert.equal(queued.public.error,'AbortError');assert.equal(queued.command.status,'rejected');assert.deepEqual(queued.ids,['new-B']);assert.deepEqual(queued.commits,[['create','old-A'],['create','new-B']]);results.push({scenario:'queued-public-and-command-undo-cannot-delete-B-after-A-context',passed:true,queued});await page.evaluate(()=>cleanup())
 await page.goto(`${process.env.TC_BROWSER_BASE}/tests/browser/history-routing.html`);await page.waitForFunction(()=>window.ready)
 const shared=await page.evaluate(async()=>{
  const [a,b]=charts;await a.executeDrawingCommand({type:'scope',scope:'workspace'});await a.commitDrawing({kind:'create',logicalId:'shared',after:makeDrawing('shared'),source:'programmatic'});await b.executeDrawingCommand({type:'select',ids:['shared']});await b.executeDrawingCommand({type:'delete',ids:['shared']});const deleted=b.getDrawingState();const undo=await b.undoDrawing(),redo=await b.redoDrawing();await b.executeDrawingCommand({type:'undo'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {deleted,undo,redo,state:b.getDrawingHistoryState(),callback:events[1].at(-1),ids:b.getDrawings().map(d=>d.logicalId)}
 })
 assert.equal(shared.deleted.scope,'chart');assert.equal(shared.deleted.historyScope,'workspace');assert.equal(shared.deleted.history.canUndo,true);assert.equal(shared.undo.status,'confirmed');assert.equal(shared.redo.status,'confirmed');assert.equal(shared.state.canRedo,true);assert.equal(shared.callback.canRedo,true);assert.equal(shared.callback.canUndo,shared.state.canUndo);assert.deepEqual(shared.ids,['shared']);results.push({scenario:'shared-delete-history-and-final-public-callback-agree',passed:true,shared});await page.evaluate(()=>cleanup());assert.deepEqual(errors,[])
 await page.goto(`${process.env.TC_BROWSER_BASE}/tests/browser/history-routing.html`);await page.waitForFunction(()=>window.ready)
 const transfer=await page.evaluate(async()=>{
  const pro=charts[0];for(const id of ['moved','other'])await pro.commitDrawing({kind:'create',logicalId:id,after:makeDrawing(id),source:'programmatic'})
  await pro.executeDrawingCommand({type:'select',ids:['moved']});await pro.executeDrawingCommand({type:'transfer',ids:['moved'],scope:'workspace'});await pro.undoDrawing();const afterUndo=pro.getDrawingState(),redo=await pro.redoDrawing(),afterRedo=pro.getDrawings().find(d=>d.logicalId==='moved').presentation.scope
  const commandUndo=await pro.executeDrawingCommand({type:'undo'}),commandRedo=await pro.executeDrawingCommand({type:'redo'});await pro.undoDrawing();await pro.executeDrawingCommand({type:'select',ids:['other']});const explicit=pro.getDrawingState();await pro.undoDrawing();return {afterUndo,redo,afterRedo,commandUndo,commandRedo,explicit,ids:pro.getDrawings().map(d=>d.logicalId)}
 })
 assert.deepEqual(transfer.afterUndo.selectedIds,['moved']);assert.equal(transfer.afterUndo.historyScope,'workspace');assert.equal(transfer.afterUndo.history.canRedo,true);assert.equal(transfer.redo.status,'confirmed');assert.equal(transfer.afterRedo,'workspace');assert.equal(transfer.commandUndo.status,'completed');assert.equal(transfer.commandRedo.status,'completed');assert.equal(transfer.explicit.historyScope,'chart');assert.deepEqual(transfer.ids,['moved']);results.push({scenario:'transfer-history-survives-automatic-selection-and-explicit-selection-changes-target',passed:true,transfer});await page.evaluate(()=>cleanup());assert.deepEqual(errors,[])
 writeFileSync(process.argv[2],JSON.stringify({passed:true,results,errors},null,2));console.log(JSON.stringify({passed:true,scenarios:results.length,errors}))
}finally{await browser.close()}
