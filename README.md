<h1 align="center">TradingChest</h1>
<p align="center">Open-source market charts, analytical layers and multi-chart workspaces. Built on KLineChart; data and business logic stay with the host.</p>

<div align="center">

[![Version](https://badgen.net/npm/v/trading-chest)](https://www.npmjs.com/package/trading-chest)
[![Typescript](https://badgen.net/badge/types/TypeScript/blue)](dist/index.d.ts)
[![License](https://badgen.net/badge/license/Apache-2.0/green)](LICENSE)

**English** | [中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

</div>

<p align="center">
  <img src="docs/public/image.png" alt="TradingChest Screenshot" width="800" />
</p>

## 0.16.0 local candidate

Both Fib tools can bind an alert to one confirmed stable level. Third-party tools declare the same capability through an instance catalog and pure resolver. Legacy arrays require explicit initialization; V2 alert documents migrate V1 purely and preserve unavailable sources as disabled rules. See [0.16 migration](docs/en-US/upgrade/0.16.0.md). This candidate is not published; use an actual local tarball to try it. Published installation remains 0.15.0.

## 0.15.0 published

The two Fib tools gain stable-ID level tables, per-level text, linear/log calculation and explicit rendering options. Favorites, recent tools, continuous drawing, pre-draw templates and configurable snap sources improve the drawing workflow. Generic third-party level-set capabilities use the same public helpers and editor. Preferences migrate from v1 to v2; layout/workspace/shared schemas and the 56-tool catalog remain unchanged. Local functional, package/framework, real-backend and performance checks passed, including all 172 performance obligations under the approved post-audit limits and both 100-cycle cleanup workloads. Version 0.15.0 is published on npm. See [0.15 migration](docs/en-US/upgrade/0.15.0.md).

## 0.14.0 local candidate

Seven existing line/channel/rectangle tools gain attached text. A stable-ID overlap picker and explicit bar/price/tick translation support dense drawing edits; third-party tools declare the same capabilities. Text, changes and persistence use the existing confirmation and undo paths. The catalog stays at 56 tools, KLineCharts at 10.1.0, and document schemas remain unchanged. See [0.14 migration](docs/en-US/upgrade/0.14.0.md) and [drawing usage](docs/en-US/drawings.md#drawing-expressiveness). Local acceptance is complete under the approved performance budgets. This candidate has not been published to npm; the pinned installation below remains the published stable version.

## 0.13.0 local candidate

Drawing alerts add observed-close crossings for four confirmed chart-local line tools, separate live/replay state, portable documents and a DOM-free `trading-chest/alerts` evaluator. Curves add endpoint markers and chord-closed backgrounds. Rules are in memory by default; layout-only saves do not include alerts, and closing the page stops monitoring. See [0.13 migration](docs/en-US/upgrade/0.13.0.md). This is a local candidate; the pinned npm installation below remains the published stable version until a separate release.

## 0.12.0 drawing refinement

A shared single/multiselection editor uses declared style capabilities and mixed values. Anchored VWAP adds up to three explicit deviation/percentage bands; FRVP adds display-only placement and level styles. Three screen-projected curve tools bring the catalog to 56. A peer `registerOverlay` example demonstrates generic third-party tools. See [0.12 migration](docs/en-US/upgrade/0.12.0.md) and [drawing usage](docs/en-US/drawings.md). Existing datafeed and document formats remain unchanged; local candidate artifacts do not imply npm publication.

## 0.11.0 volume drawings

Anchored VWAP and fixed range volume profiles use each chart’s confirmed OHLCV, with explicit sampling and coverage limits. A virtualized object tree adds collapsible groups and confirmed drag/keyboard reordering. The catalog contains 53 tools. See [0.11 migration](docs/en-US/upgrade/0.11.0.md) and the [volume drawing contract](docs/en-US/drawings.md#volume-drawings). Local builds do not imply npm publication.

## 0.10.0 drawing workbench

A unified 51-tool catalog, multiline text, precise handles and coordinates, multiselection/groups, templates/preferences and explicit local/workspace/host sharing. Backend writes retain their original confirmation authority. New layouts use ChartLayoutV4 and WorkspaceDocument v2; legacy originals are preserved during migration. See [drawing usage](docs/en-US/drawings.md), [migration](docs/en-US/upgrade/0.10.0.md) and the [standalone example](examples/drawing-workbench). This is the source contract; local artifacts do not imply publication or complete TradingView parity.

## 0.9.0 framework integration

`trading-chest/react` adds TradingChart and TradingWorkspace with explicit per-mount datafeed ownership, cancellation, Context-preserving portals and borrowed/owned store lifecycles. React/ReactDOM 18.3.1 and 19.2.3 are paired integration targets. The React entry preserves `use client` and supports DOM-free Node imports/renderToString; Canvas is initialized on the client. Next.js factories belong inside Client Components. Pure chart/testing consumers do not need React.

`trading-chest/testing` reuses production history validators without DOM, Solid or React. Validators do not copy/freeze responses or prove data provenance/exhaustion. Before/countBack and complete-range history, confirmed state/retry, named stores, analytical snapshots and existing layout formats retain their 0.8.0 contracts. The engine remains pinned to **10.1.0**.

See [getting started](docs/en-US/getting-started.md), [React / Next / Vue](docs/en-US/frameworks.md), [0.9.0 migration](docs/en-US/upgrade/0.9.0.md), [data access](docs/en-US/data-access.md) and [API](docs/en-US/api.md). Source examples are [analysis-sdk](examples/analysis-sdk/README.md), [react-vite](examples/react-vite), [next-app](examples/next-app), [vue-vite](examples/vue-vite) and [datafeed-contract](examples/datafeed-contract). Both original analysis-sdk pages remain. Examples use explicitly isolated synthetic inputs, require no EvoTrader backend/credentials and never act as production fallbacks.

This describes the 0.9.0 source contract. Local source/tarball validation does not imply npm publication or a publicly deployed Pages site. Before publication, build and install the actual `npm pack` tarball.

## Features

### Technical Indicators (73+)

| Category | Count | Examples |
|----------|-------|----------|
| Trend | 21 | MA, EMA, BOLL, Ichimoku, SuperTrend, Alligator, KAMA, HMA... |
| Volatility | 9 | Keltner Channels, Donchian Channels, ATR, Bollinger Band Width... |
| Volume | 12 | VOL, VWAP, MFI, CMF, Klinger Oscillator, Elder Ray... |
| Momentum | 26 | MACD, RSI, KDJ, StochRSI, ADX, Aroon, Fisher Transform, PPO... |
| Other | 2 | Pivot Points, ZigZag |

- Category tabs for quick filtering (Trend / Volatility / Volume / Momentum / Other)
- Real-time search filtering
- Customizable indicator parameters
- Lazy-loaded indicator registration for faster startup

### Drawing Tools (56)

| Category | Tools |
|----------|-------|
| Lines | Horizontal, Vertical, Trend, Ray, Segment, Arrow, Price Line, Parallel, Price Channel |
| Fibonacci | Retracement, Segment, Circle, Spiral, Speed Resistance Fan, Trend Extension |
| Waves | 3-Wave, 5-Wave, 8-Wave, Any-Wave, ABCD, XABCD |
| Geometry | Circle, Rectangle, Triangle, Parallelogram |
| Patterns | Andrew's Pitchfork, Schiff Pitchfork, Linear Regression, Regression Channel, Gann Box |
| Measurement | Price Range, Time Range, Combined Measurement |
| Annotations | Text Label, Annotation Bubble, Sticky Note, Freehand Drawing |
| Volume | Anchored VWAP, Fixed Range Volume Profile (current-period OHLCV estimates) |
| Trading | Long / Short Position (Entry / Stop-loss / Take-profit visualization + Risk/Reward ratio) |

- Hover tooltip on all tools
- Text tools support inline editing + right-click edit
- Seven line/channel/rectangle tools support optional attached text; templates retain styles and parameters without copying the body
- Right-click or touch-and-hold selects overlapping drawings; the drawing manager translates eligible objects by real loaded bars, price values or explicit ticks
- **Floating property toolbar on selected drawing** (TradingView-style):
  - 9×8 color palette (72 colors)
  - Line width selector (1–4px visual preview)
  - Line style selector (solid / dashed / dotted)
  - Lock / Delete quick buttons

### Chart Types (8)

Candle Solid, Candle Hollow, Up Hollow, Down Hollow, OHLC, Area, **Heikin Ashi**, **Baseline**

### Price Alerts

- Add / remove alert lines at specific prices
- Callback when price crosses alert level
- Visual overlay on chart
- Works in both live and replay modes

### Symbol Comparison

- Overlay additional symbols normalized to percentage change
- Automatic cross-symbol timestamp alignment

### Bar Replay

- Replay historical data bar-by-bar
- Play / Pause / Step Forward / Step Backward / Go To Position
- Adjustable speed (0.5×–16×)
- Alert system active during replay

### Trade Visualization

- Overlay buy/sell markers on the chart from trade records
- Click detection on trade markers with callback
- Integrates with `IndicatorClickDetector`

### Settings Panel

- Candle type selection
- Up / Down color customization (color picker)
- Price axis type (Linear / Percentage / Logarithmic)
- Crosshair visibility (Horizontal / Vertical independent control)
- Grid lines, High / Low markers, Tooltip type
- Grouped settings (Candle / Axis / Grid & Crosshair)

### Other

- **Keyboard Shortcuts**: 15+ default bindings (Alt+T trend line, Alt+F Fibonacci, etc.), fully customizable
- **5 Theme Presets**: Dark, Light, Midnight Blue, Classic (TradingView-style), High Contrast
- **Data Export**: CSV (visible range / all data), Screenshot (PNG / JPEG)
- **Layout Persistence**: Single-chart localStorage layouts; named workspace CRUD via injected asynchronous stores / IndexedDB
- **i18n**: Chinese (zh-CN), English (en-US)
- **Timezone**: 14 timezone support

## Install

```bash
npm install trading-chest@0.15.0 klinecharts@10.1.0
```

## React usage

Install paired `react` and `react-dom` (18.3.1 or 19.2.3), then:

```tsx
import {TradingChart} from 'trading-chest/react'
import 'trading-chest/dist/trading-chest.css'

// symbol, period and createHostDatafeed belong to your host adapter.
<TradingChart
  height={600}
  initialOptions={{symbol, period}}
  createDatafeed={signal => createHostDatafeed(signal)}
  theme="dark"
/>
```

The factory creates a separate feed for each mount, including StrictMode. `initialOptions` is a mount snapshot; use a new key to replace it. Presentation props update through existing setters. `onReady` means the instance exists with its ref installed; `events.onDataReady` means history was actually applied. See the framework guide for complete workspace, Next and Vue lifecycles. The new wrappers are only in the React subpath; original root analytical exports remain.

## Browser usage

```typescript
import { KLineChartPro } from 'trading-chest/chart'
import 'trading-chest/dist/trading-chest.css'

// hostHistory is the host adapter described in the data-access guide.
const chart = new KLineChartPro({
  container: document.getElementById('chart'),
  symbol: {
    ticker: 'BTC-USDT',
    name: 'Bitcoin',
    exchange: 'Binance',
    pricePrecision: 2,
    volumePrecision: 4,
  },
  period: { multiplier: 1, timespan: 'day', text: '1D' },
  datafeed: {
    searchSymbols: search => hostHistory.searchSymbols(search),
    getHistoryKLineData: async (symbol, period, query, context) => {
      // Read actual host history; confirm exhaustion only from provider evidence.
      return hostHistory.read(symbol, period, query, context?.signal)
    },
    subscribe: (symbol, period, callback) => hostHistory.subscribe(symbol, period, callback),
    unsubscribe: (symbol, period) => hostHistory.unsubscribe(symbol, period),
  },
  theme: 'dark',
  locale: 'en-US',
})

// Don't forget to dispose when done
// chart.dispose()
```

## API

### Constructor Options

```typescript
interface ChartProOptions {
  container: string | HTMLElement
  symbol: SymbolInfo
  period: Period
  datafeed: Datafeed
  styles?: DeepPartial<Styles>
  watermark?: string | Node
  theme?: string              // default: 'light'
  locale?: string             // default: 'zh-CN'
  drawingBarVisible?: boolean // default: true
  periods?: Period[]
  timezone?: string           // default: 'Asia/Shanghai'
  mainIndicators?: string[]   // default: ['MA']
  subIndicators?: string[]    // default: ['VOL']
  onIndicatorClick?: (event: IndicatorClickEvent) => void
  onAlertTrigger?: (event: AlertEvent) => void
}
```

### Instance Methods

```typescript
// Theme
chart.setTheme('dark' | 'light')
chart.getTheme(): string

// Styles
chart.setStyles(styles: DeepPartial<Styles>)
chart.getStyles(): Styles

// Locale
chart.setLocale('zh-CN' | 'en-US')
chart.getLocale(): string

// Timezone
chart.setTimezone('Asia/Shanghai')
chart.getTimezone(): string

// Symbol / Period
chart.setSymbol(symbol: SymbolInfo)
chart.getSymbol(): SymbolInfo
chart.setPeriod(period: Period)
chart.getPeriod(): Period

// Internal chart instance (for custom overlay operations)
chart.getChart(): Chart | null

// Data Export
chart.exportCSV(filename?: string)
chart.exportAllCSV(filename?: string)
chart.exportScreenshot({ format?, backgroundColor?, filename? })

// Keyboard Shortcuts
chart.getShortcutManager(): KeyboardShortcutManager

// Alerts
chart.addAlert({ id, price, condition, color? })
chart.removeAlert(id: string)
chart.getAlerts(): AlertConfig[]
chart.feedPrice(price: number)     // Feed live price for alert checking

// Symbol Comparison
chart.addComparison(symbol: SymbolInfo, datafeed: ComparisonDatafeed): Promise<ComparisonHandle>
chart.removeComparison(handleId: string)
chart.cancelComparison(handleId: string)
chart.getComparisons(): ComparisonState
chart.resetComparisonRange(): Promise<void>
chart.refreshComparisons(): Promise<void>

// Bar Replay
chart.startReplay(startPosition?: number)
chart.stopReplay()
chart.getReplayEngine(): ReplayEngine | null

// Trade Visualization
chart.createTradeVisualization(trades: TradeRecord[], paneOptions?)
chart.getClickDetector(): IndicatorClickDetector

// Lifecycle
chart.dispose()
```

### Exports

```typescript
import {
  KLineChartPro,
  DefaultDatafeed,
  loadLocales,

  // Themes
  themePresets,
  getThemeByName,

  // Data Export
  exportToCSV, exportAllToCSV, exportScreenshot,

  // Layout Persistence
  saveLayoutV3, loadLayoutV3, deleteLayoutV3, listLayoutsV3,

  // Keyboard Shortcuts
  KeyboardShortcutManager,

  // Indicators
  indicatorCategories,
  indicatorRegistry,

  // Alerts
  AlertManager,

  // Comparison
  normalizeToPercent,

  // Replay
  ReplayEngine,
} from 'trading-chest'
```

## Tech Stack

- **Rendering Engine**: [KLineChart](https://github.com/klinecharts/KLineChart) 10.1.0 (Canvas, high performance)
- **UI Framework**: [Solid.js](https://www.solidjs.com/) (reactive, lightweight)
- **Build Tool**: [Vite](https://vitejs.dev/) (ESM + UMD dual output)
- **Language**: TypeScript (zero `@ts-expect-error` for project code)
- **Testing**: Vitest and real package/browser integration checks; see current command output for counts

## Build

```bash
npm ci
npm run build       # Full build (JS + CSS + .d.ts)
npm test
npm run test:package
npx playwright install chromium
npm run test:browser
npm run test:integration
npm run docs:site
npm run test:site
```

Build artifacts:
- `dist/trading-chest.js` — root ES Module
- `dist/trading-chest.umd.js` — UMD
- `dist/trading-chest.css` — styles
- `dist/index.d.ts` — TypeScript declarations

`dist/entries/` contains ESM/CJS/declarations for chart, solid, react and testing. `npm run docs:build` builds documentation only. `npm run docs:site` builds the complete docs/static-demo artifact in `website/` with base `/TradingChest/`. The official Pages workflow deploys that same directory using GitHub's Pages artifact/deploy actions and GITHUB_TOKEN permissions. Next remains a source/local-Node-server example rather than a static Pages demo. Public deployment is a separate maintainer action.

## Based On

Forked from [KLineChart Pro](https://github.com/klinecharts/pro), significantly extended:

- 45+ custom technical indicators with lazy-loading registry
- 13+ drawing tools (measurement, annotations, trade position visualization)
- Floating property toolbar on selected drawings (color palette, line width/style, lock/delete)
- Keyboard shortcut system, theme presets, data export, layout persistence
- Price alert system with live/replay integration
- Symbol comparison overlay (normalized percentage)
- Bar replay engine with step/play/speed controls
- Trade visualization with click detection
- Indicator panel with category tabs + search
- Settings panel with grouped options + color picker
- `dispose()` releases owned resources; browser tests exercise repeated cleanup and record available heap evidence

## License

Apache License 2.0
