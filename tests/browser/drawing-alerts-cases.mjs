import assert from 'node:assert/strict'

export async function drawingAlertCases(page){
 const scenarios=[]
 for(const [tool,axis,reverse] of [['straightLine','normal',false],['segment','normal',false],['rayLine','normal',false],['straightLine','logarithm',false],['straightLine','logarithm',true]]){
  const actual=await page.evaluate(async({tool,axis,reverse})=>{
   for(const state of pro.getDrawingAlertState())pro.executeDrawingAlertCommand({type:'delete',id:state.rule.id})
   const chart=pro.getChart(),bars=chart.getDataList(),last=bars.length-1
   chart.overrideYAxis({id:chart.getYAxes({paneId:'candle_pane'})[0].id,paneId:'candle_pane',name:axis,reverse})
   chart.resize();await alertBench.frame()
   const indexes=tool==='rayLine'?[last,last-10]:[last-20,last],values=axis==='logarithm'?[81,100]:[90,100]
   const anchors=indexes.map((index,i)=>({kind:'market',timestamp:bars[index].timestamp,value:values[i]}))
   const id=await alertBench.seed(tool,anchors),created=pro.executeDrawingAlertCommand({type:'create',id:'math',drawingLogicalId:id,frequency:'once-per-bar'})
   if(created.status!=='completed')throw Error(created.message)
   // Both observations occur at the final endpoint: independently known price 100,
   // or the first endpoint (90) for the leftward ray.
   const expected=tool==='rayLine'?90:100,before=alertBench.events.length
   alertBench.update(expected-1);alertBench.update(expected+1);await alertBench.frame()
   const overlay=chart.getOverlays({id})[0]
   if(!overlay)throw Error(JSON.stringify({tool,axis,reverse,id,source:pro.getDrawings().find(d=>d.logicalId===id),history:pro.getDrawingHistoryState(),bars:chart.getDataList().length}))
   const draw=overlay.createPointFigures;let probe
   overlay.createPointFigures=args=>{const figures=[draw(args)].flat();probe={figures,pixel:chart.convertToPixel({timestamp:bars.at(-1).timestamp,value:expected},{paneId:'candle_pane'})};return figures}
   chart.resize();await alertBench.frame();overlay.createPointFigures=draw
   const figure=probe?.figures.find(figure=>figure.type==='line'&&!figure.ignoreEvent),points=figure?.attrs.coordinates
   let y
   if(points?.length>=2){const a=points[0],b=points.at(-1);y=a.y+(b.y-a.y)*(probe.pixel.x-a.x)/(b.x-a.x)}
   return {created,events:alertBench.events.length-before,event:alertBench.events.at(-1),expected,pixel:probe?.pixel,y,points}
  },{tool,axis,reverse})
  assert.equal(actual.events,1,JSON.stringify(actual));assert.ok(Math.abs(actual.event.referencePrice-actual.expected)<1e-10,JSON.stringify(actual));assert.ok(Number.isFinite(actual.y)&&Math.abs(actual.y-actual.pixel.y)<.02,JSON.stringify(actual))
  scenarios.push(`native-reference-${tool}-${axis}-${reverse?'reverse':'forward'}`)
 }
 const lifecycle=await page.evaluate(async()=>{
  for(const state of pro.getDrawingAlertState())pro.executeDrawingAlertCommand({type:'delete',id:state.rule.id})
  const chart=pro.getChart();chart.overrideYAxis({id:chart.getYAxes({paneId:'candle_pane'})[0].id,paneId:'candle_pane',name:'normal',reverse:false})
  const id=await alertBench.seed(),source=pro.getDrawings().find(d=>d.logicalId===id),value=source.anchors[0].value
  pro.executeDrawingAlertCommand({type:'create',id:'lifecycle',drawingLogicalId:id,frequency:'once-per-bar'})
  const before=alertBench.events.length;alertBench.update(value-1);alertBench.update(value+1)
  await pro.executeDrawingCommand({type:'update',ids:[id],patch:{overlay:{styles:{line:{color:'#f44336'}}}}})
  alertBench.update(value-1);alertBench.update(value+1);const styled=alertBench.events.length-before
  await pro.executeDrawingCommand({type:'update',ids:[id],patch:{anchors:[{...source.anchors[0],value:value+2}]}})
  alertBench.update(value+1);alertBench.update(value+3);const moved=alertBench.events.length-before
  await pro.executeDrawingCommand({type:'delete',ids:[id]});const deleted=pro.getDrawingAlertState().find(s=>s.rule.id==='lifecycle')
  await pro.executeDrawingCommand({type:'undo'});alertBench.update(value+1);alertBench.update(value+3)
  const undone=pro.getDrawingAlertState().find(s=>s.rule.id==='lifecycle'),retained=alertBench.events.length-before
  const resume=pro.executeDrawingAlertCommand({type:'resume',id:'lifecycle'});alertBench.update(value+1,{append:true});alertBench.update(value+3)
  return {styled,moved,deleted:deleted.enabled,deletedStatus:deleted.status,undone:undone.enabled,retained,resume:resume.status,final:alertBench.events.length-before}
 })
 assert.deepEqual(lifecycle,{styled:1,moved:1,deleted:false,deletedStatus:'source-missing',undone:false,retained:1,resume:'completed',final:2});scenarios.push('confirmed-style-geometry-delete-undo-manual-resume')
 const replay=await page.evaluate(async()=>{
  for(const state of pro.getDrawingAlertState())pro.executeDrawingAlertCommand({type:'delete',id:state.rule.id})
  const bars=pro.getChart().getDataList(),position=bars.length-12,threshold=(bars[position-1].close+bars[position].close)/2
  if(bars[position-1].close===bars[position].close)throw Error('回放证人需要不同的相邻收盘价')
  const id=await alertBench.seed('horizontalStraightLine',[{kind:'market',timestamp:bars[0].timestamp,value:threshold}]);pro.executeDrawingAlertCommand({type:'create',id:'replay-rule',drawingLogicalId:id})
  const liveBefore=alertBench.events.length,replayBefore=alertBench.replayEvents.length
  pro.startReplay(position);await alertBench.frame();pro.getReplayEngine().stepForward();await alertBench.frame()
  const afterForward=alertBench.replayEvents.length-replayBefore;pro.getReplayEngine().stepBackward();await alertBench.frame();pro.getReplayEngine().stepForward();await alertBench.frame()
  const state=pro.getDrawingAlertState().find(s=>s.rule.id==='replay-rule');pro.stopReplay()
  const deadline=performance.now()+10000;while(pro.getReplayEngine()){if(performance.now()>deadline)throw Error('未真实退出回放');await alertBench.frame()}
  return {afterForward,afterBackward:alertBench.replayEvents.length-replayBefore,live:alertBench.events.length-liveBefore,liveMarker:state.hasTriggered,replayMarker:state.replay.hasTriggered,afterExit:pro.getDrawingAlertState().find(s=>s.rule.id==='replay-rule').hasTriggered}
 })
 assert.deepEqual(replay,{afterForward:1,afterBackward:1,live:0,liveMarker:false,replayMarker:true,afterExit:false});scenarios.push('native-replay-forward-backward-separate-events-markers-and-exit')
 return scenarios
}
