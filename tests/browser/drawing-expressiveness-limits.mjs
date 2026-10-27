// The operator approved only mixed translation at 1700ms and restore longtask at 200ms after focused R6 on 2026-10-27.
export const expressivenessBudgets=Object.freeze({histories:[10000,50000],mounts:10,updates:100,menuRounds:20,ordinaryRounds:20,mixedRounds:10,labelIncrement:15,menuP95:150,ordinaryMaximum:300,mixedMaximum:1700,restoreLongTask:200})

/** Baseline failures remain evidence; only incomplete or invalid samples are rejected. */
export function restoreTargets(baseline,candidate){
 for(const [name,value]of [['baseline',baseline],['candidate',candidate]]){
  if(value.mode!=='formal'||value.samples?.length!==120||value.errors?.length!==0)throw Error(name+' must contain the complete formal 120 samples')
  const keys=new Set()
  for(const sample of value.samples){
   const key=[sample.history,sample.action,sample.round].join(':');if(keys.has(key))throw Error(name+' duplicate sample');keys.add(key)
   if(![10000,50000].includes(sample.history)||!['reorder','style','delete','undo','redo','restore'].includes(sample.action)||!Number.isInteger(sample.round)||sample.round<1||sample.round>10||sample.error||!sample.trusted||!sample.observerSupported||!Number.isFinite(sample.latency)||!Number.isFinite(sample.maximumLongTask)||sample.renderCalls<=0||sample.historyState?.pending!==0||sample.historyState?.uncertainLogicalIds?.length!==0||sample.historyState?.error||Object.keys(sample.historyState?.projectionErrors??{missing:1}).length||sample.cleanup?.subscriptions!==0||sample.cleanup?.dom!==0)throw Error(name+' invalid confirmation/geometry/cleanup sample '+key)
   if(!Number.isFinite(sample.renderCalls)||sample.latency<0||sample.maximumLongTask<0||sample.before!==(sample.action==='restore'?0:1002)||sample.after!==(sample.action==='delete'?0:1002)||sample.nativeCount!==sample.after||new Set(sample.beforeIds).size!==sample.before||new Set(sample.afterIds).size!==sample.after||sample.status!==(sample.action==='restore'?'restored':'completed'))throw Error(name+' invalid object result '+key)
   if(['style','delete','undo','redo'].includes(sample.action)&&(sample.itemStatuses?.length!==1002||sample.itemStatuses.some(status=>status!=='confirmed')))throw Error(name+' incomplete confirmed prefix '+key)
  }
 }
 const source=value=>value.samples.filter(sample=>sample.history===50000&&sample.action==='restore')
 return [['restore-latency','latency',1250],['restore-longtask','maximumLongTask',250]].map(([metric,field,cap])=>{const baselineMaximum=Math.max(...source(baseline).map(s=>s[field])),maximum=Math.max(...source(candidate).map(s=>s[field])),originalLimit=Math.min(cap,.9*baselineMaximum),limit=metric==='restore-longtask'?expressivenessBudgets.restoreLongTask:originalLimit;return {metric,n:10,baselineMaximum,maximum,originalLimit,limit,passed:maximum<=limit}})
}
