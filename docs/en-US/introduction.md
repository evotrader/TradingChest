# Introduction

TradingChest is an open-source financial chart library built on KLineChart. It provides chart UI, analytical layers, comparisons, replay of loaded history and named multi-chart workspaces. Version 0.9.0 adds React chart/workspace components, DOM-free history validators and standalone React, Next.js, Vue and data-adapter examples.

Hosts choose valid symbols/periods, data sources/units, indicator and analytical calculations, persistence and business callbacks. The library has no dependency on EvoTrader APIs, accounts or authentication. Demonstration data never becomes a production fallback. Missing data, failed reads and unaligned results remain distinct.

Use `trading-chest/chart` for browser integration, `trading-chest/react` for React and `trading-chest/testing` for DOM-free adapter checks. Solid analytical components remain available from `trading-chest/solid`. See [getting started](./getting-started), [framework integration](./frameworks) and the [data contract](./data-access).

Derived from [KLineChart Pro](https://github.com/klinecharts/pro), the project uses the [KLineChart](https://github.com/klinecharts/KLineChart) 10.1.0 engine under Apache License 2.0 and retains upstream license notices and attribution. [TradingChest source and contributions](https://github.com/evotrader/TradingChest).
