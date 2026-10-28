import assert from 'node:assert/strict'

/** Exercise the original controls; the feed and rejected commit are isolated inputs. */
export async function runLevelAlertBoundaries(page){
 const manager=page.getByRole('complementary',{name:'画线提醒管理',exact:true}),editor=page.getByRole('complementary',{name:'绘图管理',exact:true})
 const wait=()=>page.waitForFunction(()=>pro.getDrawingHistoryState().pending===0)
 const select=id=>page.evaluate(id=>pro.executeDrawingCommand({type:'select',ids:[id]}),id)
 const open=async id=>{await select(id);await page.getByRole('region',{name:'绘图属性',exact:true}).getByRole('button',{name:'添加提醒',exact:true}).click()}
 const settings=async id=>{await select(id);await page.getByRole('region',{name:'绘图属性',exact:true}).getByRole('button',{name:'绘图设置',exact:true}).click()}
 const close=()=>manager.getByRole('button',{name:'关闭提醒管理',exact:true}).click()
 const commit=async()=>{await editor.getByRole('button',{name:'确认修改',exact:true}).click();await wait();await editor.getByRole('button',{name:'关闭绘图管理',exact:true}).click()}
 const id=await page.evaluate(()=>levelBench.seed({kind:'fibonacciExtension'}));await settings(id)
 await editor.getByRole('button',{name:'级别 4 添加提醒',exact:true}).click()
 const source=await page.evaluate(id=>pro.getDrawings().find(d=>d.logicalId===id),id),level=source.parameters.levels.items[3]
 assert.equal(await manager.getByLabel('提醒级别',{exact:true}).inputValue(),level.id)
 await manager.getByLabel('提醒条件',{exact:true}).selectOption('crossing-up');await manager.getByLabel('提醒频率',{exact:true}).selectOption('once-per-bar');await manager.getByRole('button',{name:'创建提醒',exact:true}).click();await close()
 if(await editor.count())await editor.getByRole('button',{name:'关闭绘图管理',exact:true}).click()
 const rule=await page.evaluate(id=>pro.getDrawingAlertState().find(s=>s.rule.drawingLogicalId===id).rule.id,id)
 await settings(id);await editor.getByRole('textbox',{name:'级别 4 比例',exact:true}).fill('.25');await editor.getByLabel('反向计算',{exact:true}).check();await commit()
 const oracle=source.anchors[2].value-(source.anchors[1].value-source.anchors[0].value)*.25
 await page.evaluate(async price=>{levelBench.update(price+1);await levelBench.frame()},oracle)
 assert.equal(await page.evaluate(rule=>pro.getDrawingAlertState().find(s=>s.rule.id===rule).records.length,rule),0)
 await page.evaluate(async price=>{levelBench.update(price-1,true);await levelBench.frame();levelBench.update(price+1,true);await levelBench.frame()},oracle)
 const event=await page.evaluate(rule=>pro.getDrawingAlertState().find(s=>s.rule.id===rule).records[0],rule);assert.equal(event.referencePrice,oracle);assert.equal(event.level.value,.25)
 await settings(id);await editor.getByLabel('级别 4 显示',{exact:true}).uncheck();await commit()
 assert.equal(await page.evaluate(rule=>pro.getDrawingAlertState().find(s=>s.rule.id===rule).enabled,rule),false)
 await page.getByRole('button',{name:'撤销绘图',exact:true}).click();await wait();await open(id)
 const row=manager.locator(`[data-drawing-alert-id="${rule}"]`);await row.getByRole('button',{name:'继续监控',exact:true}).click();assert.equal(await page.evaluate(rule=>pro.getDrawingAlertState().find(s=>s.rule.id===rule).hasTriggered,rule),true);await close()
 await settings(id);await editor.getByRole('button',{name:'级别 4 删除',exact:true}).click();await commit();assert.equal(await page.evaluate(rule=>pro.getDrawingAlertState().find(s=>s.rule.id===rule).status,rule),'source-missing')
 await page.getByRole('button',{name:'撤销绘图',exact:true}).click();await wait();await open(id);await row.getByRole('button',{name:'继续监控',exact:true}).click();await close()
 await settings(id);await editor.getByLabel('向右延长',{exact:true}).uncheck();await commit()
 const lines=await page.evaluate(async id=>(await levelBench.figures(id)).filter(f=>f.key?.startsWith('fibonacci-level:')),id)
 assert.equal(lines.length,7);assert.ok(lines.every(line=>line.attrs.coordinates[0].x<=line.attrs.coordinates[1].x))
 await page.evaluate(async price=>{levelBench.update(price-1,true);await levelBench.frame();levelBench.update(price+1,true);await levelBench.frame()},oracle)
 assert.equal(await page.evaluate(rule=>pro.getDrawingAlertState().find(s=>s.rule.id===rule).records.length,rule),1)
 const before=await page.evaluate(()=>pro.getDrawingAlertState().length)
 for(const mode of ['rejected','uncertain']){
  const failed=await page.evaluate(()=>levelBench.seed({legacy:true,owner:'backend'}));await open(failed);await page.evaluate(mode=>levelBench.mode(mode),mode);await manager.getByRole('button',{name:'初始化级别',exact:true}).click();await wait()
  assert.equal(await manager.getByRole('button',{name:'创建提醒',exact:true}).isDisabled(),true);assert.equal(await page.evaluate(()=>pro.getDrawingAlertState().length),before);await close();await page.evaluate(()=>levelBench.mode('confirmed'))
 }
 const held=await page.evaluate(()=>levelBench.seed({legacy:true,owner:'backend'}));await open(held);await page.evaluate(()=>levelBench.mode('held'));await manager.getByRole('button',{name:'初始化级别',exact:true}).click();await page.waitForFunction(()=>pro.getDrawingHistoryState().pending>0)
 await manager.getByLabel('提醒来源',{exact:true}).selectOption(id);await page.evaluate(()=>{levelBench.mode('confirmed');levelBench.release()});await wait();assert.equal(await manager.getByLabel('提醒来源',{exact:true}).inputValue(),id);assert.equal(await manager.getByLabel('提醒级别',{exact:true}).inputValue(),'');assert.equal(await page.evaluate(()=>pro.getDrawingAlertState().length),before);await close()
 // Persisted IDs that happen to contain the legacy prefix are already stable.
 const stable=await page.evaluate(async()=>{const id=await levelBench.seed();const source=pro.getDrawings().find(d=>d.logicalId===id);source.parameters.levels.items.forEach((level,index)=>level.id='legacy-'+index);pro.restoreDrawings('local',pro.getDrawings().filter(d=>d.owner==='local'&&d.logicalId!==id).concat(source));return id})
 await open(stable);assert.equal(await manager.getByRole('button',{name:'初始化级别',exact:true}).count(),0);await manager.getByLabel('提醒级别',{exact:true}).selectOption('legacy-3');await close()
 const late=await page.evaluate(()=>levelBench.seed({legacy:true,owner:'backend'}));await open(late);await page.evaluate(()=>levelBench.mode('held'));await manager.getByRole('button',{name:'初始化级别',exact:true}).click();await page.waitForFunction(()=>pro.getDrawingHistoryState().pending>0)
 await close();await page.evaluate(()=>{levelBench.mode('confirmed');levelBench.release()});await wait();assert.equal(await manager.count(),0);assert.equal(await page.evaluate(()=>pro.getDrawingAlertState().length),before)
 return ['level-row-entry-reverse-ratio-seed-native-domain','hidden-delete-undo-explicit-resume-markers','initialize-rejected-uncertain-source-race-no-alert','persisted-legacy-id-is-stable','closed-initialization-does-not-reopen-or-create']
}

