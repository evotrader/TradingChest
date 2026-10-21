# 独立绘图工作台示例 / Drawing workbench example

根目录先 `npm run build && npm run prepare:examples`，然后本目录 `npm ci && npm run dev`。示例实际安装同版 tarball，不通过源码 alias。`npm test` 启动独立 loopback HTTP 服务并验证 CAS、明确拒绝、冲突和已提交但响应丢失后的固定 ID 核对。

A/B 借用同一个宿主 registry；C 使用独立 registry，点“刷新独立实例 C”读取已保存文档。图内“绘图管理”可以选择本图、工作台或宿主共享，操作模板、分组、过滤及批量样式。先点“保存共享绘图”，再保存工作台；刷新页面后点恢复。模板与偏好经首方 IndexedDB 跨重开保存。示例所有者在三个工作台退订后释放 registry 和 store。

共享存储选择器的 HTTP 选项仅在 Vite 开发服务可用；静态网站禁用该选项。HTTP 服务只绑定 loopback，记录仅存在本进程，不是生产持久化实现，不向真实账户或行情 API 请求。生产消费者应将 `http-store.mjs` 接到自己的已持久化 CAS 服务，并保留 `null expectedRevision` 的只创建语义；未知响应必须核对固定 ID，不自动重发。

The three workspaces consume the installed public package. A and B borrow one host session registry; C refreshes explicitly through an independent registry. IndexedDB survives page reloads. The optional loopback HTTP example demonstrates revision CAS and uncertain-write reconciliation; its records last only for the local dev-server process. Static builds disable that option. All market inputs are synthetic and isolated.

0.11 的“添加量价估算示例”直接使用已安装包的 `commitDrawing`，只依赖该图已确认的普通 OHLCV。按钮添加独立分组的 AVWAP 与 FRVP，图内工具栏仍可交互创建、编辑、共享和保存。结果明确是当前周期估算，不接 EvoTrader 私有接口。

## 通用第三方绘图

`analysis-zone.mjs` 演示公开 peer `klinecharts.registerOverlay`，工具名 `EXAMPLE/AnalysisZone`，目录 ID `example-analysis-zone`。它在构造图表前登记，再与 `builtinDrawingCatalog` 合并传给 `drawingCatalog`；不是 TradingChest 内部扩展，也不需要 EvoTrader 服务。可从全部工具搜索“示例分析区”，设置中编辑中线、名称与标准样式；定义随原模板、确认历史、共享和命名工作台保存。

原生 JS 或 TS 接入：

```ts
import { registerOverlay } from 'klinecharts'
import { KLineChartPro, builtinDrawingCatalog } from 'trading-chest/chart'
// 注册模板与目录结构见 analysis-zone.mjs；styles 使用 line/polygon/text 等标准键。
registerOverlay(template)
const chart = new KLineChartPro({ ...options, drawingCatalog: [...builtinDrawingCatalog, descriptor] })
```

`styleControls` 必须与模板实际读取的标准样式对应；`settings` 含 style 才启用控件，缺省保持描边/线宽/线型，空数组关闭。注册模板不会获得对宿主只读对象的编辑权限。多个图表可重复使用模板，销毁一个图不注销全局模板。缺少注册时构造会在修改容器前抛错，原容器保留。图表生命周期和原生 IndexedDB 仍由示例的既有所有者释放。
