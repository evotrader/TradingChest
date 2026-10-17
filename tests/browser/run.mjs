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
    vite=await createViteServer({root,server:{host:'127.0.0.1',port,strictPort:true}})
    try {await vite.listen();break} catch(error) {await vite.close();vite=undefined;if(error.code!=='EADDRINUSE'||attempt===9)throw error}
  }
  const base=`http://127.0.0.1:${vite.httpServer.address().port}`
  const response=await fetch(`${base}/tests/browser/lifecycle.html`)
  if(!response.ok)throw Error(`Vite is not ready: ${response.status}`)
  const tasks=process.argv.includes('--performance')
    ? [['performance-single',[]],['performance-comparison',['--compare']],['performance-workspace',['--workspace']],['performance-analysis',['--analysis']]].map(([name,args])=>({name,script:'performance',args}))
    : (process.argv.includes('--audit-analysis')?['analysis-transactions']:['history-state','history-reload-audit','cross-upgrades','store-contract','workspace-store','lifecycle','widgets','upgrade-contracts','workspace','drawing-history','comparison','upgrade-audit','analysis','analysis-locale','workspace-embed','analysis-transactions']).map(script=>({name:script,script,args:[]}))
  for(const {name,script,args} of tasks) {
    const directory=path.join(evidence,name);mkdirSync(directory,{recursive:true})
    const started=Date.now(), chunks=[]
    const exitCode=await new Promise((resolve,reject)=>{
      child=spawn(process.execPath,[path.join(root,`tests/browser/${script}.mjs`),path.join(directory,'evidence.json'),...args],{cwd:root,env:{...process.env,TC_BROWSER_BASE:base,TC_BROWSER_EVIDENCE:directory,TC_BROWSER_TRACE_DIR:script==='performance'?'':directory},stdio:['ignore','pipe','pipe']})
      for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{chunks.push(data.toString());process.stdout.write(data)})
      child.once('error',reject);child.once('exit',(code,signal)=>resolve(code??(signal?1:0)))
    })
    child=undefined
    writeFileSync(path.join(directory,'output.log'),chunks.join(''))
    results.push({script:name,exitCode,elapsedMs:Date.now()-started})
    writeFileSync(path.join(evidence,'results.json'),JSON.stringify({base,results},null,2)+'\n')
    if(exitCode!==0)throw Error(`Browser acceptance failed: ${script}（${exitCode}）`)
  }
} finally {await stop()}
