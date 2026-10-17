# 快速开始

TradingChest 是通用浏览器图表库。行情、指标计算输入、存储和业务操作由宿主提供，图表不依赖 EvoTrader 服务。

## 安装

```bash
npm install trading-chest@0.7.0 klinecharts@10.1.0
```

纯图表使用 `trading-chest/chart`，无需安装 React。已有 React／Solid 分析组件分别从 `trading-chest/react`／`trading-chest/solid` 引入；Solid 宿主与库共享运行时。固定 KLineChart peer 为 10.1.0，原始 Node 图表导入不属于 SSR 支持范围。

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

[analysis-sdk 示例](https://github.com/evotrader/TradingChest/tree/main/examples/analysis-sdk)安装实际 tarball，仅通过公开入口演示外部指标、独立实例、线／柱／带／事件、日期标签面板、回放和布局。输入明确为隔离合成数据，不连接生产或需要凭证；可复制到仓库之外构建运行。生产接入请提供真实 datafeed，不把示例当行情回退。

新增接口见 [API](./api#通用指标目录与实例)，从 0.6.0 迁移见[升级说明](./upgrade/0.7.0)。本地开发依次运行 `npm ci`、`npm run build`、`npm run test:package`、`npx playwright install chromium`、`npm run test:browser`、`npm run docs:build`。浏览器 runner 自行选择空闲端口、启动 Vite 并清理自有进程；JSON、日志与 trace 保存在 `test-results/`。
