// Operator-approved 2026-10-30 after 0.17 R3: only 50k zero-rule append, append increment and mixed translation change.
export const levelAlertBudgets=Object.freeze({
 append:{10000:{0:90,100:95},50000:{0:275,100:275}},
 appendIncrement:{10000:20,50000:25},
 mixed50kMaximum:2000,
 restoreLatency:{10000:1000,50000:1000},
 restoreLongTask:250
})
