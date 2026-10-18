# React / Next.js / Vue integration

Implement the host adapter using the [data contract](./data-access). `host`, `symbol`, `period`, `symbols` and `getPeriods` below are real host-owned inputs, not built-in market data. Every container needs a definite height. Runnable examples explicitly label their isolated synthetic inputs.

## React chart

```bash
npm install trading-chest@0.9.0 klinecharts@10.1.0 react@19.2.3 react-dom@19.2.3
```

The integration matrix pairs React/ReactDOM **18.3.1/18.3.1** and **19.2.3/19.2.3**. Do not mix major versions. Pure `chart` and `testing` consumers do not need React or ReactDOM.

```tsx
import {useRef} from 'react'
import {TradingChart} from 'trading-chest/react'
import type {ChartPro} from 'trading-chest/chart'
import 'trading-chest/dist/trading-chest.css'

export function PriceChart() {
  const chart = useRef<ChartPro>(null)
  return <TradingChart
    ref={chart}
    height={600}
    initialOptions={{symbol, period}}
    createDatafeed={signal => host.createDatafeed(signal)}
    theme="dark"
    locale="en-US"
    aria-label="Price chart"
    onReady={instance => {
      // The ref is already installed; data may still be loading.
      console.log(instance.getSymbol().ticker)
    }}
    events={{onDataReady: () => {
      const context = chart.current?.getAnalysisContext()
      if (context) host.publishAnalysis(context)
    }}}
  />
}
```

Each call to `host.createDatafeed(signal)` must return a separate feed; never return a shared singleton. The wrapper disposes failures, cancellation and late results before handoff. After successful handoff, the chart owns disposal. Unmount cancels initialization, disposes the chart and clears the ref. This must also work through the additional setup/cleanup performed by development StrictMode.

`initialOptions` is a mount snapshot: initial symbol/period, catalogs, drawing commit policy and comparison factories. Apply new initialization settings through a new React `key`. Ordinary rerenders do not reverse users' in-chart symbol/period selections. Use `chart.current?.setSymbol(...)` or `setPeriod(...)` for imperative runtime changes.

`theme`, `locale`, `timezone`, `styles` and `height` are presentation props. Updates call the existing setters/resize without rebuilding market data. Styles merge; omission keeps prior values. Use a new key for a complete reset. Notifications in `events` use the latest committed React callbacks while initialization policies retain their original snapshot. Suspended or cancelled renders never replace the active instance's callbacks; workspace notifications follow the same rule.

`onReady` means the instance exists and its ref is installed. `events.onDataReady` means real history has been applied. Initialization errors show retry and call `events.onError`; retry creates a fresh feed. History errors and `retryData()` retain the chart's original behavior. Instance readiness does not confirm data.

## React workspace

```tsx
import {useRef} from 'react'
import {TradingChart, TradingWorkspace} from 'trading-chest/react'
import type {ReactWorkspaceCellProps} from 'trading-chest/react'
import type {ChartPro} from 'trading-chest/chart'

function Cell({cell, height, onReady, onError}: ReactWorkspaceCellProps) {
  const chart = useRef<ChartPro>(null)
  return <TradingChart
    ref={chart}
    height={height}
    initialOptions={{symbol: cell.symbol, period: cell.period}}
    createDatafeed={signal => host.createDatafeed(signal)}
    events={{
      onDataReady: () => {
        if (chart.current) onReady({chart: chart.current})
      },
      onError: error => onError(new Error(error.message))
    }}
  />
}

export function Workspace() {
  return <TradingWorkspace
    height={900}
    initialOptions={{
      context: 'my-chart-view', symbols,
      initialSymbol: symbol, initialPeriod: period, getPeriods
    }}
    createStore={async () => {
      const {createIndexedDBWorkspaceStore} = await import('trading-chest/chart')
      return createIndexedDBWorkspaceStore({databaseName: 'my-workspaces'})
    }}
    renderCell={props => <Cell {...props}/>}
  />
}
```

Cells render through portals and retain parent React Context. Do not create separate React roots for them. The `signal` in `renderCell` identifies this binding's lifetime; after cancellation/removal/failed staging, obsolete `onReady` callbacks cannot hand off results.

After actual data application, a cell calls `onReady({chart,captureOptions?})`; later confirmed applications may call it again. For persistent drawings, supply actual `localDrawingIds`/backend `annotationRefs` through `captureOptions`. Do not copy the omitted example field and lose business references. Runtime analytical layers and market data stay outside layouts.

`store={sharedStore}` borrows a store without closing it. `createStore(signal)` creates an owned store for every mount and must return a store with `dispose():void`, synchronously or asynchronously. The wrapper closes it after workspace/cell cleanup, including late results. These props are mutually exclusive. Without either, storage management is disabled. Shared-store owners close it after every borrower unmounts.

