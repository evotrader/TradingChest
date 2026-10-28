// Operator-approved 0.16 limits, 2026-10-28. Keep new restore tasks independent of old workbench restore budgets.
export const levelAlertBudgets=Object.freeze({
 append:{10000:{0:80,100:95},50000:{0:250,100:275}},
 appendIncrement:15,
 mixed50kMaximum:1800,
 restoreLatency:{10000:1000,50000:1000},
 restoreLongTask:250
})
