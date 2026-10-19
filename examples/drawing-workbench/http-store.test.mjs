import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {createHTTPDrawingStore} from './http-store.mjs'
import {drawingStoreMiddleware} from './http-server.mjs'

test('loopback CAS, definite rejection, conflict and committed response loss',async()=>{
 const middleware=drawingStoreMiddleware(),server=createServer(middleware.handle)
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 const store=createHTTPDrawingStore(`http://127.0.0.1:${server.address().port}/drawing-store`),signal=new AbortController().signal
 const identity={namespace:'isolated-http',symbol:{ticker:'EXAMPLE.X',market:'test',exchange:'X',priceCurrency:'USD'},priceBasisKey:'raw'},document={version:1,key:JSON.stringify(['isolated-http','test','X','EXAMPLE.X','USD','raw']),identity,drawings:[]}
 try{
  assert.equal(await store.read(identity.namespace,'fixed',signal),null)
  const input={documentId:'fixed',expectedRevision:null,document},first=await store.write(identity.namespace,input,signal);assert.ok(first.revision)
  await assert.rejects(store.write(identity.namespace,input,signal),e=>e.code==='DRAWING_CONFLICT');assert.equal(middleware.state.writes,1)
  middleware.state.fault='reject';await assert.rejects(store.write(identity.namespace,{...input,expectedRevision:first.revision},signal),e=>e.code==='DRAWING_INVALID_DOCUMENT');assert.equal(middleware.state.writes,1)
  middleware.state.fault='response-lost';await assert.rejects(store.write(identity.namespace,{...input,expectedRevision:first.revision},signal));assert.equal(middleware.state.writes,2)
  const confirmed=await store.read(identity.namespace,'fixed',signal);assert.notEqual(confirmed.revision,first.revision);assert.deepEqual(confirmed.document,document);assert.equal(middleware.state.writes,2)
 }finally{await new Promise(resolve=>server.close(resolve))}
})
