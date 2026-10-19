# React / Next.js / Vue 接入

先按[数据契约](./data-access)实现宿主适配器。以下 `host`、`symbol`、`period`、`symbols` 和 `getPeriods` 都表示宿主提供的真实对象，不是库内置行情。所有容器必须有确定高度；示例项目使用明确标识的隔离合成输入。

## React 单图

```bash
npm install trading-chest@0.10.0 klinecharts@10.1.0 react@19.2.3 react-dom@19.2.3
```

配套验证组合为 React／ReactDOM **18.3.1／18.3.1** 和 **19.2.3／19.2.3**。不要混装不同主版本。纯 `chart` 或 `testing` 消费者无需安装 React／ReactDOM。

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
    locale="zh-CN"
    aria-label="价格图表"
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

`host.createDatafeed(signal)` 每次调用必须创建独立 feed；不要返回外层单例。交给核心之前的失败、取消与迟到返回由包装器释放，成功交接后由图表 `dispose()` 释放。卸载会取消初始化、释放图表并清空 ref。开发环境 StrictMode 会额外执行创建／清理，应同样正确。

`initialOptions` 是单次挂载快照，包括初始标的／周期、目录、绘图提交策略及比较工厂。要应用新的初始化配置，用 React `key` 明确重建。普通重渲染不会回滚用户在图内选择的标的／周期；运行时操作可调用 `chart.current?.setSymbol(...)` 或 `setPeriod(...)`。

`theme`、`locale`、`timezone`、`styles` 和 `height` 是呈现 props。更新它们调用已有 setter／resize，不重建行情。styles 使用合并语义，省略不清空；完全重置用新 key。`events` 每次通知读取最新已提交的 React 回调，而初始化策略保持快照。被 Suspense 挂起或取消的渲染不会替换活实例的回调；工作台通知也遵循同一规则。

`onReady` 表示实例已创建，ref 已安装；`events.onDataReady` 才表示真实历史已应用。初始化失败显示重试并调用 `events.onError`，重试会创建新 feed。历史读取失败的展示和 `retryData()` 沿原图表行为，不用 `onReady` 冒充数据确认。

## React 多图工作台

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

工作台通过 portal 渲染 cell，保留父级 React Context。不要给每个 cell 再创建 `createRoot`。`renderCell` 的 `signal` 表示本次 cell 绑定生命周期；取消、移除或恢复失败后，不能再用旧的 `onReady` 交接结果。

子图在数据实际应用后调用 `onReady({chart,captureOptions?})`，后续重复确认可再次调用。默认捕获已确认的本图 local 绘图，`captureOptions.localDrawingIds` 可筛选子集；后端 `annotationRefs` 必须由宿主提供真实引用，不要因省略示例字段丢失业务引用。运行时分析和行情不写入布局。

`store={sharedStore}` 表示借用：组件不会关闭它。`createStore(signal)` 表示自有：必须每次创建返回带 `dispose():void` 的 store（可异步），待工作台和 cell 清理后关闭；迟到返回也关闭。两者互斥。未提供时管理禁用，不默认为其它存储。共享 store 的所有者应在全部借用者卸载后关闭它。

context、目录、初始标的／周期、getPeriods 和 toolbar 同样是初始化快照，业务身份变化使用 key。locale／theme／height 可更新；`height="100%"` 要求父容器有确定高度。`onLayoutChange` 通知宿主调整高度，工作台实例仍负责布局权威。ref 返回原 ChartWorkspace，可调用[命名保存与加载方法](./api#工作台存储接口)。

## Next.js App Router

React 入口保留 `use client`，可在没有 window／document 的 Node 中导入和 `renderToString`，服务端仅输出稳定初始容器。Canvas／Solid 核心在客户端 effect 加载。本版验证 Next **16.2.1**；消费者无需 Solid alias 或 transpilePackages。

函数工厂必须在 Client Component 内定义，不能从 Server Component 作为普通可序列化 props 传入：

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

在 `app/layout.tsx` 引入 `trading-chest/dist/trading-chest.css`。浏览器路由离开页面会正常卸载。服务端不要直接运行 chart、根入口或 UMD 初始化；这些入口不承诺 SSR／服务端 Canvas。Next 示例需 `next build`＋`next start` 和 Node 服务，不能静态上传到 Pages 代替服务端验收。

## Vue 3 Composition API

本版提供原 chart 入口的生命周期接法，不新增 Vue runtime wrapper 或 Vue peer。在 `onMounted` 动态导入并创建，在 `onUnmounted` 取消请求并释放；异步工厂迟到时也要释放：

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

## 独立示例与站点

[演示索引](/demos/)汇总同一站点产物中的静态演示；其中合成输入标识必须保留。源码示例都有自己的 package.json／lock，可通过同次 `npm pack` tarball 在仓库外安装。0.9.0 源码验证阶段先构建并安装 tarball，不能把版本号说明理解为新版已经发布。

| 源码 | 用途 |
| --- | --- |
| [analysis-sdk](https://github.com/evotrader/TradingChest/tree/main/examples/analysis-sdk) | 原 JS 分析层 index.html 与 data-workspace.html 两页均保留 |
| [react-vite](https://github.com/evotrader/TradingChest/tree/main/examples/react-vite) | React 图表／工作台、Context、StrictMode、周期、重试、保存／加载与卸载 |
| [next-app](https://github.com/evotrader/TradingChest/tree/main/examples/next-app) | App Router 预渲染、水合、路由进出；本地 Node 服务运行 |
| [vue-vite](https://github.com/evotrader/TradingChest/tree/main/examples/vue-vite) | Vue 3 原 chart 动态创建、切换与清理 |
| [datafeed-contract](https://github.com/evotrader/TradingChest/tree/main/examples/datafeed-contract) | 无 React 的 Node 适配与契约测试模板 |

维护者先执行 `npm ci`、`npm run build`，再执行 `npm run docs:site`，将文档和消费 tarball 的静态演示合并到 `website/`。`npm run docs:build` 只构建文档。完整产物固定挂载在 `/TradingChest/`，不需要生产后端。`npm run test:site` 用相同目录验证子路径；本地构建通过不表示 Pages 已配置或已公开上线。`.github/workflows/deploy-docs.yml` 使用官方 Pages artifact／deploy 工作流，公开发布按维护者授权执行。


完整静态站产物的[演示索引](/demos/)提供 Next.js 源码下载包，内含同版 TradingChest tarball 与独立锁；解包进入 next-app 后运行 npm ci、npm run build、npm start。Next.js 仍需 Node 服务。


## 绘图工作台独立示例

drawing-workbench 示例实际安装同版公开 tarball。两个工作台借用同一宿主绘图 registry，第三个实例显式刷新；首方 IndexedDB 保存偏好和绘图。可运行的 loopback HTTP CAS 示例仅在开发服务可用，静态站禁用该选项。所有权与格式迁移见绘图页及 0.10.0 升级页。
