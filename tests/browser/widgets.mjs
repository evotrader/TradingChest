import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
const require = createRequire(process.env.PLAYWRIGHT_PACKAGE_JSON || import.meta.url)
const { chromium } = require('playwright')
const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args:['--no-sandbox']})
try {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('http://127.0.0.1:4173/tests/browser/widgets.html')
  await page.waitForFunction(() => window.ready)
  const result = await page.evaluate(() => {
    const el = document.querySelector('#widget')
    let oldCalls = 0, newCalls = 0
    const props = {viewState:{status:'ready'},points:[{id:'a',x:'a',y:1},{id:'b',x:'b',y:2}],onPointSelect:()=>oldCalls++}
    const mounted = mountWidget('MetricSeries', el, props)
    const root = el.firstElementChild, before = el.querySelector('path').getAttribute('d')
    mounted.update({...props,points:[{id:'a',x:'a',y:4},{id:'b',x:'b',y:2}],onPointSelect:()=>newCalls++})
    el.querySelector('circle').dispatchEvent(new MouseEvent('click',{bubbles:true}))
    const changed = before !== el.querySelector('path').getAttribute('d')
    const sameRoot = root === el.firstElementChild
    mounted.update({...props,points:[{id:'a',x:'a',y:0},{id:'b',x:'b',y:NaN},{id:'c',x:'c',y:2}]})
    const gap = el.querySelector('path').getAttribute('d'), marks = el.querySelectorAll('circle').length
    mounted.dispose(); mounted.dispose(); mounted.update(props)
    return {changed,sameRoot,oldCalls,newCalls,gap,marks,empty:el.childNodes.length === 0}
  })
  assert.equal(result.changed,true); assert.equal(result.sameRoot,true)
  assert.equal(result.oldCalls,0); assert.equal(result.newCalls,1)
  assert.equal(result.marks,2); assert.equal((result.gap.match(/M /g)||[]).length,2)
  assert.equal(result.empty,true); assert.deepEqual(errors,[])
  console.log('PASS: built bundle widget updates, callbacks, missing-data gaps and disposal')
} finally { await browser.close() }
