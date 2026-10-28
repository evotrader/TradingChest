// Operator-approved after audit-fix R3, 2026-10-29: 10k zero-rule append 90ms and append increment 20ms; restore budgets unchanged.
export const levelAlertBudgets=Object.freeze({
 append:{10000:{0:90,100:95},50000:{0:250,100:275}},
 appendIncrement:20,
 mixed50kMaximum:1800,
 restoreLatency:{10000:1000,50000:1000},
 restoreLongTask:250
})
