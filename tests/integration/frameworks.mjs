import assert from 'node:assert/strict'
import {writeFileSync,copyFileSync} from 'node:fs'
import path from 'node:path'
import {packedWorkspace,example,command,start,waitHTTP,freePort,evidence} from './support.mjs'
import {launchBrowser} from '../browser/support.mjs'
import {runDrawingComparison} from './drawing-comparison.mjs'
import {runDrawingWorkbenchExample} from './drawing-workbench.mjs'
import {runDrawingAlertsExample} from './drawing-alerts.mjs'
const workspace=await packedWorkspace(),results=[],prepareOnly=process.argv.includes('--prepare-only')
if(prepareOnly)copyFileSync(workspace.tarball,new URL('../../examples/'+path.basename(workspace.tarball),import.meta.url))
const browser=prepareOnly?undefined:await launchBrowser({traceDir:evidence})
try{
 for(const [name,version] of [['datafeed-contract'],['drawing-workbench'],['react-vite','18.3.1'],['react-vite','19.2.3'],['vue-vite'],['next-app']]) {
  console.log('Framework:',name,version||'')
  if(prepareOnly&&version==='18.3.1')continue
  const directory=await example(workspace,name,{react:version,updateLocks:process.argv.includes('--update-locks')})
  if(prepareOnly){results.push({name,version,prepared:true});continue}
  if(name==='datafeed-contract'){
    console.log(await command('npm',['test'],directory));results.push({name,passed:true});continue
  }
  if(name==='drawing-workbench')console.log(await command('npm',['test'],directory))
  await command('npm',['run','build'],directory)
  const port=await freePort(),url=`http://127.0.0.1:${port}`
  const server=await start(directory,name==='next-app'?'start':'dev',['--port',String(port)])
  const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  try{
    await waitHTTP(url,server);await page.goto(url)
    if(name==='next-app')await page.getByRole('link',{name:'打开图表'}).click()
    if(name==='drawing-workbench'){
      console.log(JSON.stringify(await runDrawingWorkbenchExample(page,url,{http:true})))
      await runDrawingComparison(page,url,evidence)
      console.log(JSON.stringify(await runDrawingAlertsExample(page,url)))
    }else if(name==='vue-vite'){
      await page.waitForFunction(()=>window.tcVue?.chart?.getChart()?.getDataList().length===300)
      await page.getByRole('button',{name:'卸载',exact:true}).click()
      await page.waitForFunction(()=>window.tcVue.metrics.created===window.tcVue.metrics.disposed&&window.tcVue.metrics.subscriptions===0)
      await page.getByRole('button',{name:'挂载',exact:true}).click()
      await page.waitForFunction(()=>window.tcVue.chart?.getChart()?.getDataList().length===300)
      await page.getByRole('button',{name:'卸载',exact:true}).click()
    }else{
      const ready=()=>page.waitForFunction(()=>window.tcExample?.workspace.current?.getCells()[0]?.chart?.getChart()?.getDataList().length===300)
      await ready();assert.equal(await page.locator('[data-context="宿主 Context"]').count(),1)
      const created=await page.evaluate(()=>window.tcExample.metrics.created)
      await page.getByRole('button',{name:'切换主题',exact:true}).click()
      await page.getByRole('button',{name:'切换语言',exact:true}).click()
      await page.waitForFunction(()=>document.querySelector('.tc-workspace').dataset.locale==='en-US')
      assert.equal(await page.evaluate(()=>window.tcExample.metrics.created),created)
      await page.getByRole('button',{name:'切换语言',exact:true}).click()
      await page.getByLabel('图表布局',{exact:true}).selectOption('2')
      await page.waitForFunction(()=>window.tcExample.workspace.current?.getCells().length===2&&window.tcExample.workspace.current.getCells().every(c=>c.chart?.getChart()?.getDataList().length===300))
      assert.equal(await page.locator('[data-context="宿主 Context"]').count(),2)
      await page.getByLabel('周期 secondary-1',{exact:true}).selectOption({label:'1h'})
      await page.getByLabel('工作台名称',{exact:true}).fill('React package')
      await page.getByRole('button',{name:'另存',exact:true}).click()
      await page.waitForFunction(()=>document.querySelector('.tc-workspace-notice').textContent.includes('已保存'))
      await page.getByLabel('图表布局',{exact:true}).selectOption('1')
      await page.getByRole('button',{name:'加载工作台',exact:true}).click()
      await page.waitForFunction(()=>document.querySelector('.tc-workspace-notice').textContent.includes('已恢复'))
      await page.getByRole('button',{name:'卸载',exact:true}).click()
      await page.waitForFunction(()=>window.tcExample.metrics.created===window.tcExample.metrics.disposed&&window.tcExample.metrics.subscriptions===0)
      await page.getByRole('button',{name:'切换单图／工作台',exact:true}).click()
      await page.getByRole('button',{name:'挂载',exact:true}).click()
      await page.waitForFunction(()=>window.tcExample.chart.current?.getChart()?.getDataList().length===300)
      await page.getByRole('button',{name:'模拟读取失败',exact:true}).click();await page.locator('.klinecharts-pro-data-error').waitFor()
      await page.getByRole('button',{name:'重试行情',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.klinecharts-pro-data-error'))
      if(name==='next-app'){
        await page.getByRole('link',{name:'离开图表'}).click();await page.waitForFunction(()=>window.tcExample.metrics.created===window.tcExample.metrics.disposed)
        await page.getByRole('link',{name:'重新进入'}).click();await ready()
      }
      await page.getByRole('button',{name:'卸载',exact:true}).click();await page.waitForFunction(()=>window.tcExample.metrics.created===window.tcExample.metrics.disposed)
    }
    assert.deepEqual(errors,[]);await page.screenshot({path:path.join(evidence,`${name}-${version||'default'}.png`)})
    results.push({name,version,passed:true,source:'installed tarball',errors})
  }finally{await page.context().tracing.stop({path:path.join(evidence,`${name}-${version||'default'}-trace.zip`)});await page.close();await server.stop()}
 }
 writeFileSync(path.join(evidence,prepareOnly?'prepared.json':'frameworks.json'),JSON.stringify({directory:workspace.directory,results},null,2)+'\n')
}finally{await browser?.close()}
console.log(prepareOnly?'Independent example locks and local tarball prepared':'All framework package consumers PASS')
