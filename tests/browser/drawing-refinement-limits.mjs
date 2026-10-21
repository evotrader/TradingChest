import {readFileSync} from 'node:fs'

export const refinementBudgets=JSON.parse(readFileSync(new URL('./drawing-refinement-budgets.json',import.meta.url)))

export function refinementLimits(history,action){
 const override=refinementBudgets.overrides?.[`${history}:${action}`]
 return {
  latency:override?.maximumLatency??(action==='restore'?refinementBudgets.maximumRestoreLatency:refinementBudgets.maximumLatency),
  longTask:override?.maximumLongTask??refinementBudgets.maximumLongTask
 }
}

export function mixedLimits(history){
 return {...refinementBudgets.mixedLimits,...refinementBudgets.mixedOverrides?.[String(history)]}
}
