# TradingChest stage 1 upgrade

Implementation authorized 2026-10-14. Baseline: TradingChest 7171080; consumer EvoTrader 5cb3d9d. Recheck refs before integration.

## Batch 1: lifecycle isolation
- Invalidate pending history/load-more when replay starts or the component unmounts.
- Reject queued live callbacks after symbol change, replay start, or unmount. Ordinary load-more does not invalidate a current live subscription.
- Dispose replay through component cleanup without invoking the public stop-and-reload operation.
- Guard delayed initial indicator registration against unmount.
- Regression: 3 tests failed before the change; 6 targeted tests pass after the change.
- Baseline: 26 test files / 282 tests passed. Updated full suite before the final 3 additional tests: 27 files / 285 tests passed. TypeScript, Vite and declaration build passed.

## Acceptance blocker
Actual Chromium regression script is provided in tests/browser/lifecycle.mjs. Browser launch fails in this environment with socket() Operation not permitted, including an approved elevated retry. Browser validation has NOT passed. Do not merge or publish this batch until the real browser gate and consumer checks pass.

Reproduce: npm ci; npm test; npm run build. For browser checks install Playwright in a separate test environment, start Vite on 127.0.0.1:4173, then run lifecycle.mjs. PLAYWRIGHT_PACKAGE_JSON can point to that environment's package.json; CHROMIUM_PATH can select its installed Chromium. Tests use synthetic data and do not connect to a broker.

## Next
- Consumer reactive widget bridge and main chart cleanup.
- Drawing deletion safety; replay alert semantics; missing-data display.
- Real browser and consumer build acceptance before main-branch merge.
- No npm publication or trading execution is authorized by this change.

## Batch 2: drawing safety and missing-data display
- Route drawing keyboard actions through per-instance owned drawing IDs; remove the unscoped removeOverlay() shortcut calls.
- Escape cancels an unfinished drawing and clears selection; completed drawings and system overlays are preserved.
- Delete targets an unlocked selected UI drawing; input/editable targets are ignored. Shortcut-created drawings use the same lifecycle callbacks as drawing-bar drawings.
- Cancelled unfinished drawings do not emit a persisted-drawing delete callback.
- MetricSeries keeps real zero, omits non-finite marks and breaks the line at missing points instead of fabricating zero or connecting the gap.
- Tests: metric regressions failed before the fix and pass afterwards. Full suite now 27 files / 291 tests passes.
- Remaining gate: real browser verification plus full EvoTrader consumer build. Direct private-repo clone lacks credentials; connector reads work. No consumer source has been modified.
- Remaining work: reactive consumer bridge, consumer chart disposal, replay alert semantics, explicit Sharpe display mode and subsequent stages. No claim that stage 1 or the full upgrade is complete.
