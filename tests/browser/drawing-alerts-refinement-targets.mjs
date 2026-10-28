/** New 0.13 targets consume the original full refinement samples, not a second workload. */
export function drawingAlertRefinementTargets(samples){
 // The operator accepted only 50k reorder at 650ms and restore longtask at 500ms for 0.16 on 2026-10-28.
 const targets=[...[10000,50000].flatMap(history=>[{history,action:'reorder',metric:'latency',limit:650},{history,action:'style',metric:'latency',limit:900}]),{history:50000,action:'restore',metric:'maximumLongTask',limit:500}]
 return targets.map(target=>{
  const values=samples.filter(sample=>sample.history===target.history&&sample.action===target.action),finite=values.every(sample=>Number.isFinite(sample[target.metric])),maximum=finite?Math.max(...values.map(sample=>sample[target.metric])):null
  return {...target,n:values.length,maximum,passed:values.length===10&&finite&&maximum<=target.limit}
 })
}
