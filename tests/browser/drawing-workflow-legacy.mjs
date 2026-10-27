import assert from 'node:assert/strict'
import {mkdirSync,mkdtempSync,readFileSync,rmSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import path from 'node:path'

export function prepareLegacyDrawingReader(){
 const root=fileURLToPath(new URL('../../',import.meta.url)),parent=path.join(root,'test-results');mkdirSync(parent,{recursive:true})
 const directory=mkdtempSync(path.join(parent,'legacy-drawing-014-'))
 try{execFileSync('tar',['-xzf',path.join(root,'tests/fixtures/trading-chest-0.14.0.tgz'),'-C',directory]);assert.equal(JSON.parse(readFileSync(path.join(directory,'package/package.json'),'utf8')).version,'0.14.0')}
 catch(error){rmSync(directory,{recursive:true,force:true});throw error}
 return {entry:'/'+path.relative(root,path.join(directory,'package/dist/entries/chart.js')).split(path.sep).join('/'),dispose:()=>rmSync(directory,{recursive:true,force:true})}
}

export async function checkLegacyDrawingReader(page,browser,prepared,key){
 const controlKey='legacy-control-'+Date.now()
 const before=await page.evaluate(async({key,controlKey})=>{
  const sdk=await import('/src/chart.ts'),result=sdk.loadLayoutV4(key);if(result.status!=='ok')throw Error(result.message)
  const control=structuredClone(result.value)
  for(const drawing of control.drawings)for(const [name,value]of Object.entries(drawing.parameters??{}))if(sdk.isDrawingLevelSet(value))drawing.parameters[name]=value.items.map(item=>item.value)
  const saved=sdk.saveLayoutV4(controlKey,control);if(saved.status!=='ok')throw Error(saved.message)
  return {target:localStorage.getItem('trading-chest-layout-v4-'+key),control:localStorage.getItem('trading-chest-layout-v4-'+controlKey)}
 },{key,controlKey})
 const reader=await browser.newPage()
 try{
  await reader.goto(`${process.env.TC_BROWSER_BASE}/tests/browser/drawing-workflow-legacy.html?entry=${encodeURIComponent(prepared.entry)}`);await reader.waitForFunction(()=>window.legacyReady)
  assert.equal(await reader.evaluate(()=>window.legacyFailure),undefined)
  const result=await reader.evaluate(({key,controlKey,before})=>{
   localStorage.setItem('trading-chest-layout-v4-'+key,before.target);localStorage.setItem('trading-chest-layout-v4-'+controlKey,before.control)
   const original=Storage.prototype.setItem;let writes=0;Storage.prototype.setItem=function(...args){writes++;return original.apply(this,args)}
   try{return {version:legacy.defaultDrawingPreferences().version,control:legacy.loadLayoutV4(controlKey),candidate:legacy.loadLayoutV4(key),after:localStorage.getItem('trading-chest-layout-v4-'+key),writes}}finally{Storage.prototype.setItem=original}
  },{key,controlKey,before})
  assert.equal(result.version,1);assert.equal(result.control.status,'ok');assert.ok(result.control.value.drawings.every(drawing=>Object.values(drawing.parameters??{}).every(value=>!value||typeof value!=='object'||Array.isArray(value))));assert.equal(result.candidate.status,'error');assert.equal(result.candidate.code,'corrupt');assert.equal(result.after,before.target);assert.equal(result.writes,0)
  return {scenario:'actual-014-package-loadLayoutV4-accepts-legacy-control-rejects-level-set-without-overwriting-original',passed:true,legacyPreferencesVersion:result.version,rejectionCode:result.candidate.code}
 }finally{await reader.close();await page.evaluate(async key=>(await import('/src/chart.ts')).deleteLayoutV4(key),controlKey)}
}
