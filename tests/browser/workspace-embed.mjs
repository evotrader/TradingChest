import assert from 'node:assert/strict'
import {launchBrowser} from './support.mjs'

const browser=await launchBrowser()
try {
  const page=await browser.newPage({viewport:{width:1500,height:1200}}),errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  await page.goto(`${process.env.TC_BROWSER_BASE??'http://127.0.0.1:4173'}/tests/browser/workspace.html`)
  await page.waitForFunction(()=>window.ready)
  await page.evaluate(()=>{document.querySelector('#host').style.height='900px'})
  await page.evaluate(()=>setupWorkspace())
  const original=await page.evaluate(()=>workspace.getCells().map(cell=>({id:cell.cellId,theme:cell.chart.getTheme(),locale:cell.chart.getLocale()})))
  const sizes=[]
  for(const width of [360,768,1440]){
    await page.evaluate(width=>{document.querySelector('#host').style.width=`${width}px`;workspace.resize()},width)
    await page.waitForFunction(width=>document.querySelector('.tc-workspace').clientWidth===width&&workspace.getCells().every(cell=>Math.abs(cell.chart.getChart().getSize().width-cell.chart.getChart().getDom().parentElement.getBoundingClientRect().width)<=1),width)
    const size=await page.evaluate(()=>({root:document.querySelector('.tc-workspace').getBoundingClientRect().width,cells:workspace.getCells().map(cell=>({width:cell.chart.getChart().getSize().width,height:cell.chart.getChart().getSize().height,body:cell.chart.getChart().getDom().parentElement.getBoundingClientRect().width}))}))
    assert.equal(size.root,width)
    assert.ok(size.cells.every(cell=>cell.width>60&&cell.height>100&&Math.abs(cell.width-cell.body)<=1))
    sizes.push({width,...size})
  }
  await page.evaluate(()=>{workspace.setLocale('en-US');workspace.setTheme('light');workspace.resize(640)})
  assert.equal(await page.getByLabel('Chart layout',{exact:true}).count(),1)
  assert.equal(await page.getByLabel('Symbol primary',{exact:true}).count(),1)
  assert.equal(await page.locator('.tc-workspace').evaluate(element=>getComputedStyle(element).height),'640px')
  assert.equal(await page.locator('.tc-workspace').evaluate(element=>getComputedStyle(element).getPropertyValue('--tc-workspace-background').trim()),'#ffffff')
  await page.evaluate(()=>workspace.setTheme('dark'))
  assert.deepEqual(await page.evaluate(()=>workspace.getCells().map(cell=>({id:cell.cellId,theme:cell.chart.getTheme(),locale:cell.chart.getLocale()}))),original)
  const before=await page.locator('.tc-workspace-grid').evaluate(element=>element.getBoundingClientRect().height)
  await page.evaluate(()=>{workspace.resize('100%');document.querySelector('#host').style.height='1000px'})
  await page.waitForFunction(before=>document.querySelector('.tc-workspace-grid').getBoundingClientRect().height>before,before)
  await page.evaluate(async()=>{
    workspace.dispose()
    const {ChartWorkspace,KLineChartPro}=await import('/src/index.ts'),{makeBars}=await import('/tests/browser/syntheticBars.ts')
    window.workspace=new ChartWorkspace({container:document.querySelector('#host'),height:700,locale:'en-US',theme:'light',toolbar:{layout:false,sync:false,storage:false,size:false},context:'hidden-isolated',symbols:[{ticker:'A.X'}],initialSymbol:{ticker:'A.X'},getPeriods:async()=>[{multiplier:1,timespan:'minute',text:'1m'}],mountCell:(host,cell)=>{
      let accept
      const ready=new Promise(resolve=>accept=resolve),bars=makeBars(1000)
      const chart=new KLineChartPro({container:host,symbol:cell.symbol,period:cell.period,onDataReady:()=>accept(chart),datafeed:{searchSymbols:async()=>[],getHistoryKLineData:async(_s,_p,query)=>query.kind==='before'?{bars:bars.filter(bar=>bar.timestamp<query.before),hasMoreBefore:false}:{bars:bars.filter(bar=>bar.timestamp>=query.from&&bar.timestamp<query.to)},subscribe:()=>{},unsubscribe:()=>{}}})
      return {ready,dispose:()=>chart.dispose()}
    }})
    await workspace.setLayout(4)
  })
  await page.waitForFunction(()=>workspace.getCells().length===4&&workspace.getCells().every(cell=>cell.chart))
  assert.equal(await page.locator('.tc-workspace-group:visible').count(),0)
  assert.equal(await page.locator('[data-cell-id]:visible').count(),4)
  await page.getByLabel('Activate pane secondary-2',{exact:true}).click()
  assert.equal(await page.locator('[data-cell-id="secondary-2"]').getAttribute('data-active'),'true')
  await page.evaluate(()=>workspace.dispose())
  assert.deepEqual(errors,[])
  console.log('PASS: workspace embedding',JSON.stringify({widths:sizes,locale:'en-US',numericHeight:640,hiddenToolbarGroups:4,programmaticLayout:4,retainedCellThemeLocale:true}))
} finally {await browser.close()}
