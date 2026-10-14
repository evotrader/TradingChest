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
  assert.deepEqual(errors, [])
  console.log('PASS: actual Chromium + KLineCharts: late history, replay/live isolation, idempotent disposal without reload')
} finally { await browser.close() }
