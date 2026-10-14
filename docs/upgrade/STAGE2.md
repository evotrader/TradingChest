# Stage two: incremental implementation

## Abortable history requests
`Datafeed.getHistoryKLineData` accepts an optional fifth `DatafeedRequestContext` argument with `signal` and `reason` (`initial`, `load-more`, `resume`). Existing four-argument implementations remain compatible. A provider must pass the signal to its transport to stop actual I/O; ignoring it retains stale-result protection but cannot cancel network activity. Each chart owns its controllers. Do not share a legacy single-callback provider between charts.

Symbol/period changes, replay entry and disposal abort old work. Pagination has a separate controller so it does not invalidate initial-load cleanup. Cancellation/stale errors are not reported as new current-request failures. The default example adapter links request cancellation to its existing timeout and removes timer/listener resources on completion. Its protocol/error-state changes are described below.

## Framework subentries
- `trading-chest/chart`: chart engine wrapper, datafeed, replay, alerts, export and layout utilities; no React import.
- `trading-chest/solid`: analytical Solid widgets and mounting helper. Subentries externalize Solid so host signals and widgets use the same resolved runtime. Avoid bundling a second incompatible Solid copy.
- `trading-chest/react`: the two existing React analytical components.
- Root exports and `trading-chest/dist/trading-chest.css` remain supported. Root ESM/UMD still includes legacy React exports, so root users still need React. React is an optional peer specifically to permit chart-only consumers.
- Subentries provide ESM, CommonJS and declaration files. Charts require browser bundling (or the browser UMD build); raw Node imports are not supported. KLineCharts 9.8.12 has a raw Node CJS-to-UMD packaging defect, so adding a DOM shim alone does not make its Node entry valid. The acceptance fixture resolves the actual packed ESM/CJS exports with a browser bundler and tests UMD with the engine's browser UMD script. React-only subentries remain independently usable by the host renderer.

`npm run build` produces legacy bundles plus subentries and declarations. `npm run test:package` installs an actual `npm pack` tarball in a temporary fixture, checks chart-only installation without React, shared Solid signals, declaration resolution, React 18.3.1/19.2.3 rendering, legacy browser-bundled ESM/CJS, browser UMD exports and CSS paths. This installs test dependencies but does not publish a package.

## Opt-in validated sessions
`createSessionDatafeed(provider, { onStatus, onRevisionRequired })` adapts a new per-chart `DataSession` to the original `Datafeed`. `SeriesIdentity` explicitly includes source, ticker, market, exchange, currency, multiplier, timespan, adjustment, session filter and timezone. History batches and stream updates must match the same immutable identity. Missing required identity or malformed OHLCV rejects the data; no forward fill is performed. Duplicate timestamps within a history batch use its last supplied correction and are sorted ascending.

History distinguishes `ready`, `empty` and `partial`, carrying provider `sourceTimestamp` and optional `delayMs`. Neither a timestamp nor connected socket proves executable freshness. Cancellations do not become empty markets. Each adapter owns its subscription generation and session disposal; instantiate one per chart even when sharing a provider factory. Old historical revisions go to `onRevisionRequired` and status `revision-required`; hosts must reconcile/reload them. They are not appended as new bars. The legacy chart path also rejects older timestamps before live alert evaluation and reports `historical-revision` via `onError`.

EvoTrader continues using its existing custom provider with cancellation wired through to HTTP. It does not invent adjustment/session/provenance fields absent from its backend response. Adoption of the richer session adapter requires those verified backend fields.

## Layout v2, explicit persistence ownership
`saveLayoutV2` / `loadLayoutV2` are opt-in standalone utilities. Nothing automatically writes a chart or EvoTrader backend annotation to localStorage. V2 stores indicator parameters/placement, overlay IDs/styles, pane geometry/order, appearance and explicit instrument/period/adjustment/session context.

`loadLayoutV2` reads the new `trading-chest-layout-v2-` key first; only when it is absent does it migrate v1 in memory. Reads never write. Saving v2 leaves the old v1 key unchanged for rollback. Corrupt v2 does not silently fall back to stale v1. Unknown v1 parameters/panes/context remain omitted rather than fabricated. Existing v1 functions remain available; v1 listing excludes new-version records.

