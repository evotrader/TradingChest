import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
const require = createRequire(process.env.PLAYWRIGHT_PACKAGE_JSON || import.meta.url)
const { chromium } = require('playwright')
const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox']})
try {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  const open = async () => { await page.goto('http://127.0.0.1:4173/tests/browser/lifecycle.html'); await page.waitForFunction(() => window.ready) }
  await open()
  await page.evaluate(() => { setup(true); test.chart.dispose(); test.resolveHistory() })
  await page.waitForTimeout(100)
  assert.equal(await page.evaluate(() => test.state.subscriptions), 0, 'late history resubscribed after disposal')
  await open(); await page.evaluate(() => setup())
  await page.waitForFunction(() => test.state.subscriptions === 1)
  const replay = await page.evaluate(() => {
    test.chart.startReplay(5)
    test.state.tick({...test.bars.at(-1), timestamp: 1900000000000})
    const timestamps = test.chart.getChart().getDataList().map(b => b.timestamp)
    const before = test.state.histories
    test.chart.dispose(); test.chart.dispose()
    return {timestamps, before, after: test.state.histories, disposals: test.state.feedDisposals}
  })
  assert.equal(replay.timestamps.length, 5)
  assert.ok(!replay.timestamps.includes(1900000000000))
  assert.equal(replay.after, replay.before, 'dispose initiated history reload')
  assert.equal(replay.disposals, 1)
  await open(); await page.evaluate(() => setup())
  await page.waitForFunction(() => test.state.subscriptions === 1)
  const alertIsolation = await page.evaluate(() => {
    test.chart.addAlert({id:'replay-only',price:12,condition:'above'})
    test.chart.startReplay(2)
    test.chart.feedPrice(999)
    test.chart.getReplayEngine().stepForward()
    test.chart.getReplayEngine().stepBackward()
    const afterSeek = test.state.replayAlerts.length
    test.chart.getReplayEngine().stepForward()
    const result = {live:test.state.alerts.length, replay:test.state.replayAlerts.length, afterSeek,
      timestamp:test.state.replayAlerts[0]?.timestamp, expected:test.bars[2].timestamp,
      liveTriggered:test.chart.getAlerts()[0].triggered}
    test.chart.dispose()
    return result
  })
  assert.equal(alertIsolation.live,0); assert.equal(alertIsolation.replay,2)
  assert.equal(alertIsolation.afterSeek,1); assert.equal(alertIsolation.liveTriggered,false)
  assert.equal(alertIsolation.timestamp,alertIsolation.expected)
  await open(); await page.evaluate(() => setup())
  await page.waitForFunction(() => test.state.subscriptions === 1)
  const widget = page.locator('.klinecharts-pro-widget')
  const box = await widget.boundingBox()
  assert.ok(box && box.width > 300 && box.height > 200, `invalid widget geometry: ${JSON.stringify(box)}`)
  for (let i = 0; i < 3; i++) {
    await widget.dispatchEvent('keydown', {key:'r', altKey:true, bubbles:true})
    await page.mouse.click(box.x + 100 + i * 40, box.y + 80 + i * 20)
    await page.mouse.click(box.x + 160 + i * 40, box.y + 140 + i * 20)
    try {
      await page.waitForFunction(n => test.state.created.length === n, i + 1)
    } catch (error) {
      console.error('Drawing diagnostic', await page.evaluate(() => ({
        created:test.state.created, histories:test.state.histories,
        widget:document.querySelector('.klinecharts-pro-widget').getBoundingClientRect().toJSON(),
        overlays:test.state.overlayIds.map(id => {
          const o = test.chart.getChart().getOverlayById(id)
          return {id,name:o?.name,step:o?.currentStep,points:o?.points}
        }),
      })))
      throw error
    }
  }
  await page.evaluate(() => {
    test.chart.addAlert({id:'system',price:20,condition:'above'})
    test.chart.getChart().createOverlay({name:'horizontalStraightLine',id:'system-order',points:[{value:22}],lock:true})
  })
  await widget.dispatchEvent('keydown', {key:'Escape',bubbles:true})
  assert.equal(await page.evaluate(() => test.state.created.filter(id => test.chart.getChart().getOverlayById(id)).length), 3)
  await page.evaluate(() => {
    const overlay = test.chart.getChart().getOverlayById(test.state.created[1])
    overlay.onSelected({overlay})
    const input = document.createElement('input')
    document.querySelector('.klinecharts-pro-widget').appendChild(input)
    input.dispatchEvent(new KeyboardEvent('keydown', {key:'Delete',bubbles:true}))
    input.remove()
  })
  assert.equal(await page.evaluate(() => test.state.deleted.length), 0)
  await widget.dispatchEvent('keydown', {key:'Delete',bubbles:true})
  const remaining = await page.evaluate(() => ({
    count:test.state.created.filter(id => test.chart.getChart().getOverlayById(id)).length,
    alerts:!!test.chart.getChart().getOverlayById('alert_system'),
    order:!!test.chart.getChart().getOverlayById('system-order'),
    deleted:test.state.deleted.length,
  }))
  assert.deepEqual(remaining, {count:2, alerts:true, order:true, deleted:1})
  await page.evaluate(() => test.chart.dispose())
  assert.deepEqual(errors, [])
  console.log('PASS: actual Chromium + KLineCharts: late history, replay/live isolation, idempotent disposal without reload')
} finally { await browser.close() }
