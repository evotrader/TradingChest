import assert from 'node:assert/strict'

/** Installed-package page, native IndexedDB and public APIs only. */
export async function runDrawingAlertsExample(page,url){
 await page.goto(`${url}/alerts.html`);await page.waitForFunction(()=>window.alertExample?.pro?.getAnalysisContext())
 await page.locator('#seed').click();await page.waitForFunction(()=>alertExample.pro.getDrawingAlertState().length===1)
 await page.locator('#lower').click();await page.locator('#higher').click();await page.waitForFunction(()=>alertExample.pro.getDrawingAlertState()[0].records.length===1)
 await page.locator('#save').click();await page.locator('#status').filter({hasText:'同一 IndexedDB 事务中保存'}).waitFor()
 const stored=await page.evaluate(()=>alertExample.read());assert.equal(stored.layout.drawings.length,1);assert.equal(stored.alerts.rules[0].hasTriggered,true)
 await page.reload();await page.waitForFunction(()=>window.alertExample?.pro?.getAnalysisContext());assert.equal(await page.evaluate(()=>alertExample.pro.getDrawingAlertState().length),0)
 await page.locator('#restore').click();await page.locator('#status').filter({hasText:'整体恢复'}).waitFor()
 assert.deepEqual(await page.evaluate(()=>({enabled:alertExample.pro.getDrawingAlertState()[0].enabled,hasTriggered:alertExample.pro.getDrawingAlertState()[0].hasTriggered,feeds:alertExample.feeds,subscriptions:alertExample.subscriptions})),{enabled:false,hasTriggered:true,feeds:1,subscriptions:1})
 await page.getByRole('button',{name:'提醒管理',exact:true}).click();const manager=page.getByRole('complementary',{name:'画线提醒管理',exact:true})
 await manager.getByRole('button',{name:'继续监控',exact:true}).click();await page.locator('#lower').click();await page.locator('#higher').click();assert.equal(await page.evaluate(()=>alertExample.pro.getDrawingAlertState()[0].records.length),0)
 await manager.getByRole('button',{name:'重置并启用',exact:true}).click();await page.locator('#lower').click();await page.locator('#higher').click();await page.waitForFunction(()=>alertExample.pro.getDrawingAlertState()[0].records.length===1)
 const before=await page.evaluate(()=>({drawings:alertExample.pro.getDrawings(),alerts:alertExample.pro.captureDrawingAlerts()}))
 await page.evaluate(async()=>{window.beforeRestorePro=alertExample.pro;const bundle=await alertExample.read();bundle.alerts.rules[0].rule.drawingLogicalId='missing-source';await alertExample.write(bundle)})
 await page.locator('#restore').click();await page.locator('#status[data-error="true"]').filter({hasText:'未采用新布局'}).waitFor()
 assert.equal(await page.evaluate(()=>alertExample.pro===beforeRestorePro),true);assert.deepEqual(await page.evaluate(()=>({drawings:alertExample.pro.getDrawings(),alerts:alertExample.pro.captureDrawingAlerts()})),before)
 assert.equal(await page.evaluate(async()=>(await alertExample.read()).alerts.rules[0].rule.drawingLogicalId),'missing-source');assert.equal(await page.evaluate(()=>alertExample.feeds),1)
 await page.evaluate(bundle=>alertExample.write(bundle),stored)
 const cancelled=await page.evaluate(async()=>{const pro=alertExample.pro,promise=alertExample.restore();document.querySelector('#cancel').click();try{await promise;return {cancelled:false}}catch(error){return {cancelled:error.name==='AbortError',same:pro===alertExample.pro,feeds:alertExample.feeds,subscriptions:alertExample.subscriptions}}})
 assert.deepEqual(cancelled,{cancelled:true,same:true,feeds:1,subscriptions:1})
 await page.getByRole('button',{name:'关闭提醒管理',exact:true}).click()
 return {nativeIndexedDB:true,atomicLayoutAndAlerts:true,restoredPaused:true,resumeDeduplicates:true,rearmExplicit:true,invalidBindingPreservesActiveAndStored:true,cancellation:true,singleOwnedFeed:true}
}
