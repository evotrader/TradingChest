import {createServer as createViteServer} from 'vite'
import {createServer} from 'node:net'
import {spawn} from 'node:child_process'
import {mkdirSync,writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../../',import.meta.url))
const evidence = path.resolve(process.env.TC_BROWSER_EVIDENCE || path.join(root,'test-results/browser'))
mkdirSync(evidence,{recursive:true})
const freePort = () => new Promise((resolve,reject) => {
  const server=createServer()
  server.on('error',reject)
  server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(error=>error?reject(error):resolve(port))})
})
let vite, child
const stop = async () => {if(child&&!child.killed)child.kill('SIGTERM');await vite?.close()}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{void stop().finally(()=>process.exit(signal==='SIGINT'?130:143))})
const results=[]
try {
  for(let attempt=0;attempt<10;attempt++) {
    const port=await freePort()
    vite=await createViteServer({root,optimizeDeps:{entries:['tests/browser/**/*.html']},server:{host:'127.0.0.1',port,strictPort:true}})
    try {await vite.listen();break} catch(error) {await vite.close();vite=undefined;if(error.code!=='EADDRINUSE'||attempt===9)throw error}
  }
  const base=`http://127.0.0.1:${vite.httpServer.address().port}`
  const response=await fetch(`${base}/tests/browser/lifecycle.html`)
  if(!response.ok)throw Error(`Vite is not ready: ${response.status}`)
  const tasks=process.argv.includes('--performance')
    ? [['performance-react',['--react']],['performance-single',[]],['performance-comparison',['--compare']],['performance-workspace',['--workspace']],['performance-analysis',['--analysis']]].map(([name,args])=>({name,script:args.includes('--react')?'react':'performance',args:args.includes('--react')?['--performance']:args})).concat([{name:'performance-drawing',script:'drawing-performance',args:[]},{name:'performance-drawing-cleanup',script:'drawing-cleanup',args:[]}])
    : (process.argv.includes('--drawing-touch-only')?['drawing-touch']:process.argv.includes('--drawing-reopen-only')?['drawing-reopen']:process.argv.includes('--drawing-input-audit-only')?['drawing-input-audit']:process.argv.includes('--drawing-tools-only')?['drawing-tools']:process.argv.includes('--drawing-input-only')?['drawing-input']:process.argv.includes('--drawing-sharing-only')?['drawing-sharing','drawing-sharing-cleanup']:process.argv.includes('--drawing-workbench-only')?['drawing-workbench']:process.argv.includes('--react-only')?['react']:process.argv.includes('--audit-analysis')?['analysis-transactions']:['drawing-range','drawing-preview-ownership','drawing-shared-input','history-routing','drawing-touch','drawing-reopen','drawing-tools','drawing-input-audit','drawing-input','drawing-sharing','drawing-sharing-cleanup','drawing-workbench','history-state','history-reload-audit','cross-upgrades','runtime-drawings','store-contract','workspace-store','lifecycle','widgets','upgrade-contracts','workspace','drawing-history','comparison','upgrade-audit','analysis','analysis-locale','workspace-embed','analysis-transactions','react']).map(script=>({name:script,script,args:[]}))
  const scriptsArg=process.argv.find(arg=>arg.startsWith('--scripts='))
  if(scriptsArg){const selected=scriptsArg.slice('--scripts='.length).split(',').map(script=>tasks.find(task=>task.name===script)??({name:script,script,args:[]}));tasks.splice(0,tasks.length,...selected)}
  const crossTasks=[...['drawing-range','drawing-preview-ownership','drawing-shared-input','drawing-tools','drawing-input-audit','drawing-input','drawing-workbench','drawing-reopen','drawing-sharing','drawing-sharing-cleanup','drawing-touch'].map(script=>({name:'webkit-'+script,script,args:[],engine:'webkit'})),...['drawing-range','drawing-tools','drawing-reopen','drawing-workbench'].map(script=>({name:'firefox-'+script,script,args:[],engine:'firefox'}))]
  if(process.argv.includes('--drawing-cross-browser'))tasks.splice(0,tasks.length,...crossTasks)
  else if(!scriptsArg&&!process.argv.includes('--performance')&&!process.argv.some(arg=>arg.endsWith('-only')||arg==='--audit-analysis'))tasks.push(...crossTasks)
  for(const {name,script,args,engine} of tasks) {
    const directory=path.join(evidence,name);mkdirSync(directory,{recursive:true})
    const started=Date.now(), chunks=[]
    const exitCode=await new Promise((resolve,reject)=>{
      child=spawn(process.execPath,[path.join(root,`tests/browser/${script}.mjs`),path.join(directory,'evidence.json'),...args],{cwd:root,env:{...process.env,TC_BROWSER_ENGINE:engine??process.env.TC_BROWSER_ENGINE??'chromium',TC_BROWSER_BASE:base,TC_BROWSER_EVIDENCE:directory,TC_BROWSER_TRACE_DIR:name.startsWith('performance')?'':directory},stdio:['ignore','pipe','pipe']})
      for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{chunks.push(data.toString());process.stdout.write(data)})
      child.once('error',reject);child.once('exit',(code,signal)=>resolve(code??(signal?1:0)))
    })
    child=undefined
    writeFileSync(path.join(directory,'output.log'),chunks.join(''))
    results.push({script:name,exitCode,elapsedMs:Date.now()-started})
    writeFileSync(path.join(evidence,'results.json'),JSON.stringify({base,results},null,2)+'\n')
    if(exitCode!==0&&!process.argv.includes('--performance'))throw Error(`Browser acceptance failed: ${script}（${exitCode}）`)
  }
  if(results.some(result=>result.exitCode!==0))throw Error('Browser acceptance failed: '+results.filter(result=>result.exitCode!==0).map(result=>result.script).join(', '))
} finally {await stop()}
