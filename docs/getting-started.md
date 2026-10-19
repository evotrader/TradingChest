# 快速开始

TradingChest 是通用浏览器图表库。行情、指标计算输入、存储和业务操作由宿主提供，图表不依赖 EvoTrader 服务。

## 安装

```bash
npm install trading-chest@0.10.0 klinecharts@10.1.0
```

本页描述 0.9.0 源码契约；尚未发布新版时，先在源码目录 `npm ci && npm run build`，再 `npm pack` 并安装实际 tarball。版本号说明不代表已公开发布。

纯图表使用 `trading-chest/chart`，无需安装 React。React 的新 TradingChart／TradingWorkspace 和原分析组件从 `trading-chest/react` 引入；使用它们需配对 React／ReactDOM（18.3.1 或 19.2.3）。Solid 分析组件从 `trading-chest/solid` 引入，宿主与库共享运行时。固定 KLineChart peer 为 10.1.0。只有 React 和 testing 新入口承诺无 DOM 的 Node 导入；原始根／chart／UMD 不承诺 SSR。完整生命周期、Next Client Component 工厂与 Vue 接法见[框架接入](./frameworks)。

## 创建与释放

容器必须有明确高度。`datafeed` 是宿主按[数据契约](./data-access)实现的实例，`symbol` 和 `period` 应来自宿主有效目录：

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

根入口也保留原图表导出；CJS 浏览器入口和 UMD 产物仍可用。直接 script 引入时先加载固定 KLineChart UMD peer，再加载 `trading-chest/dist/trading-chest.umd.js` 和 CSS；库全局名称为 `tradingchest`。根 UMD 还包含 React 分析组件，使用时按其入口依赖提供 React。

## 完整独立示例

[演示索引](/demos/)链接本地站点产物中的静态示例；[框架指南](./frameworks#独立示例与站点)列出独立的 react-vite、next-app、vue-vite 与 datafeed-contract。Next 需要 Node 服务，不作为静态演示部署。

[analysis-sdk 示例](https://github.com/evotrader/TradingChest/tree/main/examples/analysis-sdk)安装实际 tarball，仅通过公开入口演示外部指标、独立实例、线／柱／带／事件、日期标签面板、回放和布局。输入明确为隔离合成数据，不连接生产或需要凭证；可复制到仓库之外构建运行。生产接入请提供真实 datafeed，不把示例当行情回退。

同一示例的 `/data-workspace.html` 是独立的 0.8.0 入口：用 before/countBack 初始化、range 重载、状态／重试和真实 IndexedDB 命名工作台演示公开接口。页面数据仍为明确标识的隔离合成输入；IndexedDB 记录是真实的本浏览器持久记录。原 `/index.html` 保持分析层演示。两个页面可单独使用，不需要后端或凭证。

## 注入工作台存储

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
const saved = await workspace.saveAs('我的视图')
await workspace.load(saved.id)
// On host unmount, release borrowers before their owned store.
workspace.dispose()
store.dispose()
```

symbols/getPeriods/mountCell 是宿主提供的真实目录和图表工厂；可运行实现见上述独立示例。未注入 store 时管理禁用，存储失败不回落其他实现。`importLegacy(name)` 只新增可选记录，之后显式选择／加载，原键不变。

新增接口见 [API](./api#react-组件接口-0-9-0)和 [0.9.0 升级说明](./upgrade/0.9.0)，工作台存储见 [API](./api#工作台存储接口)，从 0.7.0 迁移见 [0.8.0 升级说明](./upgrade/0.8.0)，更早的分析 SDK 迁移见 [0.7.0 升级说明](./upgrade/0.7.0)。本地开发依次运行 `npm ci`、`npm run build`、`npm run test:package`、`npx playwright install chromium`、`npm run test:browser`、`npm run docs:build`。浏览器 runner 自行选择空闲端口、启动 Vite 并清理自有进程；JSON、日志与 trace 保存在 `test-results/`。这些是验证命令，不代表每个宿主环境已通过验收。

完整文档＋静态演示产物执行 `npm run docs:site`，输出 `website/` 并挂载在 `/TradingChest/`；`npm run test:integration` 验证包外框架，`npm run test:site` 验证同一站点产物。文档构建与本地站点验证不代表已经公开上线。
