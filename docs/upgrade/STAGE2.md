# Stage two: incremental implementation

## Abortable history requests
`Datafeed.getHistoryKLineData` accepts an optional fifth `DatafeedRequestContext` argument with `signal` and `reason` (`initial`, `load-more`, `resume`). Existing four-argument implementations remain compatible. A provider must pass the signal to its transport to stop actual I/O; ignoring it retains stale-result protection but cannot cancel network activity. Each chart owns its controllers. Do not share a legacy single-callback provider between charts.

Symbol/period changes, replay entry and disposal abort old work. Pagination has a separate controller so it does not invalidate initial-load cleanup. Cancellation/stale errors are not reported as new current-request failures. The default example adapter links request cancellation to its existing timeout and removes timer/listener resources on completion. Its protocol/error-state redesign remains separate work.

## Framework subentries (acceptance pending)
- `trading-chest/chart`: chart engine wrapper, datafeed, replay, alerts, export and layout utilities; no React import.
- `trading-chest/solid`: analytical Solid widgets and mounting helper. Subentries externalize Solid so host signals and widgets use the same resolved runtime. Avoid bundling a second incompatible Solid copy.
- `trading-chest/react`: the two existing React analytical components.
- Root exports and `trading-chest/dist/trading-chest.css` remain supported. Root ESM/UMD still includes legacy React exports, so root users still need React. React is an optional peer specifically to permit chart-only consumers.
- Subentries provide ESM, CommonJS and declaration files. Charts are browser components; CommonJS format is not a promise of DOM-free server rendering.

`npm run build` produces legacy bundles plus subentries and declarations. `npm run test:package` installs an actual `npm pack` tarball in a temporary fixture, checks chart-only installation without React, shared Solid signals, declaration resolution, React 18.3.1/19.2.3 rendering, legacy ESM/UMD/CJS exports and CSS paths. This installs test dependencies but does not publish a package.

## Not yet delivered
Data provenance/status metadata, strict default-provider protocol handling, layout v2 migration, explicit session VWAP and measured performance budgets remain pending. No market-data account or trading action is used in validation.
