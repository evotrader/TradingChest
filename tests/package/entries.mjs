import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, copyFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSync } from 'esbuild'
import { JSDOM } from 'jsdom'
import {createServer} from 'vite'
import {launchBrowser} from '../browser/support.mjs'
const root = fileURLToPath(new URL('../../', import.meta.url))
const dir = mkdtempSync(path.join(tmpdir(), 'trading-chest-pack-'))
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const run = (command, args, cwd = dir) => execFileSync(command, args, {cwd, stdio:'pipe', encoding:'utf8', env:{...process.env,npm_config_cache:process.env.npm_config_cache ?? path.join(tmpdir(),'trading-chest-pack-cache')}})
try {
  const packed = JSON.parse(run(npm, ['pack','--json','--pack-destination',dir], root))[0]
  writeFileSync(path.join(dir,'package.json'), JSON.stringify({private:true,type:'module'}))
  run(npm, ['install','--ignore-scripts','--no-audit','--no-fund',path.join(dir,packed.filename),'jsdom@30.0.1','klinecharts@10.1.0','@types/react@18.3.31'])
  assert.equal(existsSync(path.join(dir,'node_modules/react')), false, 'chart-only install pulled React')
  // Chart entrypoints are browser modules, including the CJS browser bundle.
  const browserFixture = (name, source) => {
    const entry = path.join(dir, name);
    writeFileSync(entry, source);
    const code = buildSync({entryPoints:[entry],bundle:true,write:false,format:'iife',platform:'browser',
      mainFields:['browser','module','main'],conditions:['browser']}).outputFiles[0].text;
    const dom = new JSDOM('<div id="host"></div>', {url:'http://localhost',runScripts:'outside-only'});
    try { dom.window.eval(code); } finally { dom.window.close(); }
  };
  browserFixture('chart-browser.mjs', `
import {KLineChartPro,builtinIndicatorCatalog,registerIndicatorDefinition,ChartWorkspace,WorkspaceStoreError,createIndexedDBWorkspaceStore,readLegacyWorkspace} from 'trading-chest/chart';
if([ChartWorkspace,WorkspaceStoreError,createIndexedDBWorkspaceStore,readLegacyWorkspace].some(value=>typeof value!=='function'))throw Error('missing data/workspace exports');
import {createSignal,createComponent} from 'solid-js';
import {render} from 'solid-js/web';
import {MetricSeries} from 'trading-chest/solid';
if(typeof KLineChartPro!=='function') throw Error('missing ESM chart');
if(!Array.isArray(builtinIndicatorCatalog)||typeof registerIndicatorDefinition!=='function') throw Error('missing catalog exports');
const host=document.getElementById('host');
const [state,setState]=createSignal({status:'loading'});
const dispose=render(()=>createComponent(MetricSeries,{get viewState(){return state()},points:[]}),host);
const before=host.textContent;
setState({status:'error',message:'host-runtime-updated'});
if(host.textContent===before || !host.textContent.includes('host-runtime-updated')) throw Error('shared Solid update failed');
dispose();
if(host.childNodes.length!==0) throw Error('widget cleanup failed');
`);
  browserFixture('chart-browser.cjs', `
const chart=require('trading-chest/chart');
if(typeof chart.KLineChartPro!=='function') throw Error('missing CommonJS chart');
if([chart.ChartWorkspace,chart.WorkspaceStoreError,chart.createIndexedDBWorkspaceStore,chart.readLegacyWorkspace].some(value=>typeof value!=='function'))throw Error('missing CommonJS data/workspace exports');
if(typeof chart.registerIndicatorDefinition!=='function'||!Array.isArray(chart.builtinIndicatorCatalog)) throw Error('missing CommonJS SDK');
`);
  console.log('Packed ESM/CJS browser consumers without React and shared Solid runtime PASS');
  writeFileSync(path.join(dir,'consumer.ts'), `
import { KLineChartPro,registerIndicatorDefinition,builtinIndicatorCatalog,type DatafeedRequestContext,type ChartPro,type IndicatorDescriptor,type IndicatorParameterSchema,type IndicatorHandle,type AnalysisContext,type AnalysisLayerSpec,type AnalysisLayerHandle,type AnalysisEvent,type AnalysisLabelPoint,type HistoryQuery,type HistoryResult,type Datafeed,type WorkspaceStore,type WorkspaceWrite,type StoredWorkspace,createIndexedDBWorkspaceStore,ChartWorkspace } from 'trading-chest/chart';
import type {AnalysisLayerSpec as RootLayer,IndicatorDescriptor as RootDescriptor} from 'trading-chest';
import { MetricSeries } from 'trading-chest/solid';
void KLineChartPro; void MetricSeries; void registerIndicatorDefinition; void builtinIndicatorCatalog;
let context:DatafeedRequestContext|undefined;void context;
const query:HistoryQuery={kind:'before',before:Date.now(),countBack:500};void query;
const feed:Datafeed={searchSymbols:async()=>[],getHistoryKLineData:async(_symbol,_period,query,_context):Promise<HistoryResult>=>query.kind==='before'?{bars:[],hasMoreBefore:false}:{bars:[]},subscribe:()=>{},unsubscribe:()=>{}};void feed;
const store:WorkspaceStore=createIndexedDBWorkspaceStore();declare const input:WorkspaceWrite;declare const signal:AbortSignal;const stored:Promise<StoredWorkspace>=store.write('opaque',input,signal);void stored;
declare const workspace:ChartWorkspace;void workspace.listSaved();void workspace.saveAs('name');void workspace.load('id');void workspace.renameSaved('id','name');void workspace.deleteSaved('id');void workspace.importLegacy('old');
declare const chart:ChartPro;
declare const scope:AnalysisContext;
const layer:AnalysisLayerSpec={id:'labels',label:'Labels',type:'label-series',data:[{id:'date',label:'2026-01-01',value:null}]};
const rootLayer:RootLayer=layer;void rootLayer;
const descriptor:IndicatorDescriptor={name:'EXAMPLE/test',label:'Test',category:'custom',placements:['sub'],parameters:{items:[{type:'boolean',label:'Enabled'}]}};
const rootDescriptor:RootDescriptor=descriptor;void rootDescriptor;
const handle:AnalysisLayerHandle<typeof layer>=chart.addAnalysisLayer(scope,layer);handle.replaceData(layer.data);handle.setVisible(false);handle.dispose();
void chart.retryData();void chart.getIndicatorCatalog();void chart.getIndicators();void chart.getAnalysisContext();
chart.addIndicator({name:'MA',placement:'main',calcParams:[3,7]}).then((handle:IndicatorHandle)=>{chart.updateIndicator(handle.id,{calcParams:[4,8],visible:true});chart.removeIndicator(handle.id)});
let schema:IndicatorParameterSchema|undefined;let event:AnalysisEvent|undefined;let point:AnalysisLabelPoint|undefined;void schema;void event;void point;
`)
  run(process.execPath,[createRequire(import.meta.url).resolve('typescript/bin/tsc'),'consumer.ts','--noEmit','--module','NodeNext','--moduleResolution','NodeNext','--target','es2022'])
  writeFileSync(path.join(dir,'react.mjs'), `
import assert from 'node:assert/strict'
import {createRequire} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {LiveSharpeChart} from 'trading-chest/react';
const html = renderToStaticMarkup(React.createElement(LiveSharpeChart,{series:[{timestamp:'2026-01-01',ratio:0}]}));
assert.ok(html.includes('<svg'));
console.log('React '+React.version+' packed-entry PASS');
`)
  for (const version of ['18.3.1','19.2.3']) {
    run(npm,['install','--ignore-scripts','--no-audit','--no-fund',`react@${version}`,`react-dom@${version}`])
    console.log(run(process.execPath,['react.mjs']))
  }
  browserFixture('legacy-browser.mjs', `
import {KLineChartPro,mountAnalyticalWidget,registerIndicatorDefinition,builtinIndicatorCatalog} from 'trading-chest';
if(typeof KLineChartPro!=='function'||typeof mountAnalyticalWidget!=='function'||typeof registerIndicatorDefinition!=='function'||!Array.isArray(builtinIndicatorCatalog)) throw Error('legacy ESM exports missing');
`);
  browserFixture('legacy-browser.cjs', `
const root=require('trading-chest');
if(typeof root.KLineChartPro!=='function'||typeof root.mountAnalyticalWidget!=='function'||typeof root.registerIndicatorDefinition!=='function'||!Array.isArray(root.builtinIndicatorCatalog)) throw Error('root CommonJS exports missing');
`);
  writeFileSync(path.join(dir,'legacy.mjs'), `
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const dom=new JSDOM('<div></div>',{url:'http://localhost',runScripts:'outside-only'});
dom.window.eval(readFileSync(new URL('./dist/umd/klinecharts.js', 'file://'+require.resolve('klinecharts/package.json')),'utf8'));
dom.window.React=(await import('react')).default;
dom.window.eval(readFileSync(require.resolve('trading-chest/dist/trading-chest.umd.js'),'utf8'));
assert.equal(typeof dom.window.tradingchest.KLineChartPro,'function');
assert.equal(typeof dom.window.tradingchest.registerIndicatorDefinition,'function');
assert.ok(Array.isArray(dom.window.tradingchest.builtinIndicatorCatalog));
assert.ok(require.resolve('trading-chest/dist/trading-chest.css'));
dom.window.close();
console.log('Legacy browser UMD and CSS paths PASS');
`);
  console.log(run(process.execPath,['legacy.mjs']));
  for (const asset of ['trading-chest.js','trading-chest.umd.js','trading-chest.css','index.d.ts']) {
    assert.ok(existsSync(path.join(dir,'node_modules/trading-chest/dist',asset)), 'missing legacy '+asset)
  }
  console.log('Packed subentries, declarations and legacy assets PASS')
  for(const name of ['index.html','main.mjs','data-workspace.html','data-workspace.mjs'])copyFileSync(path.join(root,'examples/analysis-sdk',name),path.join(dir,name))
  writeFileSync(path.join(dir,'mixed.mjs'),`import * as root from 'trading-chest'; import * as sub from 'trading-chest/chart'; window.mixedEntries={root,sub}; export {root,sub};`)
  const htmlPath=path.join(dir,'index.html');writeFileSync(htmlPath,readFileSync(htmlPath,'utf8').replace('</html>', '<script type="module" src="/mixed.mjs"></script></html>'))
  const evidence=path.resolve(process.env.TC_PACKAGE_EVIDENCE || path.join(root,'test-results/package'));mkdirSync(evidence,{recursive:true})
  const server=await createServer({root:dir,configFile:false,server:{host:'127.0.0.1',port:0}})
  let browser, packagePage, packageErrors=[]
  try {
    await server.listen()
    browser=await launchBrowser({traceDir:evidence})
    const page=await browser.newPage({viewport:{width:1280,height:1400}}),errors=[]
    packagePage=page;packageErrors=errors
    page.on('pageerror',error=>{errors.push(error.message);console.error('Standalone example browser error:',error.message)})
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`)
    await page.waitForFunction(()=>window.analysisDemo?.ready&&window.mixedEntries)
    await page.waitForFunction(()=>window.analysisDemo.chart.getChart().getIndicators({name:'TC_ANALYSIS'}).every(i=>i.result.length===120))
    const rendered=await page.evaluate(()=>{
      const {chart,bars}=window.analysisDemo,engine=chart.getChart(),lines=engine.getIndicators({name:'TC_ANALYSIS'})
      const histogram=lines.find(i=>i.extendData.type==='histogram'),band=lines.find(i=>i.extendData.type==='band'),line=lines.find(i=>i.extendData.type==='line')
      return {count:lines.length,histogram:histogram.result[0].value,lower:band.result[20].lower,expectedLower:bars[20].close-.5,gap:line.result[0].value,canvases:document.querySelectorAll('canvas').length}
    })
    assert.equal(rendered.count,4);assert.equal(rendered.histogram,-5);assert.equal(rendered.lower,rendered.expectedLower);assert.equal(rendered.gap,undefined);assert.ok(rendered.canvases>0)
    await page.getByRole('button',{name:'添加两个指标实例',exact:true}).click()
    await page.getByRole('status').filter({hasText:'已添加两个独立实例'}).waitFor()
    const original=await page.evaluate(()=>window.analysisDemo.chart.getIndicators().filter(i=>i.name==='EXAMPLE/MovingAverage'))
    assert.equal(original.length,2);assert.notEqual(original[0].id,original[1].id)
    await page.getByRole('button',{name:'修改第一个实例',exact:true}).click()
    await page.getByRole('status').filter({hasText:'第一个实例已更新'}).waitFor()
    const updated=await page.evaluate(()=>window.analysisDemo.chart.getIndicators().filter(i=>i.name==='EXAMPLE/MovingAverage'))
    assert.deepEqual(updated.find(i=>i.id===original[0].id).calcParams,[12,'close',true]);assert.deepEqual(updated.find(i=>i.id===original[1].id).calcParams,original[1].calcParams)
    await page.getByRole('button',{name:'捕获布局',exact:true}).click()
    await page.getByRole('status').filter({hasText:'布局已捕获'}).waitFor()
    assert.equal(await page.evaluate(()=>window.analysisDemo.saved.indicators.some(i=>i.name==='TC_ANALYSIS')),false)
    await page.getByRole('button',{name:'恢复布局',exact:true}).click()
    await page.getByRole('status').filter({hasText:'布局已恢复'}).waitFor()
    assert.equal(await page.evaluate(()=>window.analysisDemo.chart.getChart().getIndicators({name:'TC_ANALYSIS'}).length),4)
    assert.ok((await page.locator('body').innerText()).includes('2026-01-10'))
    await page.getByRole('button',{name:'开始回放',exact:true}).click()
    await page.getByText('标签结果无精确可用时刻',{exact:true}).waitFor()
    assert.equal(await page.getByText('2026-01-10',{exact:true}).count(),0)
    await page.getByRole('button',{name:'退出回放',exact:true}).click()
    await page.waitForFunction(()=>!window.analysisDemo.chart.getReplayEngine())
    assert.ok((await page.locator('body').innerText()).includes('2026-01-10'))
    await page.getByRole('button',{name:'移除第二个实例',exact:true}).click()
    await page.getByRole('status').filter({hasText:'第二个实例已移除'}).waitFor()
    assert.equal(await page.evaluate(()=>window.analysisDemo.chart.getIndicators().filter(i=>i.name==='EXAMPLE/MovingAverage').length),1)
    await page.screenshot({path:path.join(evidence,'analysis-sdk.png'),fullPage:true})
    const mixed=await page.evaluate(async()=>{
      const {root,sub}=await import('/mixed.mjs'),chart=window.analysisDemo.chart
      if(root.indicatorRegistry!==sub.indicatorRegistry)throw Error('Entrypoints split the global definition registry')
      root.registerIndicatorDefinition('PACKED/lazy',async()=>({name:'PACKED/lazy',calcParams:[],figures:[{key:'value',type:'line'}],calc:bars=>bars.map(bar=>({value:bar.close}))}))
      let releaseLayout
      root.registerIndicatorDefinition('PACKED/layout-lazy',()=>new Promise(resolve=>{releaseLayout=()=>resolve({name:'PACKED/layout-lazy',calcParams:[],figures:[{key:'value',type:'line'}],calc:bars=>bars.map(bar=>({value:bar.close}))})}))
      const catalog=[...sub.builtinIndicatorCatalog,...['PACKED/lazy','PACKED/layout-lazy'].map(name=>({name,label:'Lazy from root',category:'custom',placements:['main'],parameters:{items:[]}}))]
      const host=document.createElement('div');host.style.cssText='height:700px;width:1000px';document.body.append(host)
      let ready,readyCount=0;const loaded=new Promise(resolve=>ready=resolve)
      const other=new sub.KLineChartPro({container:host,indicatorCatalog:catalog,symbol:{ticker:'PACKED'},period:chart.getPeriod(),mainIndicators:[],subIndicators:[],onDataReady:()=>{readyCount++;ready()},datafeed:{searchSymbols:async()=>[],getHistoryKLineData:async(_s,_p,query)=>query.kind==='before'?{bars:window.analysisDemo.bars.filter(bar=>bar.timestamp<query.before),hasMoreBefore:false}:{bars:window.analysisDemo.bars.filter(bar=>bar.timestamp>=query.from&&bar.timestamp<query.to)},subscribe:()=>{},unsubscribe:()=>{}}})
      await loaded;const handle=await other.addIndicator({name:'PACKED/lazy',placement:'main'});other.removeIndicator(handle.id)
      other.addAnalysisLayer(other.getAnalysisContext(),{id:'mixed',label:'Mixed entrypoints',type:'line',placement:'sub',valueType:'scalar',data:[{timestamp:window.analysisDemo.bars[0].timestamp,value:1}]})
      const fromRoot=root.captureLayout(other),fromChart=sub.captureLayout(other)
      if(fromRoot.indicators.some(i=>i.name==='TC_ANALYSIS')||fromChart.indicators.some(i=>i.name==='TC_ANALYSIS'))throw Error('Mixed entrypoint capture serialized runtime layers')
      await root.restoreLayout(other,fromRoot)
      if(other.getChart().getIndicators({name:'TC_ANALYSIS'}).length!==1)throw Error('Mixed entrypoint restore removed an active runtime layer')
      const pendingLayout=root.captureLayout(other)
      pendingLayout.indicators.push({id:'packed-stale-layout',name:'PACKED/layout-lazy',placement:'main',paneId:'candle_pane',calcParams:[],visible:true})
      const restoring=root.restoreLayout(other,pendingLayout).then(()=>false,error=>error.name==='AbortError')
      for(let i=0;i<1000&&!releaseLayout;i++)await new Promise(resolve=>setTimeout(resolve,1))
      if(!releaseLayout)throw Error('Mixed entrypoint lazy layout was not requested')
      for(const ticker of ['PACKED.OTHER','PACKED']){const previous=readyCount;other.setSymbol({ticker});for(let i=0;i<1000&&readyCount===previous;i++)await new Promise(resolve=>setTimeout(resolve,1));if(readyCount===previous)throw Error('Packed identity switch did not complete')}
      releaseLayout()
      if(!await restoring||other.getChart().getIndicators({id:'packed-stale-layout'}).length)throw Error('Mixed entrypoint restore crossed an identity epoch')
      other.dispose();host.remove();return {sharedDefinitions:true,lazyAcrossEntries:true,runtimeExcluded:true,runtimeRetained:true,staleLayoutCancelled:true}
    })
    console.log('Packed mixed root/chart definitions, lazy registration and runtime ownership PASS',JSON.stringify(mixed))
    await page.evaluate(()=>window.analysisDemo.chart.dispose());assert.deepEqual(errors,[])
    writeFileSync(path.join(evidence,'analysis-sdk.json'),JSON.stringify({passed:true,source:'installed tarball',rendered,original,updated,mixed,errors},null,2)+'\n')
    console.log('Installed tarball analysis example: real Chromium API, numerical rendering, instances, layout and replay PASS')
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/data-workspace.html`)
    await page.waitForFunction(()=>window.dataWorkspaceDemo?.ready)
    await page.getByRole('button',{name:'读取过去 12 根（before）',exact:true}).click();await page.getByRole('status').filter({hasText:'before 返回 12 根'}).waitFor()
    await page.getByRole('button',{name:'读取完整合成会话（range）',exact:true}).click();await page.getByRole('status').filter({hasText:'range 返回完整区间 240 根'}).waitFor()
    await page.getByRole('button',{name:'下一次读取模拟失败',exact:true}).click();await page.getByRole('button',{name:'重载活动图（range）',exact:true}).click();await page.locator('.klinecharts-pro-data-error').waitFor();await page.getByRole('button',{name:'重试活动图',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.klinecharts-pro-data-error'))
    const workspaceName=page.getByLabel('工作台名称',{exact:true}),savedSelect=page.getByLabel('已保存工作台',{exact:true})
    await workspaceName.fill('独立产物 A');await page.getByRole('button',{name:'另存',exact:true}).click();await savedSelect.locator('option').nth(1).waitFor({state:'attached'});const savedId=await savedSelect.inputValue()
    await workspaceName.fill('独立产物 B');await page.getByRole('button',{name:'另存',exact:true}).click();await savedSelect.locator('option').nth(2).waitFor({state:'attached'});await savedSelect.selectOption(savedId);await page.waitForFunction(()=>document.querySelector('.tc-workspace-notice').textContent.includes('已恢复'))
    await page.reload();await page.waitForFunction(()=>window.dataWorkspaceDemo?.ready);await savedSelect.locator('option').nth(2).waitFor({state:'attached'});assert.equal(await savedSelect.locator('option').count(),3)
    await page.evaluate(()=>{dataWorkspaceDemo.workspace.dispose();dataWorkspaceDemo.store.dispose()});assert.deepEqual(errors,[])
    writeFileSync(path.join(evidence,'data-workspace.json'),JSON.stringify({passed:true,source:'installed tarball',before:12,range:240,namedRecords:2,persistent:true,errors},null,2)+'\n')
    console.log('Installed tarball generic history and persistent async workspace example PASS')
  } catch(error) {
    await packagePage?.screenshot({path:path.join(evidence,'failure.png'),fullPage:true}).catch(()=>{})
    writeFileSync(path.join(evidence,'failure.json'),JSON.stringify({message:String(error),errors:packageErrors},null,2)+'\n')
    throw error
  } finally {await browser?.close();await server.close()}
} catch (error) {
  console.error(error.stdout?.toString() || '', error.stderr?.toString() || '')
  throw error
} finally { rmSync(dir,{recursive:true,force:true}) }
