# Active candidate — stage-three navigation

Stage two below remains the accepted baseline. Stage-three navigation is implemented but awaiting local frontend/browser and real backend acceptance. See [STAGE3-NAVIGATION.md](./STAGE3-NAVIGATION.md). Do not treat candidate unit tests as full product acceptance.

# Current accepted checkpoint — 2026-10-14, stage two

Stage-two library capabilities and the bounded EvoTrader integration have passed acceptance. See [STAGE2.md](./STAGE2.md) for API contracts, exact test evidence and rollout boundaries. No npm release or live financial action was performed.

## Evidence
- Library product `0b8b150146bc001b5a6bdce26caf7370d24f84a8`; package-fixture correction `7f1db90405c8be342ffff6f151ad3e6f2acf93a2`: clean install, 34 files / 351 tests, complete JS/declaration build, both real Chrome scripts passed.
- Real npm tarball installation passed: browser-bundled ESM/CJS chart without React, shared Solid updates, declarations, React 18.3.1 and 19.2.3, legacy UMD/CSS. Raw Node chart imports remain unsupported because of the upstream KLineCharts 9.8.12 packaging path.
- EvoTrader product `042077a90ba070ed053d7f1e9d45dd17cced4c56`: matching library product, clean two-level install, 6 build-gate tests, five target files / 34 tests, typecheck and full 37-page build passed.
- Local acceptance finished 09:18:35 UTC; independent read-only log review confirmed the results. Test executors made no tracked source, test or lock changes. Test Vite stopped. Root assistant authored all product/test changes.

## Delivered and adoption limits
- Abortable chart history and consumer GET transport, preserving legacy providers and stale-result guards.
- Browser framework subentries and actual packed-artifact compatibility checks.
- Opt-in immutable session identity, explicit history states and historical-revision reporting; corrected narrow default-provider protocol.
- Opt-in validated layout v2 with read-only v1 migration and retained rollback keys.
- Separate exact and approximate session VWAP requiring explicit provider coverage and session metadata.
- EvoTrader adopts transport cancellation, strengthened distribution checks and the React-only widget entry. It does not fabricate backend provenance, enable exact session VWAP or automatically persist layouts. Backend annotations retain their existing ownership.

## Reproduce
Library: npm ci; npm test; npm run build; npm run test:package. Start the existing Vite fixture and run tests/browser/lifecycle.mjs and tests/browser/widgets.mjs with Playwright and Chrome available. Synthetic test data only.
Consumer: initialize the pinned submodule; install frontend and submodule dependencies separately; build TradingChest; run scripts/ensure-trading-chest-dist.test.mjs, the five targeted test files listed in the consumer review document, typecheck and full frontend build. Do not run typecheck concurrently with Next's generated-type build.

## Remaining / rollback
- Verified backend session/provenance integration and complete automatic layout capture/restore remain future adoption work.
- Stage three navigation, synchronized layouts, undo/redo and realtime comparisons remain undelivered.
- Cold/warm performance and prolonged mount/unmount stress budgets remain unmeasured. Correctness checks do not establish sub-second latency.
- Rollback pair: EvoTrader `820ec82d2048c242938ad1daec8d4d8ce8cec6c4` with TradingChest `b2efcc17792d804cdbbba0a7ed752df098e24e62`. Revert consumer adaptation and gitlink together; preserve v1 saved layouts.
- No claim that every clone or remote feature branch has been cleaned. Preserve acceptance logs and verify branch ancestry before cleanup.

---

# Historical stage-one acceptance

# Current accepted checkpoint — 2026-10-14

Stage-one correctness and consumer integration changes are implemented and locally verified. This is not completion of stages two and three, an npm release, or a measured latency guarantee.

## Current evidence
- Product source f3e1491: 29 test files / 300 tests, complete JS and declaration build; both browser scripts passed on macOS / Chrome 154.0.8037.99, Node 24.15.0.
- Additional test-only commit 897038d2: real first-chart TradeVis click produces callback counts [1, 0] across two charts; clearing trades removes its hit cache. The full lifecycle script passed.
- EvoTrader consumer be0fce77: matching submodule, typecheck, two target files / 23 tests, full frontend build passed. Earlier clean npm ci, separate submodule npm ci and three stale-build gate tests passed. No cloud CI dependency or live account access was used.
- Consumer and library were checked together in independent clean clones; no test executor changes to tracked files. Code and test changes were authored by the root assistant. Test servers were stopped; logs remain available.

## Delivered
Reactive widget prop/callback updates; explicit chart disposal and stale async guards; independent pagination sequence; scoped Escape/Delete behavior; historical replay alerts separate from live alerts; alerts isolated by market/exchange/ticker/currency with trigger-state restoration; missing-value gaps and explicit Sharpe mode; honest legacy VWAP description; strict stale-dist rejection; consumer instance-owned trade visualization and removal of global click polling.

