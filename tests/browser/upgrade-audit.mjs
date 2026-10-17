import {launchBrowser} from './support.mjs'
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';

const evidence={syntheticInputs:true};
const browser = await launchBrowser()
try{
  const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto((process.env.TC_BROWSER_BASE||'http://127.0.0.1:4173')+'/tests/browser/workspace.html');
  await page.waitForFunction(()=>window.ready);await page.evaluate(()=>setupWorkspace());
  evidence.rejectedLayouts=await page.evaluate(async()=>{
    const original=workspace.getCells()[0].chart,engine=original.getChart();
    original.restoreDrawings('local',[{logicalId:'audit-unsaved',owner:'local',overlay:{id:'audit-unsaved',name:'horizontalStraightLine',points:[{timestamp:engine.getDataList()[100].timestamp,value:10}],lock:false,visible:true}}]);
    const results=[];
    for(const kind of ['unsupported','duplicate-id']){
      const doc=workspace.capture();doc.layout=1;doc.cells=doc.cells.slice(0,1);doc.activeCellId='primary';doc.cells[0].chart.overlayData=[];
      if(kind==='unsupported')doc.cells[0].chart.indicators.find(i=>i.placement==='main').name='AUDIT_UNSUPPORTED_INDICATOR';
      else doc.cells[0].chart.indicators.push({...doc.cells[0].chart.indicators[0]});
      const raw=JSON.stringify(doc);let message;
      try{await workspace.restore(doc)}catch(error){message=error.message}
      results.push({kind,message,currentRetained:workspace.getCells()[0].chart===original,unsavedDrawingRetained:engine.getOverlays({id:'audit-unsaved'}).length===1,documentRetained:JSON.stringify(doc)===raw});
    }
    return results;
  });
  for(const result of evidence.rejectedLayouts){assert.ok(result.message);assert.equal(result.currentRetained,true);assert.equal(result.unsavedDrawingRetained,true);assert.equal(result.documentRetained,true);}
  evidence.duplicateSettings=await page.evaluate(()=>{
    const engine=workspace.getCells()[0].chart.getChart(),first=engine.getIndicators({name:'MA',paneId:'candle_pane'})[0];
    engine.createIndicator({id:'audit-second-ma',name:'MA',paneId:'candle_pane',calcParams:[8,9,10]},true);
    const second=engine.getIndicators({id:'audit-second-ma'})[0];
    engine.getChartStore().executeAction('onIndicatorTooltipFeatureClick',{indicator:second,paneId:second.paneId,feature:{id:'setting'}});
    return {firstId:first.id,firstBefore:[...first.calcParams]};
  });
  const dialog=()=>page.getByRole('dialog',{name:'MA',exact:true});
  await dialog().locator('input').first().fill('42');await dialog().locator('.button-container').getByRole('button').click();
  const edited=await page.evaluate(()=>workspace.getCells()[0].chart.getChart().getIndicators({name:'MA',paneId:'candle_pane'}).map(i=>({id:i.id,params:[...i.calcParams]})));
  assert.deepEqual(edited.find(i=>i.id===evidence.duplicateSettings.firstId).params,evidence.duplicateSettings.firstBefore);
  assert.deepEqual(edited.find(i=>i.id==='audit-second-ma').params,[42,9,10]);evidence.duplicateSettings.after=edited;
  await page.evaluate(()=>{const engine=workspace.getCells()[0].chart.getChart(),indicator=engine.getIndicators({id:'audit-second-ma'})[0];engine.getChartStore().executeAction('onIndicatorTooltipFeatureClick',{indicator,paneId:indicator.paneId,feature:{id:'setting'}});engine.removeIndicator({id:indicator.id});});
  await dialog().locator('input').first().fill('99');await dialog().locator('.button-container').getByRole('button').click();
  await page.getByRole('alert').filter({hasText:'待设置的指标实例已不存在'}).waitFor();
  assert.deepEqual(await page.evaluate(id=>workspace.getCells()[0].chart.getChart().getIndicators({id})[0].calcParams,evidence.duplicateSettings.firstId),evidence.duplicateSettings.firstBefore);
  evidence.removedSettingTargetRejected=true;
  evidence.initialRestore=await page.evaluate(async()=>{
    const template=workspace.capture().cells[0].chart;workspace.dispose();
    const {ChartWorkspace,KLineChartPro}=await import('/src/index.ts');
    const root=document.createElement('div');root.style.width='1200px';document.body.append(root);
    let releaseInitial,reads=0,mounted=0,disposed=0,subscriptions=0;
    const period={multiplier:1,timespan:'minute',text:'1m'},bars=Array.from({length:30},(_,i)=>({timestamp:1700000000000+i*60000,open:10,high:11,low:9,close:10,volume:1}));
    const current=new ChartWorkspace({container:root,context:'audit',symbols:[{ticker:'A.X'}],initialSymbol:{ticker:'A.X'},initialPeriod:period,
      getPeriods:async()=>{if(++reads===1)await new Promise(resolve=>releaseInitial=resolve);return [period]},
      mountCell:(container,cell)=>{
        let resolve;const ready=new Promise(done=>resolve=done);let active=false;
        const chart=new KLineChartPro({container,symbol:cell.symbol,period:cell.period,mainIndicators:['MA'],subIndicators:[],onDataReady:()=>resolve(chart),datafeed:{searchSymbols:async()=>[],getHistoryKLineData:async(_s,_p,_from,to)=>to<bars[0].timestamp?[]:bars,subscribe:()=>{if(!active){active=true;subscriptions++}},unsubscribe:()=>{if(active){active=false;subscriptions--}}}});
        mounted++;return {ready,dispose:()=>{disposed++;chart.dispose()}};
      }});
    const doc={version:1,layout:1,activeCellId:'primary',sync:{symbol:false,period:false,crosshair:false,viewport:false},columnRatio:50,rowRatio:50,cells:[{cellId:'primary',context:'audit',symbol:{ticker:'A.X'},period,chart:{...template,overlayData:[],context:{ticker:'A.X',period:{multiplier:1,timespan:'minute'}}}}]};
    const restoring=current.restore(doc);await new Promise(resolve=>setTimeout(resolve,20));
    const beforeRelease={reads,mounted};releaseInitial();await restoring;
    const restored=current.getCells()[0].chart;await new Promise(resolve=>setTimeout(resolve,80));
    const retained=current.getCells()[0].chart===restored,sections=root.querySelectorAll('[data-cell-id="primary"]').length;
    current.dispose();root.remove();return {beforeRelease,retained,sections,mounted,disposed,subscriptions};
  });
  assert.deepEqual(evidence.initialRestore.beforeRelease,{reads:1,mounted:0});assert.equal(evidence.initialRestore.retained,true);assert.equal(evidence.initialRestore.sections,1);assert.equal(evidence.initialRestore.mounted,2);assert.equal(evidence.initialRestore.disposed,2);assert.equal(evidence.initialRestore.subscriptions,0);
  assert.deepEqual(errors,[]);evidence.pageErrors=errors;evidence.passed=true;
  if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence));
}finally{await browser.close();}
