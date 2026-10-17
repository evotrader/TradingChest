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

重载完成还要求引擎应用数据和订阅准备成功；订阅挂接后抛错时 Promise 拒绝，保留原 bars／basis／scope 并撤销部分订阅。准备期间同步到达的普通 bar，以及回放退出时比较 provider 的 bar／snapshot，复制到本次订阅的临时队列，成功后消费，失败／切换／销毁时释放。公开 `applySnapshot` 在组合检查点内保留最新输入，成功提交后再处理。

当前布局只通过 `captureLayout`、`saveLayoutV3`、`loadLayoutV3`、`restoreLayout`、`deleteLayoutV3`、`listLayoutsV3` 写读 v3。读取结果为 `ok`／`missing`／`error`；错误携带 code 和 message。旧 v1／v2 只在内存迁移，原键保留；新版损坏不会回落旧记录。恢复前先准备同身份、同周期的数据。后端标注只保存引用，本地绘图须显式提供 IDs，订单、成交、持仓及报警状态不写入布局。

设置面板和快捷键使用 `getYAxes`／`overrideYAxis` 修改真实价格轴，名称为 `normal`／`percentage`／`logarithm`；价格轴类型不再写入 `styles.yAxis.type`。

图表支持浏览器打包及 UMD，React 分析入口保持独立。原始 Node 图表导入不属于 SSR 支持范围。CJS 浏览器子入口为规避上游 CJS→ESM 型 UMD 入口缺陷，打包同一发布版的真实 ESM 引擎；ESM 和 UMD 仍消费固定 peer。
## 快照 API

`applySnapshot(snapshot: ChartSnapshot): Promise<void>` 将当前完整标的/周期的权威 OHLCV 快照交给唯一加载器。`ChartSnapshot` 包含 `symbol`、`period`、`bars` 和可选 `basis`。初始化和回放期间保留最新输入；历史修订和口径变化的 Promise 在预取/提交后完成，读取失败会拒绝并保留旧图。

异步布局预检绑定开始时唯一 loader 的身份 epoch；即使空图或切走再切回同一标的／周期，旧恢复也以 AbortError 取消，取消发生在删除／重建之前。直接 restoreLayout 仍不承诺完整事务回滚。比较恢复在读取时立即复制来源数据，主／成员订阅全部准备成功后才应用；准备期间移除真实成员使本轮恢复取消并可重试剩余成员，移除未知 ID 不影响恢复。事件起止必须处于可显示的 Unix 毫秒日期范围；区间与视窗相交即显示其可见线段，点击仍返回原事件时标。


`onDataState(state: ChartDataState)` 反映当前已应用数据及恢复状态；`onDataReady` 表示行情应用完成，不表示创建了新的 Chart 实例。
## 多图工作台

`ChartWorkspace` 管理单图、双图和四图。宿主通过 `symbols`、`getPeriods(symbol, signal)` 提供真实目录，通过 `mountCell(container, cell, signal)` 返回独立图表的 `ready`、`dispose` 和可选捕获参数。图表必须在数据应用后才 ready；每个窗格使用独立 datafeed。`subscribeReady` 使失败后重试成功的实例重新接入工作台。

库提供布局、活动窗格、尺寸比例、四项同步、保存／加载／删除控件。同步默认关闭，十字线只匹配真实时标；视窗按目标可绘制宽度和实际时间交集计算，并校验引擎应用结果。原价格不在不同品种间同步。

`primary` 保留宿主原 context，新增窗格为 `${context}:secondary-N`。`WorkspaceDocument.version=1` 存储稳定 ID、每窗格 v3 布局、活动窗格、同步项和尺寸比例。宿主显式传入 storage 才启用存储；加载先验证目录、读取各图并恢复成功，之后替换当前工作台。失败保留当前工作台及保存原件。系统绘图不进入捕获；后端标注仅保存引用，由宿主重新读取。

公共 `ChartPro.getShortcutManager()` 和 `getReplayEngine()` 返回对应对象的公开结构接口，避免不同声明入口的私有字段造成类型身份冲突；运行时返回同一对象，全部公开方法仍可调用。

## 绘图确认与历史

`commitDrawing(change)` 接收 `kind`、稳定 `logicalId`、目标 `after` 和 `source`。同一图表串行处理，库为本地绘图确认，后端归属必须由 `ChartProOptions.commitDrawing` 返回 `DrawingCommitResult`：`confirmed` 携带真实快照及后端 ID，`rejected` 表示明确失败，`uncertain` 表示尚不能确定并可携带核对后的快照。不要将超时直接当作未提交或自动重发创建。

