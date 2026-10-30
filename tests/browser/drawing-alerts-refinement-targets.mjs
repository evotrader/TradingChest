/** New 0.13 targets consume the original full refinement samples, not a second workload. */
export function drawingAlertRefinementTargets(samples){
 // Operator-approved 2026-10-30: only 10k reorder changes to 750ms; 50k reorder and restore retain their limits.
 const targets=[...[10000,50000].flatMap(history=>[{history,action:'reorder',metric:'latency',limit:history===10000?750:650},{history,action:'style',metric:'latency',limit:900}]),{history:50000,action:'restore',metric:'maximumLongTask',limit:500}]
 return targets.map(target=>{
  const values=samples.filter(sample=>sample.history===target.history&&sample.action===target.action),finite=values.every(sample=>Number.isFinite(sample[target.metric])),maximum=finite?Math.max(...values.map(sample=>sample[target.metric])):null
  return {...target,n:values.length,maximum,passed:values.length===10&&finite&&maximum<=target.limit}
 })
}
