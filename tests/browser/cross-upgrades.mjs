import {launchBrowser} from './support.mjs'
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'

const directory=process.env.TC_BROWSER_EVIDENCE??'/tmp/tradingchest-cross-upgrades'
mkdirSync(directory,{recursive:true})
const browser=await launchBrowser(),page=await browser.newPage({viewport:{width:1440,height:1100}})
const results=[],errors=[]
page.on('pageerror',error=>errors.push(error.message))
const run=async(name,fixture,work)=>{
 const offset=errors.length
 try{
  await page.goto((process.env.TC_BROWSER_BASE??'http://127.0.0.1:4173')+`/tests/browser/${fixture}.html`)
  await page.waitForFunction(()=>window.ready);await page.evaluate(()=>setup());await page.waitForFunction(()=>test.state.ready===1)
  await work();assert.deepEqual(errors.slice(offset),[]);results.push({name,passed:true})
 }catch(error){results.push({name,passed:false,error:String(error)});await page.screenshot({path:`${directory}/${name}.png`}).catch(()=>{})}
 finally{await page.evaluate(()=>test.chart.dispose()).catch(()=>{})}
}
try{
 await run('indicator-parameters-still-reject-non-array-iterables','analysis',async()=>{
  const result=await page.evaluate(async()=>{const before=test.chart.getIndicators().length,errors=[];for(const calcParams of [new Set([5]),new Float64Array([5])])try{await test.chart.addIndicator({name:'MA',placement:'main',calcParams})}catch(error){errors.push(error.message)}return {before,after:test.chart.getIndicators().length,errors}})
  assert.equal(result.errors.length,2);assert.ok(result.errors.every(message=>message.includes('数组')));assert.equal(result.after,result.before)
 })
 await run('initial-history-does-not-share-provider-cache','history-state',async()=>{
  const value=await page.evaluate(()=>{const chart=test.chart.getChart(),before=chart.getDataList()[0].close,token=test.chart.getAnalysisContext().token;test.state.source[20].close=999;test.state.source[20].high=1000;return {before,after:chart.getDataList()[0].close,token,afterToken:test.chart.getAnalysisContext().token}})
  assert.equal(value.after,value.before);assert.equal(value.afterToken,value.token)
 })
 await run('prepended-history-does-not-share-provider-cache','history-state',async()=>{
  await page.evaluate(()=>test.older());await page.waitForFunction(()=>test.chart.getChart().getDataList().length===520)
  const value=await page.evaluate(()=>{const chart=test.chart.getChart(),before=chart.getDataList()[0].close;test.state.source[0].close=999;test.state.source[0].high=1000;return {before,after:chart.getDataList()[0].close}})
  assert.equal(value.after,value.before)
 })
 await run('reload-history-and-metadata-have-owned-snapshots','history-state',async()=>{
  await page.evaluate(async()=>{const read=test.feed.getHistoryKLineData;test.feed.getHistoryKLineData=async(s,p,q,c)=>{const result=await read(s,p,q,c);result.metadata={state:'ready',sourceTimestamp:123};test.returned=result;return result};await test.chart.reloadData()})
  const value=await page.evaluate(()=>{const chart=test.chart.getChart(),before=chart.getDataList()[0].close;test.returned.bars[0].close=999;test.returned.bars[0].high=1000;test.returned.metadata.sourceTimestamp=999;return {before,after:chart.getDataList()[0].close,observed:test.lastState().lastRead.metadata.sourceTimestamp}})
  assert.equal(value.after,value.before);assert.equal(value.observed,123)
 })
 await run('lazy-indicator-keeps-validated-placement-and-parameters','analysis',async()=>{
  await page.evaluate(()=>{test.options={name:'example:lazy',placement:'main',calcParams:[]};test.task=test.chart.addIndicator(test.options).then(value=>({value}),error=>({error:error.message}))})
  await page.waitForFunction(()=>typeof window.releaseLazy==='function')
  const result=await page.evaluate(async()=>{test.options.placement='sub';test.options.calcParams.push(NaN);window.releaseLazy();const result=await test.task;return {...result,instances:test.chart.getIndicators().filter(i=>i.name==='example:lazy'),layout:test.capture()}})
  assert.equal(result.error,undefined);assert.equal(result.value.paneId,'candle_pane');assert.deepEqual(result.instances[0].calcParams,[])
  await page.evaluate(layout=>test.restore(layout),result.layout)
  assert.equal(await page.evaluate(()=>test.chart.getIndicators().filter(i=>i.name==='example:lazy').length),1)
 })
}finally{
 await browser.close();writeFileSync(process.argv[2]??`${directory}/evidence.json`,JSON.stringify({results,errors},null,2)+'\n')
}
console.log(JSON.stringify({results,errors},null,2));if(results.some(result=>!result.passed)||errors.length)process.exitCode=1
