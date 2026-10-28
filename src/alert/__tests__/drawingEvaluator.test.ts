import {describe,it,expect} from 'vitest'
import {evaluateDrawingAlert} from '../drawingEvaluator'
import {validateDrawingAlertDocument} from '../drawingDocument'
import type {DrawingAlertEvaluation,DrawingAlertRule,DrawingAlertTool} from '../drawingTypes'
const bars=[0,10,1000,1001,9000].map(timestamp=>({timestamp}))
const rule:DrawingAlertRule={id:'r',drawingLogicalId:'d',sourceOwner:'local',target:{kind:'line'},toolId:'horizontalStraightLine',identity:{ticker:'A'},period:{multiplier:1,timespan:'minute'},condition:'crossing',frequency:'once-per-bar'}
const anchor=(index:number,value:number)=>({kind:'market' as const,timestamp:bars[index].timestamp,value})
function input(patch:Partial<DrawingAlertEvaluation>={}):DrawingAlertEvaluation{return {rule,geometry:{kind:'line',toolId:rule.toolId,anchors:[anchor(0,10)]},bars,previous:{timestamp:1001,close:9},current:{timestamp:1001,close:10},state:{hasTriggered:false},...patch}}
const neighbour=(price:number,up:boolean)=>{const data=new DataView(new ArrayBuffer(8));data.setFloat64(0,price);data.setBigUint64(0,data.getBigUint64(0)+(up?1n:-1n));return data.getFloat64(0)}
describe('portable observed-close drawing evaluation',()=>{
 it('crosses from below to equality, with immutable inputs and real event identity',()=>{
  const value=input(),before=structuredClone(value),result=evaluateDrawingAlert(value)
  expect(result.event).toEqual({ruleId:'r',drawingLogicalId:'d',identity:{ticker:'A'},period:{multiplier:1,timespan:'minute'},barTimestamp:1001,triggerPrice:10,referencePrice:10,condition:'crossing',mode:'live'})
  expect(value).toEqual(before);expect(result.state).toEqual({hasTriggered:true,lastBarTimestamp:1001})
 })
 it.each([
  ['crossing-up',9,10,true],['crossing-up',11,10,false],['crossing-down',11,10,true],['crossing-down',9,10,false],['crossing',10,11,false],['crossing',10,9,false],['crossing',9,9,false],['crossing',11,11,false]
 ] as const)('%s observes %s → %s', (condition,previous,current,expected)=>{
  expect(!!evaluateDrawingAlert(input({rule:{...rule,condition},previous:{timestamp:1001,close:previous},current:{timestamp:1001,close:current}})).event).toBe(expected)
 })
 it('seeds the first sample, deduplicates the current bar and allows the next actual bar',()=>{
  expect(evaluateDrawingAlert(input({previous:undefined})).event).toBeUndefined()
  expect(evaluateDrawingAlert(input({state:{hasTriggered:true,lastBarTimestamp:1001}})).event).toBeUndefined()
  expect(evaluateDrawingAlert(input({state:{hasTriggered:true,lastBarTimestamp:1001},current:{timestamp:9000,close:11}})).event?.barTimestamp).toBe(9000)
  expect(evaluateDrawingAlert(input({rule:{...rule,frequency:'once'},state:{hasTriggered:true,lastBarTimestamp:10}})).status).toBe('triggered')
 })
 it('uses real bar intervals across a long market closure, never a wall-clock slope',()=>{
  const result=evaluateDrawingAlert(input({rule:{...rule,toolId:'straightLine'},geometry:{kind:'line',toolId:'straightLine',anchors:[anchor(0,10),anchor(2,30)]},previous:{timestamp:1001,close:39},current:{timestamp:1001,close:41}}))
  expect(result.event?.referencePrice).toBe(40)
 })
 it('projects market interpolation through the same real-time lookup as drawing anchors',()=>{
  const result=evaluateDrawingAlert(input({rule:{...rule,toolId:'straightLine'},geometry:{kind:'line',toolId:'straightLine',anchors:[{...anchor(0,10),interpolation:{nextTimestamp:10,fraction:.5}},anchor(2,40)]},previous:{timestamp:1001,close:59},current:{timestamp:1001,close:61}}))
  expect(result.event?.referencePrice).toBe(60)
 })
 it('evaluates log space with an independently calculated geometric mean',()=>{
  const result=evaluateDrawingAlert(input({axis:'log',rule:{...rule,toolId:'straightLine'},geometry:{kind:'line',toolId:'straightLine',anchors:[anchor(0,1),anchor(2,100)]},previous:{timestamp:10,close:9},current:{timestamp:10,close:11}}))
  expect(result.event?.referencePrice).toBeCloseTo(10,12)
 })
 it.each([
  ['crossing-up',9,10,true],['crossing-down',11,10,true],['crossing',10,11,false],['crossing',10,9,false]
 ] as const)('preserves exact log equality for %s: %s → %s', (condition,previous,current,expected)=>{
  for(const toolId of ['horizontalStraightLine','straightLine','segment','rayLine'] as const){
   const value=input({axis:'log',rule:{...rule,toolId,condition},geometry:{kind:'line',toolId,anchors:toolId==='horizontalStraightLine'?[anchor(0,10)]:[anchor(1,5),anchor(3,10)]},previous:{timestamp:1001,close:previous},current:{timestamp:1001,close:current}})
   const result=evaluateDrawingAlert(value)
   expect(!!result.event,toolId).toBe(expected)
   if(result.event)expect(result.event.referencePrice).toBe(10)
  }
 })
 it('accepts caller-owned replay history without mutating it or suppressing unseen earlier bars',()=>{
  const triggeredBarTimestamps=new Set([1001,9000]),value=input({mode:'replay',triggeredBarTimestamps,state:{hasTriggered:true,lastBarTimestamp:9000}})
  expect(evaluateDrawingAlert(value).event).toBeUndefined()
  expect(evaluateDrawingAlert({...value,previous:{timestamp:10,close:9},current:{timestamp:10,close:11}}).event?.barTimestamp).toBe(10)
  expect([...triggeredBarTimestamps]).toEqual([1001,9000])
 })
 it.each(['straightLine','rayLine'] as const)('preserves exact log equality beyond a horizontal two-anchor %s',toolId=>{
  const bars=Array.from({length:6},(_,timestamp)=>({timestamp})),geometry={kind:'line' as const,toolId,anchors:[{kind:'market' as const,timestamp:0,value:10},{kind:'market' as const,timestamp:1,value:10}]}
  for(const [before,now,crosses] of [[9,10,true],[11,10,true],[10,11,false],[10,9,false]] as const){
   const result=evaluateDrawingAlert(input({axis:'log',bars,rule:{...rule,toolId},geometry,previous:{timestamp:5,close:before},current:{timestamp:5,close:now}}))
   expect(!!result.event).toBe(crosses);if(result.event)expect(result.event.referencePrice).toBe(10)
  }
 })
 it('treats percentage as an affine price axis',()=>{
  expect(evaluateDrawingAlert(input({axis:'percentage'})).event?.referencePrice).toBe(10)
 })
 it.each([
  {a:0,b:2,first:1,last:9,x:1,expected:3},
  {a:0,b:2,first:2,last:50,x:1,expected:10},
  {a:0,b:2,first:49,last:81,x:1,expected:63},
  {a:0,b:3,first:1,last:27,x:1,expected:3},
  {a:0,b:1,first:1,last:3,x:2,expected:9},
  {a:1,b:2,first:3,last:9,x:0,expected:1},
  {a:2,b:0,first:9,last:1,x:1,expected:3},
  {a:0,b:2,first:1e-200,last:9e-200,x:1,expected:3e-200},
  {a:0,b:2,first:1e200,last:9e200,x:1,expected:3e200},
  {a:0,b:2,first:1e-300,last:1e300,x:1,expected:1}
 ])('keeps log interpolation/extrapolation equality and distinct adjacent doubles: %o',({a,b,first,last,x,expected})=>{
  const bars=[0,1,2,3].map(timestamp=>({timestamp})),low=neighbour(expected,false),high=neighbour(expected,true)
  for(const toolId of ['straightLine','segment','rayLine'] as const){
   const u=(x-a)/(b-a)
   if(toolId==='segment'&&(u<0||u>1)||toolId==='rayLine'&&u<0)continue
   const geometry={kind:'line' as const,toolId,anchors:[{kind:'market' as const,timestamp:a,value:first},{kind:'market' as const,timestamp:b,value:last}]}
   for(const [before,now,condition,crosses] of [[low,expected,'crossing-up',true],[high,expected,'crossing-down',true],[expected,high,'crossing-up',false],[expected,low,'crossing-down',false],[low,high,'crossing',true],[high,low,'crossing',true]] as const){
    const result=evaluateDrawingAlert(input({axis:'log',bars,rule:{...rule,toolId,condition},geometry,previous:{timestamp:x,close:before},current:{timestamp:x,close:now}}))
    expect(result.reason,`${toolId} ${condition}`).toBeUndefined();expect(!!result.event,`${toolId} ${before} → ${now}`).toBe(crosses)
    if(result.event)expect(result.event.referencePrice).toBe(expected)
   }
  }
 })
 it('preserves a leftward ray direction and rejects its opposite half-plane',()=>{
  const base=input({rule:{...rule,toolId:'rayLine'},geometry:{kind:'line',toolId:'rayLine',anchors:[anchor(3,20),anchor(1,10)]},previous:{timestamp:0,close:4},current:{timestamp:0,close:6}})
  expect(evaluateDrawingAlert(base).event?.referencePrice).toBe(5)
  const outside=evaluateDrawingAlert({...base,current:{timestamp:9000,close:30}})
  expect(outside.status).toBe('waiting');expect(outside.comparison).toBeUndefined()
 })
 it('keeps a segment bounded, including both endpoints but never inventing an entry crossing',()=>{
  const base=input({rule:{...rule,toolId:'segment'},geometry:{kind:'line',toolId:'segment',anchors:[anchor(1,10),anchor(3,10)]}})
  expect(evaluateDrawingAlert(base).event?.referencePrice).toBe(10)
  for(const patch of [{current:{timestamp:9000,close:11}},{previous:{timestamp:0,close:9}}]){
   const result=evaluateDrawingAlert({...base,...patch});expect(result.event).toBeUndefined();expect(result.comparison).toBeUndefined()
  }
 })
 it.each([NaN,Infinity,-Infinity])('does not manufacture a reference for nonfinite sample %s',close=>{
  const result=evaluateDrawingAlert(input({current:{timestamp:1001,close}}));expect(result.status).toBe('waiting');expect(result.event).toBeUndefined()
 })
 it('rejects log nonpositive prices, vertical lines, missing history and backwards observations',()=>{
  const cases=[input({axis:'log',current:{timestamp:1001,close:0}}),input({bars:[]}),input({current:{timestamp:0,close:11}}),input({rule:{...rule,toolId:'straightLine'},geometry:{kind:'line',toolId:'straightLine',anchors:[anchor(1,10),anchor(1,20)]}})]
  for(const value of cases){expect(evaluateDrawingAlert(value).status).toBe('waiting');expect(evaluateDrawingAlert(value).event).toBeUndefined()}
 })
 it('does not mutate once markers when no event occurs and separates replay events',()=>{
  expect(evaluateDrawingAlert(input({previous:undefined,state:{hasTriggered:true,lastBarTimestamp:10}})).state).toEqual({hasTriggered:true,lastBarTimestamp:10})
  expect(evaluateDrawingAlert(input({mode:'replay'})).event?.mode).toBe('replay')
 })
})
describe('portable rule document validation',()=>{
 const document=()=>({version:2 as const,scope:'opaque scope',rules:[{rule:structuredClone(rule),hasTriggered:true,lastBarTimestamp:1001}]})
 it('accepts undeclared optional identity fields and an opaque scope',()=>{expect(()=>validateDrawingAlertDocument(document(),'opaque scope')).not.toThrow()})
 it.each([
  (d:any)=>d.version=3,(d:any)=>d.scope='other',(d:any)=>d.rules.push(d.rules[0]),(d:any)=>d.rules[0].lastBarTimestamp=NaN,(d:any)=>delete d.rules[0].lastBarTimestamp,(d:any)=>d.rules[0].rule.toolId='rect',(d:any)=>d.rules[0].rule.identity.ticker='',(d:any)=>d.rules[0].rule.identity.market=null,(d:any)=>d.rules[0].rule.sourceOwner='backend',(d:any)=>d.rules[0].rule.period.multiplier=0,(d:any)=>d.rules[0].rule.condition='above',(d:any)=>d.rules[0].rule.extra='unknown'
 ])('rejects a complete invalid document before use',change=>{const value=document();change(value);expect(()=>validateDrawingAlertDocument(value,'opaque scope')).toThrow()})
})
