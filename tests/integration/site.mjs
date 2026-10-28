import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {existsSync,cpSync,mkdirSync,writeFileSync,readFileSync,statSync} from 'node:fs'
import path from 'node:path'
import {packedWorkspace,example,command,root,evidence} from './support.mjs'
import {launchBrowser} from '../browser/support.mjs'
import {runDrawingComparison} from './drawing-comparison.mjs'
import {runDrawingWorkbenchExample} from './drawing-workbench.mjs'
import {runDrawingAlertsExample} from './drawing-alerts.mjs'
const website=path.join(root,'website'),base='/TradingChest/'
if(process.argv.includes('--build')){
 await command('npm',['run','docs:build'],root)
 const workspace=await packedWorkspace('tc09-site-')
 for(const name of ['react-vite','vue-vite','drawing-workbench']){
  const directory=await example(workspace,name)
  await command('npm',['run','build','--','--base',base+'demos/'+name+'/'],directory)
  cpSync(path.join(directory,'dist'),path.join(website,'demos',name),{recursive:true})
 }
 const directory=path.join(workspace.directory,'analysis-sdk');mkdirSync(directory,{recursive:true})
 cpSync(path.join(root,'examples/analysis-sdk'),directory,{recursive:true})
 writeFileSync(path.join(directory,'package.json'),JSON.stringify({private:true,type:'module',dependencies:{'trading-chest':'file:../'+path.basename(workspace.tarball),klinecharts:'10.1.0'},devDependencies:{vite:'5.4.21'}}))
 writeFileSync(path.join(directory,'vite.config.js'),`import path from 'node:path';export default {base:'${base}demos/analysis-sdk/',build:{target:'es2022',rollupOptions:{input:{index:path.resolve('index.html'),workspace:path.resolve('data-workspace.html')}}}}`)
 await command('npm',['install','--ignore-scripts','--no-audit','--no-fund'],directory)
 await command('npm',['exec','vite','--','build'],directory)
 cpSync(path.join(directory,'dist'),path.join(website,'demos/analysis-sdk'),{recursive:true})
 const nextDirectory=await example(workspace,'next-app')
 await command('tar',['-czf',path.join(website,'demos/next-app-source.tar.gz'),'--exclude=node_modules','--exclude=.next','-C',workspace.directory,path.basename(nextDirectory),path.basename(workspace.tarball)],workspace.directory)
 writeFileSync(path.join(website,'demos/index.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>TradingChest 演示</title><h1>TradingChest 独立演示</h1><p>全部使用隔离合成输入，不连接生产服务。</p><ul>${[['drawing-workbench/','绘图工作台'],['analysis-sdk/','JS 分析图层'],['analysis-sdk/data-workspace.html','JS 数据与工作台'],['react-vite/','React 单图与工作台'],['vue-vite/','Vue 图表']].map(([href,label])=>`<li><a href="${base}demos/${href}">${label}</a></li>`).join('')}</ul><p>Next App Router 需要 Node 服务：<a download="next-app-source.tar.gz" href="${base}demos/next-app-source.tar.gz">下载 Next.js 源码包</a>。解包后进入 next-app，npm ci、npm run build、npm start；旁边的同版 tarball 已配好，README 包含运行说明。</p><a href="${base}">中文文档</a> · <a href="${base}en-US/">English</a></html>`)
 console.log('Complete Pages artifact:',website)
}
if(process.argv.includes('--test')){
 assert.ok(existsSync(path.join(website,'demos/index.html')),'Run npm run docs:site first')
 const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.json':'application/json'}
 const server=createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');if(!url.pathname.startsWith(base)){res.writeHead(404);res.end();return}
  let file=path.resolve(website,decodeURIComponent(url.pathname.slice(base.length)))
  if(!file.startsWith(website+path.sep)&&file!==website){res.writeHead(404);res.end();return}
  if(existsSync(file)&&statSync(file).isDirectory())file=path.join(file,'index.html')
  else if(!existsSync(file)&&existsSync(file+'.html'))file+='.html'
  if(!existsSync(file)){res.writeHead(404);res.end();return}
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(readFileSync(file))
 })
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`
 const browser=await launchBrowser({traceDir:evidence}),page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[],bad=[],api=[]
 page.on('pageerror',error=>errors.push(error.message));page.on('response',r=>{if(r.status()>=400)bad.push({url:r.url(),status:r.status()})});page.on('request',r=>{if(r.url().includes('/api/'))api.push(r.url())})
 try{
  await page.goto(origin+base);await page.getByRole('link',{name:'接入指南',exact:true}).click();await page.getByRole('link',{name:'React / Next / Vue',exact:true}).click();await page.getByRole('heading',{name:/^React \/ Next.js \/ Vue 接入/}).waitFor()
  await page.getByRole('link',{name:'升级到 0.12.0',exact:true}).click();await page.getByRole('heading',{name:/^升级到 0\.12\.0\b/,level:1}).waitFor();await page.getByRole('link',{name:'公式与完整参数',exact:true}).click();await page.getByRole('heading',{name:/^0\.12 属性与量价精修/,level:2}).waitFor()
  await page.goto(origin+base+'en-US/frameworks.html');await page.getByRole('link',{name:'API',exact:true}).click();await page.getByRole('heading',{name:/^API/}).waitFor()
  await page.getByRole('link',{name:'Upgrade to 0.12.0',exact:true}).click();await page.getByRole('heading',{name:/^Upgrade to 0\.12\.0\b/,level:1}).waitFor();await page.getByRole('link',{name:'formulas and parameters',exact:true}).click();await page.getByRole('heading',{name:/^0\.12 styling and volume refinement/,level:2}).waitFor()
  await page.getByRole('link',{name:'0.16 level alerts candidate',exact:true}).click();await page.getByRole('heading',{name:/^0\.16\.0 level alerts/,level:1}).waitFor()
  await page.goto(origin+base+'frameworks.html');await page.getByRole('link',{name:'0.16 单级提醒候选',exact:true}).click();await page.getByRole('heading',{name:/^0\.16\.0 单级提醒升级/,level:1}).waitFor()
  await page.goto(origin+base+'demos/');const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('link',{name:'下载 Next.js 源码包',exact:true}).click()]);assert.equal(download.suggestedFilename(),'next-app-source.tar.gz');assert.equal(await download.failure(),null);await page.getByRole('link',{name:'JS 分析图层',exact:true}).click();await page.waitForFunction(()=>window.analysisDemo?.ready)
  await page.getByRole('button',{name:'添加两个指标实例',exact:true}).click();await page.getByRole('status').filter({hasText:'已添加两个独立实例'}).waitFor()
  await page.goto(origin+base+'demos/');await page.getByRole('link',{name:'JS 数据与工作台',exact:true}).click();await page.waitForFunction(()=>window.dataWorkspaceDemo?.ready)
  await page.getByRole('button',{name:'读取完整合成会话（range）',exact:true}).click();await page.getByRole('status').filter({hasText:'range 返回完整区间 240 根'}).waitFor()
  await page.goto(origin+base+'demos/');await page.getByRole('link',{name:'React 单图与工作台',exact:true}).click();await page.waitForFunction(()=>window.tcExample?.workspace.current?.getCells()[0]?.chart?.getChart()?.getDataList().length===300)
  await page.getByRole('button',{name:'卸载',exact:true}).click();await page.waitForFunction(()=>window.tcExample.metrics.created===window.tcExample.metrics.disposed)
  await page.goto(origin+base+'demos/');await page.getByRole('link',{name:'绘图工作台',exact:true}).click();await runDrawingWorkbenchExample(page,page.url());await runDrawingComparison(page,page.url(),evidence)
  await runDrawingAlertsExample(page,origin+base+'demos/drawing-workbench')
  await page.goto(origin+base+'demos/');await page.getByRole('link',{name:'Vue 图表',exact:true}).click();await page.waitForFunction(()=>window.tcVue?.chart?.getChart()?.getDataList().length===300)
  await page.getByRole('button',{name:'卸载',exact:true}).click();await page.waitForFunction(()=>window.tcVue.metrics.created===window.tcVue.metrics.disposed)
  assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);assert.deepEqual(api,[])
  await page.screenshot({path:path.join(evidence,'site.png')});writeFileSync(path.join(evidence,'site.json'),JSON.stringify({passed:true,artifact:website,base,errors,bad,api},null,2)+'\n')
  console.log('Project-path bilingual docs and all static demos PASS')
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
}
