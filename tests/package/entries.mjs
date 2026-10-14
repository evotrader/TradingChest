import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSync } from 'esbuild'
import { JSDOM } from 'jsdom'
const root = fileURLToPath(new URL('../../', import.meta.url))
const dir = mkdtempSync(path.join(tmpdir(), 'trading-chest-pack-'))
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const run = (command, args, cwd = dir) => execFileSync(command, args, {cwd, stdio:'pipe', encoding:'utf8', env:{...process.env,npm_config_cache:process.env.npm_config_cache ?? path.join(tmpdir(),'trading-chest-pack-cache')}})
try {
  const packed = JSON.parse(run(npm, ['pack','--json','--pack-destination',dir], root))[0]
  writeFileSync(path.join(dir,'package.json'), JSON.stringify({private:true,type:'module'}))
  run(npm, ['install','--ignore-scripts','--no-audit','--no-fund',path.join(dir,packed.filename),'jsdom@30.0.1'])
  assert.equal(existsSync(path.join(dir,'node_modules/react')), false, 'chart-only install pulled React')
  // Browser components use a browser bundler. KLineCharts 9.8.12's raw Node
  // CJS shim requires a .js UMD file under type:module and exports no engine API.
  const browserFixture = (name, source) => {
    const entry = path.join(dir, name);
    writeFileSync(entry, source);
    const code = buildSync({entryPoints:[entry],bundle:true,write:false,format:'iife',platform:'browser',
      mainFields:['browser','module','main'],conditions:['browser']}).outputFiles[0].text;
    const dom = new JSDOM('<div id="host"></div>', {url:'http://localhost',runScripts:'outside-only'});
    try { dom.window.eval(code); } finally { dom.window.close(); }
  };
  browserFixture('chart-browser.mjs', `
import {KLineChartPro} from 'trading-chest/chart';
import {createSignal,createComponent} from 'solid-js';
import {render} from 'solid-js/web';
import {MetricSeries} from 'trading-chest/solid';
if(typeof KLineChartPro!=='function') throw Error('missing ESM chart');
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
`);
  console.log('Packed ESM/CJS browser consumers without React and shared Solid runtime PASS');
  writeFileSync(path.join(dir,'consumer.ts'), `import { KLineChartPro, type DatafeedRequestContext } from 'trading-chest/chart';\nimport { MetricSeries } from 'trading-chest/solid';\nvoid KLineChartPro; void MetricSeries; let context: DatafeedRequestContext | undefined; void context;\n`)
  run(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'consumer.ts','--noEmit','--module','NodeNext','--moduleResolution','NodeNext','--target','es2022'])
  writeFileSync(path.join(dir,'react.mjs'), `
import assert from 'node:assert/strict';
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
import {KLineChartPro,mountAnalyticalWidget} from 'trading-chest';
if(typeof KLineChartPro!=='function'||typeof mountAnalyticalWidget!=='function') throw Error('legacy ESM exports missing');
`);
  browserFixture('legacy-browser.cjs', `
const root=require('trading-chest');
if(typeof root.KLineChartPro!=='function'||typeof root.mountAnalyticalWidget!=='function') throw Error('root CommonJS exports missing');
`);
  writeFileSync(path.join(dir,'legacy.mjs'), `
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const dom=new JSDOM('<div></div>',{url:'http://localhost',runScripts:'outside-only'});
dom.window.eval(readFileSync(require.resolve('klinecharts/dist/umd/klinecharts.js'),'utf8'));
dom.window.React=(await import('react')).default;
dom.window.eval(readFileSync(require.resolve('trading-chest/dist/trading-chest.umd.js'),'utf8'));
assert.equal(typeof dom.window.tradingchest.KLineChartPro,'function');
assert.ok(require.resolve('trading-chest/dist/trading-chest.css'));
dom.window.close();
console.log('Legacy browser UMD and CSS paths PASS');
`);
  console.log(run(process.execPath,['legacy.mjs']));
  for (const asset of ['trading-chest.js','trading-chest.umd.js','trading-chest.css','index.d.ts']) {
    assert.ok(existsSync(path.join(dir,'node_modules/trading-chest/dist',asset)), 'missing legacy '+asset)
  }
  console.log('Packed subentries, declarations and legacy assets PASS')
} catch (error) {
  console.error(error.stdout?.toString() || '', error.stderr?.toString() || '')
  throw error
} finally { rmSync(dir,{recursive:true,force:true}) }