`getDrawings()` 返回确认快照（含 pane）；`getDrawingHistoryState()` 返回等待数量、可撤销／重做及待确认对象。`undoDrawing()`／`redoDrawing()` 仍走同一确认回调；删除后撤销必须使用重新创建返回的新后端 ID。`restoreDrawings(owner, snapshots)` 是外部权威读取恢复，不发送 CRUD，也不将恢复动作写入历史；`resetDrawingHistory()` 使旧历史失效。

`drawingOwner` 区分本地和后端，`isDrawingEditable` 保护宿主系统覆盖物，`onDrawingSelect` 通知稳定逻辑 ID，`onDrawingHistoryChange` 通知确认状态。绘图工具、属性栏和快捷键共用该协议。输入框使用原生撤销；workspace 仅将快捷键发给活动窗格。切换上下文和恢复布局使历史失效，历史不存入布局。

## 独立比较与回放

`addComparison(symbol, datafeed): Promise<ComparisonHandle>` 为本条比较取得一个独立 provider；不能传主图 datafeed，也不能在同图多个比较之间共享 provider。handle 包含图表实例、完整标的、周期及实际 indicator ID。`removeComparison(handleId)` 释放单条比较；`cancelComparison(handleId)` 取消尚未完成的添加并释放 provider；`getComparisons()` 提供成员、共同基准、应用的源末根／收益与错误状态。

`ComparisonDatafeed` 支持普通 bar 订阅，或 `subscribeSnapshots(symbol, period, onSnapshot, onError)` 完整快照订阅；`unsubscribe` 暂停，`dispose` 最终释放。宿主的 `comparisonSymbols` 与同步工厂 `createComparisonDatafeed` 为库内目录选择器提供有效值，`onComparisonChange` 接收状态。生产宿主采用原 HTTP OHLCV 持续续读；只读复盘使用固定窗口静态 provider。

比较组按主图与所有成员首个共同实际时标分别归零。缺口不取近邻，基准前不输出，零／非法基准拒绝；新增失败保留原组。全部收益与主收益线共用一个独立 normal 百分比轴，原价蜡烛／订单仍在原价轴；不做 FX 转换。平移或前插历史不重定基准，增加／移除成员和 `resetComparisonRange()` 会显式统一重算；`refreshComparisons()` 重读但保留固定时标。权威基准价格修订会提示并重算，新的复权口径须覆盖既有历史。

只注册通用 COMPARE 模板，实例查询函数和基准放在 extendData；不使用全局 ticker 闭包。回放暂停各 provider，按主图截止裁剪；退出重读主图与比较，组合提交成功后恢复订阅，失败仍保持暂停状态。取消、移除、切换、销毁均使旧回调失效。`normalizeToPercent` 工具也拒绝零／非法基准，不再返回虚假全零。

## 通用指标目录与实例

`ChartProOptions.indicatorCatalog?: IndicatorDescriptor[]` 省略时使用完整内置目录；指定后以该实例目录为准。定义登记为全局无业务状态的 KLineChart `IndicatorTemplate`，目录与参数属于图表。不要把数据数组或账户信息捕获到全局模板闭包。

```typescript
import {registerIndicatorDefinition, builtinIndicatorCatalog} from 'trading-chest/chart'
import type {IndicatorDescriptor, IndicatorParameterSchema} from 'trading-chest/chart'
import type {IndicatorTemplate} from 'klinecharts'
```

`registerIndicatorDefinition(name, templateOrLoader)` 在构造图表前调用；外部名字必须有稳定命名空间（如 `YOUR_APP/Signal`），模板名称与登记名称相同。loader 返回 `Promise<IndicatorTemplate>`。与内置或不同现有定义冲突会拒绝；同一已注册定义可被多个目录引用。模板仍使用 KLineChart 自身计算协议，不增加另一种 DSL。

`IndicatorDescriptor` 包含 `name/label/labels?/category/placements/parameters?`。`label` 是默认文字，`labels` 按 locale 覆盖，placements 为 `main`／`sub`。参数 schema 为 `{items,repeat?:{parameter,minItems,maxItems}}`；items 支持 number（min/max/step）、select（有限 options）和 boolean，可选项仅可放在尾部。repeat 表示附加重复参数数量。设置 UI 用数字框、选择器和开关；没有 schema 的定义只读参数。缺省参数沿真实模板，MA 四项、RSI 三项，不补未用尾项。

| API | 行为 |
| --- | --- |
| `getIndicatorCatalog()` | 本图目录副本 |
| `addIndicator({name,placement,calcParams?})` | Promise 返回真实 `{id,name,paneId,yAxisId}`；错误与生命周期取消拒绝 |
| `getIndicators()` | 实际实例及 calcParams/visible，不以目录名称伪装已安装 |
| `updateIndicator(id,{calcParams?,visible?})` | 只修改这个 ID；不存在或参数非法报错 |
| `removeIndicator(id)` | 只删除这个 ID |

