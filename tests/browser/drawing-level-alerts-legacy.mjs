import assert from 'node:assert/strict'
import {prepareLegacyDrawingReader} from './drawing-workflow-legacy.mjs'

export async function checkLegacyLevelAlerts(browser,document){
 const prepared=prepareLegacyDrawingReader('0.15.0'),page=await browser.newPage()
 try{
  await page.goto(`${process.env.TC_BROWSER_BASE}/tests/browser/drawing-workflow-legacy.html?entry=${encodeURIComponent(prepared.entry)}`);await page.waitForFunction(()=>window.legacyReady)
  assert.equal(await page.evaluate(()=>window.legacyFailure),undefined)
  const result=await page.evaluate(async candidate=>{
   const host=document.createElement('div');host.style.cssText='width:1000px;height:700px';document.body.append(host)
   const bars=Array.from({length:30},(_,i)=>({timestamp:1700000000000+i*60000,open:99,high:102,low:98,close:101,volume:10}))
   const pro=new legacy.KLineChartPro({container:host,drawingAlertScope:candidate.scope,symbol:{ticker:'OLD'},period:{multiplier:1,timespan:'minute',text:'1m'},mainIndicators:[],subIndicators:[],datafeed:{searchSymbols:async()=>[],getHistoryKLineData:async()=>({bars,hasMoreBefore:false}),subscribe:()=>{},unsubscribe:()=>{}}})
   const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))
   try{
    while(!pro.getAnalysisContext())await frame()
    const anchor={kind:'market',timestamp:bars[10].timestamp,value:100},id='old-source'
    pro.restoreDrawings('local',[{logicalId:id,owner:'local',anchors:[anchor],overlay:{id,name:'horizontalStraightLine',paneId:'candle_pane',groupId:'drawing_tools',points:[{timestamp:anchor.timestamp,value:100}],styles:null,extendData:null,visible:true,lock:false}}])
    if(pro.executeDrawingAlertCommand({type:'create',drawingLogicalId:id}).status!=='completed')throw Error('Old package control rule failed')
    const before=pro.captureDrawingAlerts();let error
    try{pro.restoreDrawingAlerts(candidate)}catch(reason){error=reason.message}
    return {before,after:pro.captureDrawingAlerts(),error}
   }finally{pro.dispose();host.remove()}
  },document)
  assert.equal(result.before.version,1);assert.equal(result.before.rules.length,1);assert.ok(result.error);assert.deepEqual(result.after,result.before)
  return {package:'trading-chest@0.15.0',v1Control:true,rejectsV2:true,preservesOriginal:true}
 }finally{await page.close();prepared.dispose()}
}