context, catalogs, initial symbol/period, getPeriods and toolbar are initialization snapshots; use a key for business identity changes. locale/theme/height update dynamically. `height="100%"` requires a definite parent height. `onLayoutChange` lets the host choose its height while the workspace retains layout authority. The ref is the original ChartWorkspace, exposing [named save/load methods](./api#workspace-storage-api).

## Next.js App Router

The React entry preserves `use client` and can be imported and rendered with `renderToString` in Node without window/document. It renders a stable initial container; Canvas/Solid core load in client effects. The integration target is Next **16.2.1**, without consumer Solid aliases or transpilePackages.

Declare function factories inside a Client Component. A Server Component must not pass them as ordinary serializable props:

```tsx
// app/chart/PriceChart.tsx
'use client'
import {TradingChart} from 'trading-chest/react'
import {createHostDatafeed, symbol, period} from './host-data'

export default function PriceChart() {
  return <TradingChart
    height={600}
    initialOptions={{symbol, period}}
    createDatafeed={signal => createHostDatafeed(signal)}
  />
}
```

```tsx
// app/chart/page.tsx — Server Component
import PriceChart from './PriceChart'
export default function Page() { return <PriceChart/> }
```

Import `trading-chest/dist/trading-chest.css` in `app/layout.tsx`. Route departure unmounts the browser component normally. Do not initialize chart/root/UMD entries on the server; those entries do not promise SSR/server-side Canvas. The Next example requires `next build` plus `next start` and a Node server. A static Pages upload cannot substitute for server validation.

## Vue 3 Composition API

This release demonstrates the existing chart entry without adding a Vue runtime wrapper or peer. Dynamically import/create in `onMounted`, cancel/dispose in `onUnmounted`, and release a late factory result too:

```vue
<script setup>
import {ref, onMounted, onUnmounted} from 'vue'
import 'trading-chest/dist/trading-chest.css'
import {createHostDatafeed, symbol, period} from './host-data'
const container = ref(null)
const error = ref('')
const controller = new AbortController()
let chart
onMounted(async () => {
  let pendingFeed
  try {
    const {KLineChartPro} = await import('trading-chest/chart')
    if (controller.signal.aborted) return
    pendingFeed = await createHostDatafeed(controller.signal)
    if (controller.signal.aborted) { pendingFeed.dispose?.(); return }
    chart = new KLineChartPro({container: container.value, symbol, period, datafeed: pendingFeed})
    pendingFeed = undefined
  } catch (reason) {
    pendingFeed?.dispose?.()
    if (!controller.signal.aborted) error.value = String(reason)
  }
})
onUnmounted(() => { controller.abort(); chart?.dispose() })
</script>
<template>
  <p v-if="error" role="alert">{{error}}</p>
  <div ref="container" style="height:600px"/>
</template>
```

## Standalone examples and site

The [demo index](/demos/) links static demos in the same deployment artifact. Keep the synthetic-input labels. Each source example has its own package.json/lock and installs the same `npm pack` tarball outside this repository. During 0.9.0 source validation, build/install that tarball first; versioned instructions do not claim that a release has already been published.

| Source | Purpose |
| --- | --- |
| [analysis-sdk](https://github.com/evotrader/TradingChest/tree/main/examples/analysis-sdk) | Both existing JS pages: analytical index.html and data-workspace.html |
| [react-vite](https://github.com/evotrader/TradingChest/tree/main/examples/react-vite) | React chart/workspace, Context, StrictMode, periods, retry, save/load and unmount |
| [next-app](https://github.com/evotrader/TradingChest/tree/main/examples/next-app) | App Router prerendering, hydration and navigation with a local Node server |
| [vue-vite](https://github.com/evotrader/TradingChest/tree/main/examples/vue-vite) | Vue 3 dynamic chart creation, switching and cleanup |
| [datafeed-contract](https://github.com/evotrader/TradingChest/tree/main/examples/datafeed-contract) | React-free Node adapter and contract-test template |

Maintainers run `npm ci`, `npm run build`, then `npm run docs:site` to merge docs and tarball-consuming static demos into `website/`. `npm run docs:build` builds docs only. Mount the complete artifact at `/TradingChest/`; no production backend is required. `npm run test:site` checks the same directory under that prefix. A local build does not mean Pages is configured or publicly deployed. `.github/workflows/deploy-docs.yml` uses the official Pages artifact/deploy workflow; public publishing requires maintainer authorization.


The complete static artifact provides a downloadable Next.js source archive in the [demo index](/demos/), including the matching TradingChest tarball and independent lock. Extract it, enter next-app, and run npm ci, npm run build, and npm start. Next.js still requires a Node server.