同名实例可独立设置、显隐和删除。布局 v3 保存名称、真实 ID、参数、pane/axis；目录、模板函数不入 JSON。恢复预检未知定义、目录和参数。工作台先暂存全部成功再替换；直接 restoreLayout 不承诺全事务回滚。

## 外部分析图层

`getAnalysisContext(): AnalysisContext|null` 只返回当前确认行情的 `{token,symbol,period,basis?}`。`addAnalysisLayer(context,spec)` 同步返回 handle（`id/replaceData/setVisible/dispose`）；dispose 幂等。重复图层 ID、过期 token 或非法输入拒绝。替换先整体校验和复制，失败保留最后成功数据并通知 error。

| spec.type | data | 坐标与缺口 |
| --- | --- | --- |
| `line`／`histogram` | `{timestamp,value:number|null,availableAt?}[]` | Unix 毫秒严格递增且唯一，仅精确真实 bar 时标；null／缺行断开，柱可负 |
| `band` | `{timestamp,lower:number|null,upper:number|null,availableAt?}[]` | 上下界同时为 null 或有限且 lower≤upper |
| `events` | `{id,timestamp,endTimestamp?,availableAt?,label,data?}[]` | ID 唯一，同刻多事件合法；点／首末锚须精确，不取近邻；未定位事件留列表 |
| `label-series` | `{id,label,value:number|null,availableAt?}[]` | 独立序数面板，保留有序标签、原值、null 位置，不把日期猜成交易时刻 |

所有 spec 包含稳定 `id/label`，可选 `visible/color/unit`。时间数值层必须提供 `placement:'main'|'sub'` 和 `valueType:'price'|'scalar'|'percent'|'amount'`。price 自身必带 `dataBasis:string|null`；main 仅接受双方已知且相同的口径，未知不能相等。其他值和未知口径价格用独占副图／轴。percent 是百分数点，1 表示 1%；未给币种不推测。label-series 不与 K 线十字线或视窗同步，水平间距不表示真实时长。

`analysisLayerListVisible` 控制库内列表入口。`onAnalysisLayerChange` 返回 id/label/type/visible/status（ready/hidden/empty/unaligned/error）、unalignedCount 和 reason；`onAnalysisEventClick({layerId,event,timestamp})` 携带原事件时刻；`onAnalysisPointSelect({layerId,point})` 携带原标签点。宿主负责打开业务详情，不把只读事件放进绘图确认、Delete 或 Undo。

scope 在标的／周期切换（含切走再切回）及确认 basis 变化时失效；同身份同口径续读、前插、修订、成功重载保持。新口径预取期间保留旧 context，确认提交后再换。退出回放主图与比较全部恢复成功才解除 cutoff；失败保留旧行情、口径、token、图层和回放状态，可重试。

回放对 timestamp 和 availableAt 同时裁剪；未传 availableAt 取 timestamp。区间右端裁到可见前缀末根，未来终点文字与 metadata 不泄露。label-series 仅在每个点有真实 availableAt 时按该字段显示；任一点未知整层隐藏，明确原因，画布、列表、tooltip、点击和点数均不泄露。来源日期不等于精确可用时刻；宿主负责数据 PIT 和事后结果的真实 availability。

分析图层和显隐不入布局 v3。运行时 indicator/pane/axis 按实际 ID 排除；同 scope restore 保留有效图层。宿主在 scope 变化后重新提供数据。HTTP／WS、AbortSignal、返回顺序、存储和业务计算均由宿主拥有，库不建第二份行情通道。

## 工作台呈现配置

`ChartWorkspaceOptions` 增 `locale/theme/height?:number|'100%'`（默认 100%，父容器须有高度）及 `toolbar?:{layout?,sync?,storage?,size?}`。隐藏组只隐藏入口，程序 API 仍可用。`setLocale(locale)`、`setTheme(theme)`、`resize()` 更新工作台呈现，ResizeObserver 根据实际容器调整图表。每 cell 自有 v3 主题／语言恢复语义保留；workspace chrome 的配置由宿主决定。

中文和英文库自有 chrome 完整覆盖；ja／ko 缺失项按英文回退。用户标签和后端错误保留原文。显式 storage adapter 才启用保存；本轮不提供异步云端存储接口。


工作台 `onLayoutChange(layout)` 通知宿主调整外部高度，不改变持久文档。EvoTrader 使用单／双 780px、四图 1160px；其他宿主按自身容器配置。外部模板 tooltip 的名称、单位与 legends 保留，新增／恢复共用管理按钮；无 schema 不提供设置入口。分析更新失败显示错误并保留最后确认图形；未知价格口径副图明确标识。组合退出还会恢复消费回放期间排队的行情快照。
