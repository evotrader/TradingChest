import {chromium} from '@playwright/test'
import {mkdirSync} from 'node:fs'
import path from 'node:path'

/** Every script resolves Playwright from this package and retains browser traces. */
export async function launchBrowser(options={}) {
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH,chromiumSandbox:true})
  const newPage = browser.newPage.bind(browser), close = browser.close.bind(browser), contexts = []
  const traceDir = options.traceDir ?? process.env.TC_BROWSER_TRACE_DIR
  if (traceDir) {
    mkdirSync(traceDir,{recursive:true})
    browser.newPage = async options => {
      const page = await newPage(options), context = page.context()
      await context.tracing.start({screenshots:true,snapshots:true,sources:true})
      contexts.push(context)
      return page
    }
  }
  browser.close = async () => {
    try {
      for (const [index, context] of contexts.entries()) {
        await context.tracing.stop({path:path.join(traceDir,`trace-${index}.zip`)})
      }
    } finally {await close()}
  }
  return browser
}
