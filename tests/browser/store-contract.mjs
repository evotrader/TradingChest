import {launchBrowser} from './support.mjs'
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'

const browser=await launchBrowser(),context=await browser.newContext(),page=await context.newPage(),other=await context.newPage()
const base=process.env.TC_BROWSER_BASE??'http://127.0.0.1:4173',url=base+'/tests/browser/store-contract.html'
const directory=process.env.TC_BROWSER_EVIDENCE??'/tmp/tradingchest-store-contract';mkdirSync(directory,{recursive:true})
const results=[],errors=[],databases=new Set()
for(const target of [page,other])target.on('pageerror',error=>errors.push(error.message))
let sequence=0
const fresh=async target=>{await target.goto(url);await target.waitForFunction(()=>window.ready)}
const run=async(name,work)=>{
  const count=errors.length,databaseName=`tc-store-contract-${Date.now()}-${sequence++}`;databases.add(databaseName)
  try{await fresh(page);await fresh(other);await work(databaseName);assert.deepEqual(errors.slice(count),[]);results.push({name,passed:true})}
  catch(error){results.push({name,passed:false,error:String(error)});await page.screenshot({path:`${directory}/${name}.png`}).catch(()=>{})}
  finally{await Promise.all([page,other].map(target=>target.evaluate(()=>storageTest.disposeAll()).catch(()=>{})))}
}
try{
  await run('persistent-reopen-and-transaction-completion',async name=>{
    const first=await page.evaluate(async name=>{
      const t=storageTest,store=t.create('a',name),value=await store.write('scope',{kind:'create',id:'id',name:'  交易工作台  ',document:t.document()},t.signal())
      t.events.push({type:'resolved'});store.dispose()
      return {value,events:t.events,connections:t.connections.size}
    },name)
    assert.equal(first.value.name,'交易工作台');assert.match(first.value.revision,/^[0-9a-f-]{36}$/i);assert.equal(first.connections,0)
    assert.equal(first.events.at(-1).type,'resolved');assert.equal(first.events.at(-2).type,'complete')
    await fresh(page)
    const second=await page.evaluate(async name=>storageTest.create('a',name).read('scope','id',storageTest.signal()),name)
    assert.deepEqual(second,first.value)
  })
  await run('stable-create-id-duplicate-names-and-scope-isolation',async name=>{
    const value=await page.evaluate(async name=>{
      const t=storageTest,store=t.create('a',name),write=id=>store.write('scope',{kind:'create',id,name:'同名',document:t.document()},t.signal())
      const one=await write('one'),two=await write('two'),duplicate=await t.result(write('one'))
      const scope='  scope:other/账户  '
      const foreign=await store.write(scope,{kind:'create',id:'one',name:'同名',document:t.document(scope,4)},t.signal())
      return {one,two,duplicate,foreign,local:await store.list('scope',t.signal()),remote:await store.list(scope,t.signal()),original:await store.read('scope','one',t.signal())}
    },name)
    assert.equal(value.duplicate.error.code,'WORKSPACE_CONFLICT');assert.deepEqual(value.original,value.one)
    assert.equal(value.local.length,2);assert.equal(value.remote.length,1);assert.equal(value.one.name,value.two.name)
    assert.notEqual(value.one.revision,value.two.revision);assert.equal(value.foreign.document.cells.length,4)
  })
  await run('input-output-and-list-copy-isolation',async name=>{
    const value=await page.evaluate(async name=>{
      const t=storageTest,store=t.create('a',name),input={kind:'create',id:'id',name:'name',document:t.document()}
      const pending=store.write('scope',input,t.signal());input.id='changed';input.name='changed';input.document.sync.symbol=true;input.document.cells[0].chart.theme='light'
      const saved=await pending;saved.name='changed';saved.document.sync.period=true
      const read=await store.read('scope','id',t.signal());read.document.sync.crosshair=true
      const list=await store.list('scope',t.signal());list[0].name='changed'
      return {stored:await store.read('scope','id',t.signal()),list:await store.list('scope',t.signal()),missing:await store.read('scope','changed',t.signal())}
    },name)
    assert.equal(value.stored.name,'name');assert.equal(value.stored.document.cells[0].chart.theme,'dark')
    assert.deepEqual(value.stored.document.sync,{symbol:false,period:false,crosshair:false,viewport:false});assert.equal(value.list[0].name,'name');assert.equal(value.missing,null)
  })
  await run('two-instance-update-cas-and-stale-delete',async name=>{
    const value=await page.evaluate(async name=>{
      const t=storageTest,a=t.create('a',name),b=t.create('b',name),first=await a.write('scope',{kind:'create',id:'id',name:'original',document:t.document()},t.signal())
      const changes=await Promise.all([a,b].map((store,index)=>t.result(store.write('scope',{kind:'update',id:'id',name:`winner-${index}`,expectedRevision:first.revision,document:t.document()},t.signal()))))
      const stale=await t.result(b.remove('scope','id',first.revision,t.signal())),current=await a.read('scope','id',t.signal())
      return {first,changes,stale,current,connections:t.connections.size}
    },name)
    assert.equal(value.changes.filter(result=>result.ok).length,1);assert.equal(value.changes.find(result=>!result.ok).error.code,'WORKSPACE_CONFLICT')
    assert.equal(value.stale.error.code,'WORKSPACE_CONFLICT');assert.deepEqual(value.current,value.changes.find(result=>result.ok).value)
    assert.notEqual(value.current.revision,value.first.revision);assert.equal(value.connections,2)
  })
  await run('two-page-update-cas',async name=>{
    const first=await page.evaluate(async name=>{const t=storageTest;return t.create('a',name).write('scope',{kind:'create',id:'id',name:'original',document:t.document()},t.signal())},name)
    await other.evaluate(async name=>{const t=storageTest;await t.create('b',name).list('scope',t.signal())},name)
    const changes=await Promise.all([page,other].map((target,index)=>target.evaluate(async({revision,index})=>{
      const t=storageTest,store=[...t.stores.values()][0]
      return t.result(store.write('scope',{kind:'update',id:'id',name:`page-${index}`,expectedRevision:revision,document:t.document()},t.signal()))
    },{revision:first.revision,index})))
    assert.equal(changes.filter(result=>result.ok).length,1);assert.equal(changes.find(result=>!result.ok).error.code,'WORKSPACE_CONFLICT')
    assert.deepEqual(await page.evaluate(()=>storageTest.stores.get('a').read('scope','id',storageTest.signal())),changes.find(result=>result.ok).value)
  })
  await run('two-page-update-delete-cas',async name=>{
    const first=await page.evaluate(async name=>{const t=storageTest;return t.create('a',name).write('scope',{kind:'create',id:'id',name:'original',document:t.document()},t.signal())},name)
    await other.evaluate(async name=>{const t=storageTest;await t.create('b',name).list('scope',t.signal())},name)
    const [update,remove]=await Promise.all([
      page.evaluate(async revision=>{const t=storageTest;return t.result(t.stores.get('a').write('scope',{kind:'update',id:'id',name:'updated',expectedRevision:revision,document:t.document()},t.signal()))},first.revision),
      other.evaluate(async revision=>{const t=storageTest;return t.result(t.stores.get('b').remove('scope','id',revision,t.signal()))},first.revision),
    ])
    assert.equal(Number(update.ok)+Number(remove.ok),1)
    assert.ok(['WORKSPACE_NOT_FOUND','WORKSPACE_CONFLICT'].includes((update.ok?remove:update).error.code))
    const current=await page.evaluate(()=>storageTest.stores.get('a').read('scope','id',storageTest.signal()))
    if(remove.ok)assert.equal(current,null);else assert.deepEqual(current,update.value)
  })
  await run('not-found-read-update-and-remove',async name=>{
    const value=await page.evaluate(async name=>{
      const t=storageTest,store=t.create('a',name)
      return {read:await store.read('scope','missing',t.signal()),update:await t.result(store.write('scope',{kind:'update',id:'missing',expectedRevision:'missing',name:'name',document:t.document()},t.signal())),remove:await t.result(store.remove('scope','missing','missing',t.signal()))}
    },name)
    assert.equal(value.read,null);assert.equal(value.update.error.code,'WORKSPACE_NOT_FOUND');assert.equal(value.remove.error.code,'WORKSPACE_NOT_FOUND')
  })
  await run('invalid-write-and-corrupt-native-row-abort',async name=>{
    const value=await page.evaluate(async name=>{
      const t=storageTest,store=t.create('a',name),valid=await store.write('scope',{kind:'create',id:'id',name:'original',document:t.document()},t.signal())
      const doc=t.document();doc.cells[0].context='another-scope'
      const invalid=await t.result(store.write('scope',{kind:'update',id:'id',name:'bad',expectedRevision:valid.revision,document:doc},t.signal())),before=await store.read('scope','id',t.signal())
      await t.rawWrite(name,{scope:'scope',...valid,document:{...t.document(),cells:[null]}})
      const read=await t.result(store.read('scope','id',t.signal())),list=await t.result(store.list('scope',t.signal()))
      const update=await t.result(store.write('scope',{kind:'update',id:'id',name:'bad',expectedRevision:valid.revision,document:t.document()},t.signal()))
      return {valid,invalid,before,read,list,update,events:t.events}
    },name)
    assert.deepEqual(value.before,value.valid)
    for(const key of ['invalid','read','list','update'])assert.equal(value[key].error.code,'WORKSPACE_INVALID_DOCUMENT')
    assert.ok(value.events.some(event=>event.type==='abort'))
  })
  await run('pending-open-abort-closes-late-connection',async name=>{
    const value=await page.evaluate(async name=>{
      const t=storageTest,store=t.create('a',name),controller=new AbortController()
      const opening=store.write('scope',{kind:'create',id:'cancelled',name:'name',document:t.document()},controller.signal);controller.abort()
      const cancelled=await t.result(opening)
      await new Promise(resolve=>setTimeout(resolve,100))
      const connections=t.connections.size,rows=await store.list('scope',t.signal())
      return {cancelled,connections,rows}
    },name)
    assert.equal(value.cancelled.error.name,'AbortError');assert.equal(value.connections,0);assert.deepEqual(value.rows,[])
  })
  await run('pending-open-dispose-closes-late-connection',async name=>{
    const value=await page.evaluate(async name=>{
      const t=storageTest,store=t.create('a',name),pending=store.list('scope',t.signal());store.dispose()
      const closed=await t.result(pending);await new Promise(resolve=>setTimeout(resolve,100))
      const connections=t.connections.size,rows=await t.create('b',name).list('scope',t.signal())
      return {closed,connections,rows}
    },name)
    assert.equal(value.closed.error.code,'WORKSPACE_STORE_UNAVAILABLE');assert.equal(value.connections,0);assert.deepEqual(value.rows,[])
  })
  await run('pending-native-read-abort-and-dispose',async name=>{
    const value=await page.evaluate(async name=>{
      const t=storageTest,store=t.create('a',name),first=await store.write('scope',{kind:'create',id:'id',name:'name',document:t.document()},t.signal()),release=await t.hold(name),controller=new AbortController()
      const pending=store.read('scope','id',controller.signal);await Promise.resolve();controller.abort()
      const aborted=await t.result(pending)
      const late=store.read('scope','id',t.signal());await Promise.resolve();store.dispose()
      const closed=await t.result(late);await release()
      const reopened=t.create('b',name),read=await reopened.read('scope','id',t.signal());reopened.dispose()
      return {first,aborted,closed,read,connections:t.connections.size}
    },name)
    assert.equal(value.aborted.error.name,'AbortError');assert.equal(value.closed.error.code,'WORKSPACE_STORE_UNAVAILABLE');assert.deepEqual(value.read,value.first);assert.equal(value.connections,0)
  })
  await run('abort-after-native-add-success-never-reports-commit',async name=>{
    const value=await page.evaluate(async name=>{
      const t=storageTest,store=t.create('a',name),controller=new AbortController(),original=IDBObjectStore.prototype.add
      IDBObjectStore.prototype.add=function(...args){const request=original.apply(this,args);request.addEventListener('success',()=>controller.abort(),{once:true});return request}
      let outcome
      try{outcome=await t.result(store.write('scope',{kind:'create',id:'id',name:'name',document:t.document()},controller.signal))}finally{IDBObjectStore.prototype.add=original}
      return {outcome,read:await store.read('scope','id',t.signal()),events:t.events}
    },name)
    assert.equal(value.outcome.error.name,'AbortError');assert.equal(value.read,null);assert.ok(value.events.some(event=>event.type==='abort'))
  })
  await run('abort-at-native-completion-requires-read-confirmation',async name=>{
    const value=await page.evaluate(async name=>{
      const t=storageTest,store=t.create('a',name),controller=new AbortController(),original=IDBDatabase.prototype.transaction
      IDBDatabase.prototype.transaction=function(...args){
        const tx=original.apply(this,args)
        if(tx.mode==='readwrite')tx.addEventListener('complete',()=>controller.abort(),{once:true})
        return tx
      }
      let outcome
      try{outcome=await t.result(store.write('scope',{kind:'create',id:'fixed-id',name:'name',document:t.document()},controller.signal))}finally{IDBDatabase.prototype.transaction=original}
      return {outcome,read:await store.read('scope','fixed-id',t.signal()),list:await store.list('scope',t.signal())}
    },name)
    assert.equal(value.outcome.error.name,'AbortError');assert.equal(value.read.id,'fixed-id');assert.equal(value.read.name,'name');assert.equal(value.list.length,1)
  })
  await run('dispose-isolates-store-connections',async name=>{
    const value=await page.evaluate(async name=>{
      const t=storageTest,a=t.create('a',name),b=t.create('b',name)
      await a.list('scope',t.signal());await b.list('scope',t.signal());const before=t.connections.size
      a.dispose();a.dispose();const after=t.connections.size
      const stillOpen=await b.write('scope',{kind:'create',id:'id',name:'name',document:t.document()},t.signal()),closed=await t.result(a.list('scope',t.signal()))
      b.dispose();return {before,after,stillOpen,closed,final:t.connections.size}
    },name)
    assert.equal(value.before,2);assert.equal(value.after,1);assert.equal(value.stillOpen.id,'id');assert.equal(value.closed.error.code,'WORKSPACE_STORE_UNAVAILABLE');assert.equal(value.final,0)
  })
  await run('unavailable-api-and-incompatible-native-version',async name=>{
    const value=await page.evaluate(async name=>{
      const t=storageTest,native=indexedDB
      Object.defineProperty(window,'indexedDB',{configurable:true,value:undefined})
      let absent
      try{absent=await t.result(t.create('absent',name).list('scope',t.signal()))}finally{Object.defineProperty(window,'indexedDB',{configurable:true,value:native})}
      const newer=await t.rawOpen(name,2);newer.close()
      const version=await t.result(t.create('version',name).list('scope',t.signal()))
      return {absent,version}
    },name)
    assert.equal(value.absent.error.code,'WORKSPACE_STORE_UNAVAILABLE');assert.equal(value.version.error.code,'WORKSPACE_STORE_UNAVAILABLE')
  })
  await run('native-quota-error',async name=>{
    // A fresh storage partition has no quota reservation granted to earlier transactions.
    const quotaContext=await browser.newContext(),quotaPage=await quotaContext.newPage()
    await fresh(quotaPage)
    const session=await quotaContext.newCDPSession(quotaPage)
    try{
      await session.send('Storage.overrideQuotaForOrigin',{origin:base,quotaSize:1024})
      const value=await quotaPage.evaluate(async name=>{
        const t=storageTest,store=t.create('quota',name),document=t.document(),chunks=[]
        // Incompressible data reaches native disk-quota enforcement; repeated text can be compressed away.
        for(let index=0;index<256;index++){const bytes=new Uint8Array(65536);crypto.getRandomValues(bytes);chunks.push(String.fromCharCode(...bytes))}
        document.cells[0].chart.styles.payload=chunks.join('')
        const outcome=await t.result(store.write('scope',{kind:'create',id:'id',name:'name',document},t.signal()))
        store.dispose();return outcome
      },name)
      assert.equal(value.ok,false);assert.equal(value.error.code,'WORKSPACE_STORE_UNAVAILABLE');assert.match(value.error.message,/quota/i)
    }finally{
      await session.send('Storage.overrideQuotaForOrigin',{origin:base})
      await quotaPage.evaluate(()=>storageTest.disposeAll()).catch(()=>{})
      await session.detach();await quotaContext.close()
    }
  })
}finally{
  for(const target of [page,other])await target.evaluate(()=>storageTest.disposeAll()).catch(()=>{})
  for(const name of databases)await page.evaluate(name=>storageTest.deleteDatabase(name),name).catch(error=>errors.push(`Cleanup ${name}: ${error}`))
  await browser.close()
  writeFileSync(process.argv[2]??`${directory}/evidence.json`,JSON.stringify({results,errors},null,2)+'\n')
}
if(results.some(result=>!result.passed)||errors.length){console.error(JSON.stringify({results,errors},null,2));process.exitCode=1}
else console.log(`Native IndexedDB store acceptance: ${results.length} passed`)
