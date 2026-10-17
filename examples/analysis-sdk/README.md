# 通用分析 SDK 独立示例

所有行情、指标和日期点均为明确隔离的合成输入。示例不依赖 EvoTrader API、环境变量、凭证或父仓库源码。

先在 TradingChest 根目录 `npm ci && npm run build`，将 tarball 复制到此目录：

```bash
npm pack --pack-destination /tmp
# 把实际产生的 trading-chest-<version>.tgz 复制为 examples/analysis-sdk/trading-chest.tgz
```

将整个示例目录复制到任意空目录，在该目录 `npm install && npm run dev`，打开 Vite 输出的本地地址。`npm run build` 可验证打包。发布版也可把 package.json 中的 file 依赖换成明确版本；不要深路径导入 src。

通过按钮添加两个外部命名空间指标、更新第一个、删除第二个、捕获／恢复布局及回放。指标目录的设置面板提供数字、枚举选择器和布尔开关。四类 timestamp 图层共用真实 bar 时标；标签面板保留日期、原值和 null 序数位置，不声称其对应日内时刻。标签点缺少精确 availableAt，因此回放时整层隐藏。

纯 JavaScript 使用 `trading-chest/chart`；React／Solid 项目复用已有 `trading-chest/react`／`trading-chest/solid` 入口。图表在组件 mount 后创建，在 unmount 调用 dispose；不要在服务端渲染图表。`npm run test:package` 会安装实际 tarball，在独立目录编译本示例并通过 Chromium 操作，且验证无 React 安装、共享 Solid、React 18／19 以及 ESM／CJS／UMD。