## Reproduce
Library: npm ci; npm test; npm run build. Start the existing Vite browser fixture and execute tests/browser/lifecycle.mjs and tests/browser/widgets.mjs with Playwright and Chrome available. Fixtures use synthetic data only.
Consumer: git submodule update --init frontend/packages/TradingChest; npm --prefix frontend ci; npm --prefix frontend/packages/TradingChest ci; then, in frontend, npm run build:trading-chest, node --test scripts/ensure-trading-chest-dist.test.mjs, the existing typecheck command, the two TradingChart/widget target tests and npm run build. Separate submodule installation avoids conflicting hoisted Babel dependencies.

## Remaining / boundaries
- Stage two: data-session contracts and default-provider protocol fixes, framework subentries and packed artifact React 18/19 tests, persistence version migration, explicit session VWAP.
- Stage three: calendar/trade/chart navigation, synchronized multi-chart layouts, undo/redo and realtime comparisons.
- Formal cold/warm performance and extended mount/unmount stress measurements are not yet performed. No sub-second performance claim follows from correctness tests.
- Git branch and clone cleanup is not claimed complete. Both accepted commits remain recoverable from main; no unmerged product changes are intentionally left behind.
- Roll back library reference and matching consumer adaptation together. No storage format migration was introduced.

---

# Historical implementation log
The entries below describe earlier checkpoints and blockers; the current accepted checkpoint above supersedes their pending statuses.

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

## Browser checkpoint and batch 3
- On 2026-10-14, the unchanged 3033f771 commit passed all 291 tests, complete build and the original lifecycle browser script on macOS / Chrome 154.0.8037.99, Node 24.15.0. The test-only executor reported no tracked file changes.
- Browser coverage at that checkpoint is lifecycle only. Drawing interaction coverage is newly added and still requires a run.
- Added bundle-owned mountAnalyticalWidget API, so non-Solid hosts can replace a complete props snapshot and callbacks without remounting or mixing Solid runtimes.
- Local widget mounting tests pass; total 293 tests and complete build pass. A built-bundle browser widget test is provided; awaiting execution.
- Consumer patch is being prepared separately: use the new mount API; dispose the main chart and its polling timer on unmount. No consumer acceptance or merge claimed yet.

## Batch 4: replay and metric semantics (pending browser acceptance)
- Replay alerts use onReplayAlertTrigger with mode=replay and historical bar timestamps. They never invoke the live callback or change live trigger flags. feedPrice is ignored while replay is active.
- Start, seek and backward movement seed the replay detector at the visible last close without emitting alerts; subsequent forward steps may trigger again in that replay segment. This is close-sample crossing, not inferred intrabar order.
- Live data callbacks carry provider bar timestamps; non-finite prices/timestamps cannot poison the detector.
- LiveSharpe chooses one metric for the entire series, with explicit ratio/sharpe mode; it no longer fills a ratio gap with absolute Sharpe. The existing 0.7 default threshold remains unchanged; Sharpe mode labels it as a threshold, not the ratio M+1 rule.
- Drawdown line and area split at missing observations; current-value labels no longer substitute earlier finite samples for a missing last observation.
- Legacy VWAP is documented as loaded-range OHLCV typical-price approximation, not session-reset exact turnover/volume VWAP.

## 2026-10-14 acceptance checkpoint and loading-mask regression
- The fixed fd36ab39 snapshot passed 298 tests, complete build and built-bundle widget browser checks on the test-only macOS executor. Lifecycle and replay-alert isolation checks passed before the drawing test timed out; Escape/Delete browser acceptance remains pending.
- Reproduced an initial-load race: applyNewData may synchronously request more history, and sharing fetchSeq invalidated the initial request's loading-mask cleanup. Pagination now has its own sequence and also checks the current main-load generation. Added a regression that fails before this fix and passes afterwards; full suite is 299 tests.
- Browser drawing checks now explicitly wait for the fullscreen loading mask to disappear before interacting. Await a real-browser rerun of this change before claiming drawing acceptance.
- EvoTrader consumer branch fix/trading-chest-stage1 contains the reactive bridge, chart disposal and associated tests. Commit a016d392 regenerates the stale frontend lock using npm and pins fd36ab39. Clean installation with ignore-scripts passed in the root workspace; full consumer installation, typecheck, tests and build are being independently checked.
- Neither repository has been merged to main. No publication or live trading is part of these checks.

## Accepted checkpoint: 2026-10-14 05:43 UTC
- Product source at 7a8abbd5 passed 299 tests and complete build. At 9d695644 only the browser test changed: distinct drawing clicks are spaced beyond the engine's 500 ms double-click window; product source is identical.
- Both browser scripts now pass: three real drawings, Escape preservation, selected drawing deletion, editable input protection, system overlay preservation, lifecycle/replay isolation and built-bundle widget updates. Test executor reported clean tracked files and stopped Vite.
- EvoTrader d3d76296 passed clean frontend npm ci, separate submodule npm ci/build, three Node build-gate tests, typecheck, 22 targeted tests and full frontend build (37 static pages). The initial Babel dependency-resolution failure was resolved by the documented separate submodule install; preserve that install step.
- This is an accepted incremental batch, not completion of the entire upgrade. Remaining: legacy global click migration, symbol scoping of alerts, repeated/multi-chart and performance coverage, and the later packaging/data-contract/session-VWAP stages.
- No live trading or npm publication performed.
