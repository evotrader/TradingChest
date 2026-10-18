# Getting started

TradingChest is a general browser chart library. Hosts own market data, analytical inputs, persistence and business actions; no EvoTrader service is required.

## Install

```bash
npm install trading-chest@0.9.0 klinecharts@10.1.0
```

This page describes the 0.9.0 source contract. Before publication, run `npm ci && npm run build`, then `npm pack` in the source checkout and install the actual tarball. Versioned instructions do not claim public publication.

Use `trading-chest/chart` without React. New TradingChart/TradingWorkspace and existing React analytical components use `trading-chest/react`; install paired React/ReactDOM 18.3.1 or 19.2.3. Solid analytical components use `trading-chest/solid` with a shared host runtime. KLineChart is pinned to 10.1.0. Only the React/testing entries add DOM-free Node import support; root/chart/UMD do not promise SSR. See [framework integration](./frameworks) for lifecycle, Next Client Component factories and Vue.

## Create and dispose

Give the container an explicit height. Implement `datafeed` using the [data contract](./data-access), and obtain `symbol` and `period` from your host's valid catalog:

```typescript
import {KLineChartPro} from 'trading-chest/chart'
import 'trading-chest/dist/trading-chest.css'

const chart = new KLineChartPro({
  container: document.getElementById('chart')!,
  symbol,
  period,
  datafeed,
  onDataReady: () => {
    const context = chart.getAnalysisContext()
    if (!context) return
    // Bind host snapshots to this confirmed context.
  }
})
// Call when the host component unmounts.
chart.dispose()
```

The root entry retains chart exports. CJS browser entrypoints and UMD assets remain available. For script tags, load the pinned KLineChart UMD peer before `trading-chest/dist/trading-chest.umd.js` and its CSS. The library global is `tradingchest`. The root UMD also contains React analytical components, so provide React as required by that entry.

## Standalone examples

The [demo index](/demos/) links static examples in the local site artifact. The [framework guide](./frameworks#standalone-examples-and-site) lists independent react-vite, next-app, vue-vite and datafeed-contract examples. Next needs a Node server and is not deployed as a static demo.

The [analysis-sdk example](https://github.com/evotrader/TradingChest/tree/main/examples/analysis-sdk) installs an actual tarball and uses public exports to demonstrate external indicators, separate instances, lines/histograms/bands/events, an ordered label panel, replay and layouts. Its deterministic data is explicitly isolated and requires no backend or credentials. Copy it outside this repository to run and build it. Supply a real datafeed for production; example data is never a fallback.

The example's separate `/data-workspace.html` entry demonstrates 0.8.0 before/countBack initialization, range reload, state/retry and named workspaces backed by actual IndexedDB. Its market inputs remain explicitly isolated synthetic data; saved records are real local-browser persistence. `/index.html` retains the analytical-layer example. Neither page requires a backend or credentials.

## Inject a workspace store

```typescript
import {ChartWorkspace,createIndexedDBWorkspaceStore} from 'trading-chest/chart'

const store = createIndexedDBWorkspaceStore({databaseName:'my-chart-workspaces'})
const workspace = new ChartWorkspace({
  container:document.getElementById('workspace')!, height:900,
  context:'my-chart-view', symbols, initialSymbol:symbol, initialPeriod:period,
  getPeriods, mountCell, store
})
await workspace.listSaved()
// Each mountCell owns a provider and resolves ready after data is applied.
// Save manually; load a selected ID returned by listSaved().
const saved = await workspace.saveAs('My view')
await workspace.load(saved.id)
// On host unmount, release borrowers before their owned store.
workspace.dispose()
store.dispose()
```

symbols/getPeriods/mountCell are host-owned catalog/factory functions; the standalone example supplies a runnable implementation. Without a store, management is disabled; failures never fall back to another store. `importLegacy(name)` only creates an optional record, requiring explicit selection/load, and preserves original keys.

See [React APIs](./api#react-component-apis-0-9-0), the [0.9.0 migration](./upgrade/0.9.0), [storage API](./api#workspace-storage-api), [0.8.0 migration from 0.7.0](./upgrade/0.8.0) and [earlier analysis SDK migration](./upgrade/0.7.0). Local verification: `npm ci`, `npm run build`, `npm run test:package`, `npx playwright install chromium`, `npm run test:browser`, then `npm run docs:build`. The browser runner chooses a free port, starts Vite and cleans up its own processes. JSON, logs and traces are retained under `test-results/`. These commands do not claim validation of every host environment.

Run `npm run docs:site` for the complete docs/static-demo artifact in `website/`, mounted at `/TradingChest/`. `npm run test:integration` checks package consumers; `npm run test:site` checks that same site artifact. Docs builds/local checks do not establish public deployment.
