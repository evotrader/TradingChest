export const workflowBudgets=Object.freeze({histories:[10000,50000],tools:['fibonacciLine','fibonacciExtension'],mounts:10,moves:20,levels:64,dragP95:150})

/** Retain the complete original mixed workload, even when its old limit failed. */
function validateMixed(value,name){
 if(value?.mode!=='formal'||!Array.isArray(value.errors)||value.errors.length||value.cases?.length!==2)throw Error(name+' requires the complete formal DE workload')
 for(const history of workflowBudgets.histories){
  const cases=value.cases.filter(entry=>entry.history===history)
  if(cases.length!==1)throw Error(name+' duplicate or missing history '+history)
  const entry=cases[0],keys=new Set()
  if(entry.mixed?.length!==20||entry.mixedCleanup?.subscriptions!==0||entry.mixedCleanup?.dom!==0)throw Error(name+' incomplete mixed samples or cleanup '+history)
  for(const sample of entry.mixed){
   const key=sample.round+':'+sample.direction,ids=new Set(sample.ids??[])
   if(!Number.isInteger(sample.round)||sample.round<1||sample.round>10||![-1,1].includes(sample.direction)||keys.has(key))throw Error(name+' invalid mixed round '+key)
   keys.add(key)
   if(!sample.trusted||!sample.observerSupported||!sample.complete||sample.status!=='completed'||sample.objects!==1002||sample.native!==1002||sample.ids?.length!==1002||ids.size!==1002||sample.ids.some(id=>typeof id!=='string'||!id)||sample.items?.length!==1002||sample.items.some(status=>status!=='confirmed')||sample.history?.pending!==0||sample.history?.error||sample.history?.uncertainLogicalIds?.length!==0||Object.keys(sample.history?.projectionErrors??{missing:1}).length)throw Error(name+' incomplete mixed confirmation '+key)
   if(sample.expected?.length!==1002||new Set(sample.expected.map(target=>target.id)).size!==1002||sample.expected.some(target=>!ids.has(target.id)||!Array.isArray(target.anchors)||!target.anchors.length||target.anchors.some(anchor=>anchor.kind!=='market'||!Number.isFinite(anchor.timestamp)||!Number.isFinite(anchor.value))))throw Error(name+' invalid expected geometry '+key)
   if(!Number.isFinite(sample.start)||!Number.isFinite(sample.end)||!Number.isFinite(sample.latency)||sample.latency<0||Math.abs(sample.end-sample.start-sample.latency)>1e-6||!Number.isFinite(sample.maximumLongTask)||sample.maximumLongTask<0||!Array.isArray(sample.longTasks)||sample.longTasks.some(task=>!Number.isFinite(task.startTime)||!Number.isFinite(task.duration)||task.duration<0||task.startTime>=sample.end||task.startTime+task.duration<=sample.start)||Math.max(0,...sample.longTasks.map(task=>task.duration))!==sample.maximumLongTask)throw Error(name+' invalid mixed timing '+key)
  }
 }
}

export function mixedTargets(baseline,candidate){
 validateMixed(baseline,'baseline');validateMixed(candidate,'candidate')
 return workflowBudgets.histories.map(history=>{
  const values=data=>data.cases.find(entry=>entry.history===history).mixed.map(sample=>sample.latency),baselineMaximum=Math.max(...values(baseline)),maximum=Math.max(...values(candidate)),limit=Math.min(1700,.9*baselineMaximum)
  return {history,metric:'mixed1002-translate-improvement',n:20,baselineMaximum,maximum,limit,passed:maximum<=limit}
 })
}
