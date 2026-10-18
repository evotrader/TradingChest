import {spawn} from 'node:child_process'
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,cpSync,copyFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
export const root=fileURLToPath(new URL('../../',import.meta.url))
export const evidence=path.resolve(process.env.TC_INTEGRATION_EVIDENCE||path.join(root,'test-results/integration'))
mkdirSync(evidence,{recursive:true})
let commandId=0
export async function command(program,args,cwd,env={}) {
  const label=`${++commandId}-${path.basename(cwd)}-${path.basename(program)}`,chunks=[]
  const child=spawn(program,args,{cwd,env:{...process.env,npm_config_registry:'https://registry.npmjs.org',...env},stdio:['ignore','pipe','pipe']})
  for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>chunks.push(chunk))
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)})
  const output=Buffer.concat(chunks).toString();writeFileSync(path.join(evidence,label+'.log'),output)
  if(code!==0){console.error(output);throw Error(`${program} ${args.join(' ')} failed (${code}); ${label}.log`)}
  return output
}
export async function packedWorkspace(prefix='tc09-integration-') {
  const directory=mkdtempSync(path.join(tmpdir(),prefix))
  const packed=JSON.parse(await command('npm',['pack','--json','--pack-destination',directory],root))[0]
  return {directory,tarball:path.join(directory,packed.filename),packed}
}
export async function example(workspace,name,{react,updateLocks=false}={}) {
  const directory=path.join(workspace.directory,name+(react?'-'+react:''))
  cpSync(path.join(root,'examples',name),directory,{recursive:true,filter:source=>!['node_modules','dist','.next'].includes(path.basename(source))})
  const manifest=path.join(directory,'package.json'),pkg=JSON.parse(readFileSync(manifest,'utf8'))
  pkg.dependencies['trading-chest']='file:../'+path.basename(workspace.tarball)
  if(react){pkg.dependencies.react=react;pkg.dependencies['react-dom']=react}
  writeFileSync(manifest,JSON.stringify(pkg,null,2)+'\n')
  // Refresh only the local candidate's integrity; retain the committed remote dependency lock.
  const lockPath=path.join(directory,'package-lock.json')
  try{const lock=JSON.parse(readFileSync(lockPath,'utf8'));delete lock.packages['node_modules/trading-chest'];writeFileSync(lockPath,JSON.stringify(lock,null,2)+'\n')}catch(error){if(error.code!=='ENOENT')throw error}
  await command('npm',['install','--package-lock-only','--ignore-scripts','--no-audit','--no-fund'],directory)
  if(updateLocks&&(!react||react==='19.2.3'))copyFileSync(lockPath,path.join(root,'examples',name,'package-lock.json'))
  await command('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],directory)
  return directory
}
export async function start(directory,script,args=[]) {
  const child=spawn('npm',['run',script,'--',...args],{cwd:directory,detached:true,stdio:['ignore','pipe','pipe'],env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'}})
  const chunks=[];for(const stream of [child.stdout,child.stderr])stream.on('data',c=>chunks.push(c))
  return {child,async stop(){if(child.exitCode===null){try{process.kill(-child.pid,'SIGTERM')}catch(error){if(error.code!=='ESRCH')throw error}await new Promise(resolve=>{child.once('exit',resolve);setTimeout(resolve,3000).unref()})}writeFileSync(path.join(evidence,`${path.basename(directory)}-server.log`),Buffer.concat(chunks))}}
}
export async function waitHTTP(url,server) {
  const deadline=Date.now()+30000
  while(Date.now()<deadline){try{const response=await fetch(url);if(response.ok)return}catch{}if(server.child.exitCode!==null)throw Error('Server exited before ready');await new Promise(resolve=>setTimeout(resolve,100))}
  throw Error('Server did not become ready: '+url)
}
export function freePort() {return import('node:net').then(({createServer})=>new Promise((resolve,reject)=>{const server=createServer();server.on('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(error=>error?reject(error):resolve(port))})}))}
