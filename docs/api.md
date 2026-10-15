# API

## 创建图表对象
```typescript
new KLineChartPro(
  options: {
    container: string | HTMLElement;
    styles?: DeepPartial<Styles>;
    watermark?: string | Node;
    theme?: string;
    locale?: string;
    drawingBarVisible?: boolean;
    symbol: SymbolInfo;
    period: Period;
    periods?: Period[];
    timezone?: string;
    mainIndicators?: string[];
    subIndicators?: string[];
    datafeed: Datafeed;
    onOverlayCreate?: (event: OverlayLifecycleEvent) => void;
    onOverlayUpdate?: (event: OverlayLifecycleEvent) => void;
    onOverlayDelete?: (event: OverlayLifecycleEvent) => void;
  }
) => KLineChartPro
```
+ `container` 容器id或者容器
+ `styles` 核心图表样式
+ `watermark` 水印
+ `theme` 主题
+ `locale` 语言类型
+ `drawingBarVisible` 是否显示画线工具栏
+ `symbol` 标的
+ `period` 当前周期
+ `periods` 所以周期
+ `timezone` 时区
+ `mainIndicators` 主图指标
+ `subIndicators` 副图指标
+ `datafeed` 数据接入api实现
+ `onOverlayCreate` 绘图 overlay 创建完成回调，event 包含 overlay 快照和来源
+ `onOverlayUpdate` 绘图 overlay 拖动或属性变更回调
+ `onOverlayDelete` 绘图 overlay 删除回调

## 图表API
### setTheme(theme)
```typescript
(theme: string) => void
```
设置主题

### getTheme()
```typescript
() => string
```
获取主题

### setStyles(styles)
```typescript
(styles: DeepPartial<Styles>) => void
```
设置核心图表样式

### getStyles()
```typescript
() => Styles
```
获取核心图表样式

### setLocale(locale)
```typescript
(locale: string) => void
```
设置语言

### getLocale()
```typescript
() => string
```
获取语言

### setTimezone(timezone)
```typescript
(timezone: string) => void
```
设置时区

### getTimezone()
```typescript
() => string
```
获取时区

### setSymbol(symbol)
```typescript
(symbol: SymbolInfo) => void
```
设置标的

### getSymbol()
```typescript
() => SymbolInfo
```
获取标的

### setPeriod(period)
```typescript
(period: Period) => void
```
设置周期

### getPeriod()
```typescript
() => Period
```
获取周期


## 0.6.0 引擎迁移

本版固定 `klinecharts@10.1.0`，`getChart()` 返回 v10 Chart。宿主使用库自有 Period，加载器统一转换为 `{type, span}`；直接调用引擎时使用 v10 的字符串 action、`getIndicators(filter)`、`getOverlays(filter)` 和独立价格轴。旧 `applyNewData`／`updateData` 不再可用。

`reloadData({preserveViewport:true})` 先成功读取，再替换数据。失败保留最后确认的行情、视窗与绘图；回放中须先用退出／重试入口恢复实时模式。币种等元数据缺失时显示未知，不从标的名称推断。

当前布局只通过 `captureLayout`、`saveLayoutV3`、`loadLayoutV3`、`restoreLayout`、`deleteLayoutV3`、`listLayoutsV3` 写读 v3。读取结果为 `ok`／`missing`／`error`；错误携带 code 和 message。旧 v1／v2 只在内存迁移，原键保留；新版损坏不会回落旧记录。恢复前先准备同身份、同周期的数据。后端标注只保存引用，本地绘图须显式提供 IDs，订单、成交、持仓及报警状态不写入布局。

设置面板和快捷键使用 `getYAxes`／`overrideYAxis` 修改真实价格轴，名称为 `normal`／`percentage`／`logarithm`；价格轴类型不再写入 `styles.yAxis.type`。

图表支持浏览器打包及 UMD，React 分析入口保持独立。原始 Node 图表导入不属于 SSR 支持范围。CJS 浏览器子入口为规避上游 CJS→ESM 型 UMD 入口缺陷，打包同一发布版的真实 ESM 引擎；ESM 和 UMD 仍消费固定 peer。
## 快照 API

`applySnapshot(snapshot: ChartSnapshot): Promise<void>` 将当前完整标的/周期的权威 OHLCV 快照交给唯一加载器。`ChartSnapshot` 包含 `symbol`、`period`、`bars` 和可选 `basis`。初始化和回放期间保留最新输入；历史修订和口径变化的 Promise 在预取/提交后完成，读取失败会拒绝并保留旧图。


`onDataState(state: ChartDataState)` 反映当前已应用数据及恢复状态；`onDataReady` 表示行情应用完成，不表示创建了新的 Chart 实例。
## 多图工作台

`ChartWorkspace` 管理单图、双图和四图。宿主通过 `symbols`、`getPeriods(symbol, signal)` 提供真实目录，通过 `mountCell(container, cell, signal)` 返回独立图表的 `ready`、`dispose` 和可选捕获参数。图表必须在数据应用后才 ready；每个窗格使用独立 datafeed。`subscribeReady` 使失败后重试成功的实例重新接入工作台。

库提供布局、活动窗格、尺寸比例、四项同步、保存／加载／删除控件。同步默认关闭，十字线只匹配真实时标；视窗按目标可绘制宽度和实际时间交集计算，并校验引擎应用结果。原价格不在不同品种间同步。

`primary` 保留宿主原 context，新增窗格为 `${context}:secondary-N`。`WorkspaceDocument.version=1` 存储稳定 ID、每窗格 v3 布局、活动窗格、同步项和尺寸比例。宿主显式传入 storage 才启用存储；加载先验证目录、读取各图并恢复成功，之后替换当前工作台。失败保留当前工作台及保存原件。系统绘图不进入捕获；后端标注仅保存引用，由宿主重新读取。

公共 `ChartPro.getShortcutManager()` 和 `getReplayEngine()` 返回对应对象的公开结构接口，避免不同声明入口的私有字段造成类型身份冲突；运行时返回同一对象，全部公开方法仍可调用。
