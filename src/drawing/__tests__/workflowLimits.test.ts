import {expect,it} from 'vitest'
import {mixedTargets} from '../../../tests/browser/drawing-workflow-limits.mjs'

function evidence(latency:number){
 const ids=Array.from({length:1002},(_,index)=>'object-'+index)
 return {mode:'formal',errors:[],passed:false,cases:[10000,50000].map(history=>({history,mixedCleanup:{subscriptions:0,dom:0},mixed:Array.from({length:20},(_,index)=>({round:Math.floor(index/2)+1,direction:index%2?1:-1,trusted:true,observerSupported:true,complete:true,status:'completed',objects:1002,native:1002,ids,items:ids.map(()=> 'confirmed'),expected:ids.map(id=>({id,anchors:[{kind:'market',timestamp:100,value:20}]})),history:{pending:0,uncertainLogicalIds:[],projectionErrors:{}},start:100,end:100+latency,latency,maximumLongTask:60,longTasks:[{startTime:100,duration:60}]}))}))}
}
it('recomputes both limits from complete original arrays, independent of prior pass flags',()=>{
 const baseline=evidence(1000),candidate=evidence(899),before=structuredClone([baseline,candidate])
 expect(mixedTargets(baseline,candidate).map((gate:any)=>[gate.n,gate.limit,gate.passed])).toEqual([[20,900,true],[20,900,true]])
 expect(mixedTargets(baseline,evidence(901)).every((gate:any)=>!gate.passed)).toBe(true)
 expect(mixedTargets(evidence(2000),evidence(1600)).map((gate:any)=>gate.limit)).toEqual([1700,1700]);expect([baseline,candidate]).toEqual(before)
})
it('rejects incomplete, untrusted, unconfirmed or inconsistent geometry and full timing windows',()=>{
 const patches=[
  (d:any)=>d.cases[0].mixed.pop(),(d:any)=>d.cases[0].mixed[0].trusted=false,
  (d:any)=>d.cases[0].mixed[0].items[1001]='rejected',(d:any)=>d.cases[0].mixed[0].native=1001,
  (d:any)=>d.cases[0].mixed[0].expected.pop(),(d:any)=>d.cases[0].mixed[0].expected[0].anchors[0].value=NaN,
  (d:any)=>d.cases[0].mixedCleanup.dom=1,(d:any)=>d.cases[1].history=10000,
  (d:any)=>d.cases[0].mixed[0].end++,(d:any)=>d.cases[0].mixed[0].longTasks[0].startTime=1000,
  (d:any)=>d.cases[0].mixed[0].history.projectionErrors={a:'unavailable'},(d:any)=>d.errors.push('runtime error'),
 ]
 for(const patch of patches){const bad=evidence(800);patch(bad);expect(()=>mixedTargets(evidence(1000),bad)).toThrow();expect(()=>mixedTargets(bad,evidence(800))).toThrow()}
})
