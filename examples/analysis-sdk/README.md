# 通用分析 SDK 独立示例

所有行情、指标和日期点均为明确隔离的合成输入。示例不依赖 EvoTrader API、环境变量、凭证或父仓库源码。

先在 TradingChest 根目录 `npm ci && npm run build`，将 tarball 复制到此目录：

```bash
npm pack --pack-destination /tmp
# 把实际产生的 trading-chest-<version>.tgz 复制为 examples/analysis-sdk/trading-chest.tgz
```

将整个示例目录复制到任意空目录，在该目录 `npm install && npm run dev`，打开 Vite 输出的本地地址。`npm run build` 可验证打包。发布版也可把 package.json 中的 file 依赖换成明确版本；不要深路径导入 src。

默认 `/index.html` 通过按钮添加两个外部命名空间指标、更新第一个、删除第二个、捕获／恢复布局及回放。指标目录的设置面板提供数字、枚举选择器和布尔开关。四类 timestamp 图层匹配输入 bar 的精确时标；标签面板保留日期、原值和 null 序数位置，不声称其对应日内时刻。标签点缺少精确 availableAt，因此回放时整层隐藏。

0.8.0 新增独立 `/data-workspace.html`，不改变原页面行为：

- before/countBack 读取期望根数（严格不含 before），range 完整读取 `[from,to)`；历史结果始终为对象，明确返回 before 的真实合成数据边界。
- 记录历史请求，展示 onDataState.dataStatus、lastRead、connection；来源时刻和延迟未声明时显示未知，不冒充真实行情或网络连接。
- 可对下一次读取注入明确失败，再重载／retryData；失败保留已确认图形。
- 注入真实 `createIndexedDBWorkspaceStore`，通过库内控件保存、另存、选择／加载、重命名、删除和刷新；支持 1／2／4 图。保存为手动操作，先保存未保存改动再切换；此页面的记录只在 `trading-chest-isolated-data-workspace-example` 数据库中。
- `importLegacy(name)` 只新增可选记录，必须随后选择／加载；不自动改当前视图，不覆盖或删除旧键。本示例不为演示而伪造旧记录。

该页只使用公开包入口及浏览器 IndexedDB，可复制到仓库之外运行；没有供应商、父仓源码或后端依赖。自定义服务可实现异步 WorkspaceStore，但更新／删除必须在存储中原子比较 expectedRevision；取消／超时后的未知结果需以同 scope/ID 读取核对。生产必须提供真实 datafeed。

`npm run build` 同时构建两个页面；`npm run dev` 后分别打开上述地址。浏览器自测可依次读取 before／range、注入失败并重载／重试、保存两份记录、选择加载、重命名、确认删除，再刷新页面检查持久化。该步骤说明不代表每个环境已经通过验证。

纯 JavaScript 使用 `trading-chest/chart`；React／Solid 项目复用已有 `trading-chest/react`／`trading-chest/solid` 入口。图表在组件 mount 后创建，在 unmount 调用 dispose；不要在服务端渲染图表。`npm run test:package` 会安装实际 tarball，在独立目录编译本示例并通过 Chromium 操作，且验证无 React 安装、共享 Solid、React 18／19 以及 ESM／CJS／UMD。