export async function runLevelAlertTouch(browser){
 const page=await browser.newPage({viewport:{width:390,height:900},hasTouch:true})
 try{
  await page.goto(`${process.env.TC_BROWSER_BASE}/tests/browser/drawing-level-alerts.html`);await page.waitForFunction(()=>window.ready&&pro.getAnalysisContext());await page.evaluate(()=>levelBench.seed())
  await page.getByRole('region',{name:'绘图属性',exact:true}).getByRole('button',{name:'添加提醒',exact:true}).tap();const manager=page.getByRole('complementary',{name:'画线提醒管理',exact:true}),level=await page.evaluate(()=>pro.getDrawings()[0].parameters.levels.items[3].id)
  await manager.getByLabel('提醒级别',{exact:true}).selectOption(level);const button=manager.getByRole('button',{name:'创建提醒',exact:true});const size=await button.boundingBox();assert.ok(size.width>=44&&size.height>=44);await button.tap();assert.equal(await page.evaluate(()=>pro.getDrawingAlertState().length),1);await manager.getByRole('button',{name:'关闭提醒管理',exact:true}).tap();assert.deepEqual(await page.evaluate(()=>levelBench.dispose()),{subscriptions:0,dom:0})
  return 'touch-entry-create-level-and-44px-target'
 }finally{await page.close()}
}
