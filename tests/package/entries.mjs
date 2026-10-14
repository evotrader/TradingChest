import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../../', import.meta.url))
const dir = mkdtempSync(path.join(tmpdir(), 'trading-chest-pack-'))
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const run = (command, args, cwd = dir) => execFileSync(command, args, {cwd, stdio:'pipe', encoding:'utf8', env:{...process.env,npm_config_cache:process.env.npm_config_cache ?? path.join(tmpdir(),'trading-chest-pack-cache')}})
try {
  const packed = JSON.parse(run(npm, ['pack','--json','--pack-destination',dir], root))[0]
  writeFileSync(path.join(dir,'package.json'), JSON.stringify({private:true,type:'module'}))
  run(npm, ['install','--ignore-scripts','--no-audit','--no-fund',path.join(dir,packed.filename),'jsdom@30.0.1'])
  assert.equal(existsSync(path.join(dir,'node_modules/react')), false, 'chart-only install pulled React')
  writeFileSync(path.join(dir,'chart.mjs'), `
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const dom = new JSDOM('<div id="host"></div>', {url:'http://localhost'});
for (const key of ['window','document','HTMLElement','Element','Node','MutationObserver']) globalThis[key] = dom.window[key];
const chart = await import('trading-chest/chart');
const {createRequire} = await import('node:module');
const require = createRequire(import.meta.url);
assert.equal(typeof require('trading-chest/chart').KLineChartPro, 'function');
assert.ok(require.resolve('trading-chest/dist/trading-chest.css'));
assert.equal(typeof chart.KLineChartPro, 'function');
const {createSignal, createComponent} = await import('solid-js');
const {render} = await import('solid-js/web');
const {MetricSeries} = await import('trading-chest/solid');
const host = document.getElementById('host');
const [state, setState] = createSignal({status:'loading'});
const dispose = render(() => createComponent(MetricSeries, {get state(){return state()}, points:[]}), host);
const before = host.textContent;
setState({status:'error',message:'host-runtime-updated'});
assert.notEqual(host.textContent, before, 'Solid host signals did not update packed widget');
dispose();
assert.equal(host.childNodes.length, 0);
console.log('chart-without-React and shared-Solid-runtime PASS');
`)
  console.log(run(process.execPath,['--conditions=browser','chart.mjs']))
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
  writeFileSync(path.join(dir,'legacy.mjs'), `
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const dom = new JSDOM('<div></div>', {url:'http://localhost',runScripts:'outside-only'});
for (const key of ['window','document','HTMLElement','Element','Node','MutationObserver']) globalThis[key] = dom.window[key];
window.klinecharts = await import('klinecharts');
window.React = (await import('react')).default;
window.eval(readFileSync(require.resolve('trading-chest/dist/trading-chest.umd.js'),'utf8'));
assert.equal(typeof window.tradingchest.KLineChartPro, 'function');
assert.equal(typeof (await import('trading-chest')).mountAnalyticalWidget, 'function');
assert.equal(typeof require('trading-chest').KLineChartPro, 'function');
console.log('Legacy ESM/UMD and root CJS PASS');
`)
  console.log(run(process.execPath,['--conditions=browser','legacy.mjs']))
  for (const asset of ['trading-chest.js','trading-chest.umd.js','trading-chest.css','index.d.ts']) {
    assert.ok(existsSync(path.join(dir,'node_modules/trading-chest/dist',asset)), 'missing legacy '+asset)
  }
  console.log('Packed subentries, declarations and legacy assets PASS')
} catch (error) {
  console.error(error.stdout?.toString() || '', error.stderr?.toString() || '')
  throw error
} finally { rmSync(dir,{recursive:true,force:true}) }
