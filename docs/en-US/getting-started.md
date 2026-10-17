# Getting started

TradingChest is a general browser chart library. Hosts own market data, analytical inputs, persistence and business actions; no EvoTrader service is required.

## Install

```bash
npm install trading-chest@0.7.0 klinecharts@10.1.0
```

Use `trading-chest/chart` for charts without React. Existing analytical components use `trading-chest/react` or `trading-chest/solid`; Solid hosts share the runtime with the library. KLineChart is pinned to 10.1.0. Raw Node chart imports are outside the SSR support contract.

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

## Standalone example

The [analysis-sdk example](https://github.com/evotrader/TradingChest/tree/main/examples/analysis-sdk) installs an actual tarball and uses public exports to demonstrate external indicators, separate instances, lines/histograms/bands/events, an ordered label panel, replay and layouts. Its deterministic data is explicitly isolated and requires no backend or credentials. Copy it outside this repository to run and build it. Supply a real datafeed for production; example data is never a fallback.

See the [API](./api#generic-indicator-catalog-and-instances) and [0.6.0 migration guide](./upgrade/0.7.0). Local verification: `npm ci`, `npm run build`, `npm run test:package`, `npx playwright install chromium`, `npm run test:browser`, then `npm run docs:build`. The browser runner chooses a free port, starts Vite and cleans up its own processes. JSON, logs and traces are retained under `test-results/`.