Only plain finite JSON data is accepted. Functions, runtime objects, cycles, unsupported top-level fields and conventional credential keys are rejected. This is not a secret scanner: hosts must pass only the declared chart-state fields, never credentials or provider configuration. Migration returns a detached copy.

## Explicit session VWAP
The old `VWAP` algorithm is unchanged. New opt-in indicator names are `SESSION_VWAP` (turnover / volume) and `SESSION_VWAP_APPROX` (OHLCV typical-price weighting), with visibly distinct short names/tooltips. `calculateSessionVwap` is also exported.

Providers supply a `session` object per bar: `seriesId` (for example `seriesIdentityKey(identity)`), exchange session `id`, `start` (first eligible bar of the entire session, not the loaded window), and `complete` (reliable coverage and compatible volume/amount units). There is no UTC-date guess or exchange-calendar inference. Missing opening coverage, unreliable data or invalid amount/volume creates an unavailable value until a known new session. Lunch breaks and overnight civil dates can share one identity; DST schedules belong to the provider. Leading zero volume yields unavailable until actual volume; no exact-to-approximate fallback occurs. Duplicate/out-of-order bars must be reconciled before calculation.

EvoTrader does not enable either indicator automatically because the current OHLCV endpoint does not establish these session/turnover guarantees.

## Default example provider boundary
The example Polygon-compatible adapter now distinguishes aggregate (`AM`) events from individual trades (`T`), handles all events in a batch, filters the current ticker and reauthenticates before subscribing. It only streams stocks / one minute / `adjusted:false`. Unsupported markets, periods or split-adjusted histories are explicitly history-only with a failed connection-state explanation; no multi-market/calendar aggregator is claimed. The historical split-adjusted default remains unchanged and is sent explicitly. HTTP, permission, malformed and paginated history responses reject rather than becoming an empty market. Narrow a paginated request or use a fully paginating provider.

The provider's `vw` is a VWAP price, not traded turnover; it is exposed as `providerVwap`, never passed off as `turnover`. Delayed endpoint URLs remain delayed. No credentials/accounts/network trades are involved in tests.

Protocol references checked 2026-10-14:
- https://www.massive.com/docs/rest/stocks/aggregates/custom-bars
- https://www.massive.com/docs/websocket/stocks/aggregates-per-minute
- https://massive.com/knowledge-base/article/how-can-i-connect-to-a-massive-websocket

## Acceptance and remaining rollout
Verified on 2026-10-14 at product commit `0b8b150146bc001b5a6bdce26caf7370d24f84a8`:
- Clean library installation, all 351 tests across 34 files, and complete JS/declaration build passed.
- Actual online `npm pack` installation acceptance passed using the test-only correction `7f1db90405c8be342ffff6f151ad3e6f2acf93a2`: browser-bundled ESM/CJS chart consumers without React, shared Solid updates, declaration resolution, React 18.3.1 and 19.2.3 rendering, legacy browser UMD and CSS paths.
- The initial raw Node chart import failed in the upstream KLineCharts packaging path. Raw Node chart imports remain explicitly unsupported; browser bundling and UMD are the supported chart execution paths.
- Final local Chrome lifecycle and widget scripts passed (09:17:45 / 09:17:39 UTC). EvoTrader consumer `042077a90ba070ed053d7f1e9d45dd17cced4c56`, pinned to the product commit above, passed clean frontend and submodule installations, six build-gate tests, five target files / 34 tests, typecheck and full build (37 pages, completed 09:18:35 UTC). All exit codes were zero.
- Local environment: macOS, Chrome 154.0.8037.99, Node 24.15.0. Both independent clones and the consumer submodule remained clean; test Vite was stopped. The final package fixture was verified separately by the root assistant, not rerun locally. Final documentation/gitlink-only commits do not change tested product code.
 No npm release has been published. Performance budgets are still unmeasured candidates. Rich backend provenance/session adoption and automatic layout capture/restore are not silently enabled by these opt-in utilities.
