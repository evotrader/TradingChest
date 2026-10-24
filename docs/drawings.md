# 绘图文档与共享会话

绘图入口为 `getDrawingTools()`、`getDrawingState()` 和 `executeDrawingCommand(command)`。目录包含内置工具的稳定 ID、分类、名称、参数与快捷键；实例可通过 drawingCatalog 指定目录。注册 overlay 不会自动取得用户编辑权限。

## 确认、呈现与撤销

交互草稿取消不提交。local 内容由库确认；backend 内容仍由 drawingOwner／commitDrawing 的原宿主 authority 确认。名称、分组、排序、周期过滤属于文档呈现，不发送后端标注 CRUD。全局隐藏与防拖动是视图状态，不覆盖对象的 visible／lock。

程序操作和界面使用同一命令入口：tool、select、cancel、update、delete、duplicate、copy、paste、group、ungroup、reorder、presentation、view、undo、redo。多对象内容修改先全批预检，后端串行提交；检查结果 status 及逐对象 items，partial／uncertain 不能当完成。未知写入按原 logicalId 刷新 authority，禁止自动重发创建。

状态中的 scope 是新工具作用域，historyScope 是当前撤销目标；选中对象决定操作会话。跨会话批量内容操作明确拒绝。通知 origin 为 user、history 或 projection；投影不提交业务写。输入框继续使用浏览器原生撤销。

与绘图文档绑定的命令在入队时记录上下文。排队期间切换标的、周期或共享绑定会取消旧命令，避免把粘贴或编辑应用到新文档；同文档内的连续操作仍按顺序执行。全局视图和偏好操作不受文档切换影响。

## 坐标与布局

DrawingSnapshot.anchors 是坐标权威：market 保存真实时标／值（连续笔迹可带相邻真实时标比例）；logical 保存已存在参考 bar 和原周期根数偏移；viewport 保存内容区百分比。engine points 只是投影，不用数组下标或伪造未来开市时间替代市场锚点。缺少参考历史、周期不兼容或不可定位时保留对象，并显示原因。

captureLayout／restoreLayout 使用 ChartLayoutV4：drawings 仅保存本图 local 内容，drawingPresentation 保存后端引用的呈现，sharedDrawingRefs 保存 host 文档引用。WorkspaceDocument v2 单份保存 workspace 共享内容。旧图表 v1／v2／v3 和工作台 v1 纯读取迁移；未解析坐标或未知工具失败保留原存储。恢复先预检，失败回滚图表配置、文档、历史和共享绑定。

恢复的本图 logicalId 不能已属于当前或准备采用的共享文档，即使共享对象暂时无法投影或未出现在引用数组中。此类冲突会拒绝恢复；作用域迁移使用 transfer 命令。失败回滚保留原迁移撤销历史，不覆盖其它图表已确认的共享内容。

## 共享与所有者

共享限主价格窗格、market 锚点、owner=local 的用户绘图；backend、指标副图、未来逻辑锚点和视口锚点保留本图。`resolveDrawingShareKey(confirmedContext)` 必须由宿主给出 `{identity, documentId?}` 或 `{reason}`：identity 含不透明 namespace、完整 market/exchange/ticker/priceCurrency 和明确 priceBasisKey。库不解析 provider 的私有 basis，也不补猜币种、tick 或复权方式。

ChartWorkspace 自有 workspace DrawingSessionRegistry，图表通过 bindDrawingWorkspace 借用；工作台释放所有投影后关闭自有 registry。宿主共享需要显式自有 DrawingDocumentStore 与 host registry，通过 drawingHostSessions 借给图表；图表销毁只退订，最终所有者调用 registry.dispose，再关闭 store。store 不拥有行情；SSR 不打开 IndexedDB。

bindDrawingWorkspace 等待原行情加载器确认上下文及实际会话绑定，读取失败会拒绝。切换上下文或销毁会取消本图的等待，不取消其它借用者的存储读取。工作台每次接受后继图表实例都会重新接入原 registry；绑定完成前不会将该实例作为就绪图表公开。

```ts
const store = createIndexedDBDrawingDocumentStore()
const sessions = new DrawingSessionRegistry({ scope: 'host', store })
// 仅在客户端，将 sessions 和宿主实现的 resolveDrawingShareKey 传入 ChartProOptions。
// resolveDrawingShareKey 须给出稳定 documentId，不能在每次重试生成新 ID。
// 所有借用图表释放后：
sessions.dispose()
store.dispose()
```

DocumentStore 的 read/write 使用 namespace 和固定 documentId；write.expectedRevision=null 表示仅创建，更新携原 revision。dirty／saving／saved／error／uncertain 区分本地确认与持久确认。冲突保草稿；显式丢弃后刷新，或用宿主 createDrawingDocumentId 提供的新目标另存。不同实例用显式刷新取得存储更新，本版不自动合并或实时协作。

scope 命令选择新工具作用域，transfer 移动既有对象，shared 命令保存／刷新／另存。迁移保原 logicalIds，核对权限和两端文档。未知迁移锁住原目标，不能改道。离开 host 时，同次写入包含只读 transfers 恢复记录；它不作为可写对象投影。刷新核对后使用 recover-transfer 按记录作用域恢复原 IDs，确认目标及撤销历史后清理记录；清理等待或未知期间阻止丢责任的切换。原图关闭时只使无法恢复到该图的迁移历史失效，不销毁共享内容或阻塞其余历史。

## 模板与偏好

DrawingPreferencesStore.read/write 携 AbortSignal；drawingPreferencesScope 是宿主不透明 scope。默认仅实例内存，显式传入 createIndexedDBDrawingPreferencesStore 后跨刷新保存。加载迟到时保留原模板及本次字段修改；读取失败不覆盖未读原件，界面保留会话修改并允许重试。

模板包含本工具样式与参数，不含点、正文、身份、后端 ID 或共享作用域。template 命令支持保存、覆盖、改名、删除、应用和默认；异类工具只能显式选择共同样式。参数通过目录校验，snapshot.parameters 是唯一权威，engine extendData 中的派生参数不作为第二份内容保存。

## 绘制与精确编辑

可变点工具用 Enter 或“完成绘制”结束；Esc 取消。Shift 约束屏幕角度，空格临时平移并保留未完成预览。控制点支持方向键 1px、Shift＋方向键 10px；整体拖动结束只提交一次，Alt 拖动克隆重新取得目标归属。隐藏和周期过滤的对象不会被画布框选。

设置面板可以选择对象自己的价格轴、编辑锚点和工具参数。控制点及价格／时间标签都按该轴投影。未来逻辑锚点只标后续根数，亚根位置标参考时段比例，不构造未来交易日期。重开布局时保存轴引用映射到新实例真实轴。

回归工具使用已加载 OHLC 的 OLS 与总体残差标准差；根数测量与自然时长分别显示。Fib 参数在价格值域计算后投影，多空头只计算价格、已知 tick 和盈亏比。对数域非正派生价格、零风险或无效止损方向显示不可用原因。

文档 ID、绘图逻辑 ID 和 revision 均为不透明字符串，消费者不应依赖 UUID 格式。首方生成使用浏览器 `crypto.getRandomValues`，不要求 `randomUUID`；保存原有 ID 和 revision 时不重生成。

## 量价绘图（0.11） {#volume-drawings}

在“全部绘图工具”中搜索“锚定 VWAP”或“固定区间成交量分布”，点击真实历史选起点／两端。控制点、键盘微调和设置页只改变时间；左右键移动一根真实 bar，Shift 移动十根；端点价格只用于几何操作，不是均价输入。画布和控制点焦点均支持这些键盘操作。时间柄跟随当前 bar 的显示位置，旧占位价格离开可见价格区间也能继续操作；其屏幕位置不写回定义。仅支持主价格 pane、market 锚点。结果和不可用原因可在选中后的图内摘要或对象管理中查看。

| 工具 | 参数与默认值 | 估算规则 |
| --- | --- | --- |
| `anchoredVwap` | `source: 'hlc3'`；可选 close、hl2、hlc3、ohlc4；`algorithm: 'bar-price-volume-v1'` | 从起点按 bar 时标累计 `sum(source × volume) / sum(volume)`，不按会话重置 |
| `fixedRangeVolumeProfile` | `rows:48`、`valueArea:0.7`、`mode:'total'`、`algorithm:'bar-range-uniform-v1'` | 两端闭区间内，每根 bar 的量按其 high-low 与等宽价格行的重叠比例分配；平价 bar 全部落在对应行 |

FRVP 设置提供 24/48/96/192 行、50/60/68/70/80/90/95% 价值区及 total/up-down。API rows 接受 1–256 整数、valueArea 接受有限 `(0,1]`。上涨量指 close>=open 的 bar 分配量，下跌量指 close<open，不等于主动买卖量。所有 bar 同价时保留真实单价一行。

POC 选择成交量最大的行；并列取最靠近全价格区间中心者，再并列取低价行。价值区从 POC 向相邻量较大侧逐行扩展，相同优先低价；VAH/VAL 为行边界。整行纳入可能超过目标，摘要显示实际比例。这是公开定义的 OHLCV 估算，不保证与 TradingView 私有分布算法相同。

成交量缺失、负数、非有限或 OHLC 无效时不可计算；不会当作零或跳过坏数据。零量不贡献，累计量／全区间量为零时无均价／POC。VWAP 坏段不以前值填补；有限性和分箱总量守恒失败会显示原因。log 轴不能投影派生价格时，图内提示切换线性轴。

分析只使用本图已确认数据。同根 volume 替换、分页、修订重载、标的／周期／basis 切换后重算。原锚点历史未加载时保留对象并提示加载历史，不能把窗口首根当原起点；原行情读取失败或待修订时标为 stale，重试原行情读取；请求等待和订阅恢复失败期间仍保留 stale，成功确认后才清除。图内“重试”会恢复原失败查询；只有来源状态错误时会重新确认已加载区间。公开 retryData 在没有失败查询时仍幂等完成。跨周期按当前 bar 时标采样，显示真实参与范围和根数，不拆分 bar、不补缺口，始终标明“仅按已加载数据估算，覆盖未声明”。回放尚未到右端可以显示部分区间；没有到起点则不可用。

`getDrawingState().analytics?.[logicalId]` 提供 status（calculating/ready/unavailable/stale）、method、可选 period、requestedRange、可选 actualRange、count、coverage、boundarySampled、replayPartial、reason 和 summary。summary 只含均价／累计量／源，或总量／POC／VAH／VAL／实际价值区比例／行数，不返回曲线或分箱数组。状态副本可安全读取；保存和共享仍只传定义，各图按自己的周期独立计算。

## 对象树与排序

命名组支持折叠；搜索临时展开命中组，清空后恢复原折叠。列表只挂载 viewport 和 overscan 中的真实行，滚动外的选择仍保留。方向键、Home/End 会先挂载目标再聚焦；当前行卸载时焦点停在树容器，删除聚焦行后移到相邻行，不抢占树外输入焦点。

拖动手柄放到同组对象前后，或用“排序目标／位置”选择器确认。触点使用同一手柄；边缘自动滚动，Esc、取消或上下文变化终止未提交拖动。程序调用：

```ts
await chart.executeDrawingCommand({
  type: 'reorder', ids: ['first'], targetId: 'second', position: 'before'
})
```

位置按树显示顺序解释。仅同文档、同 scope、同 pane、同组可排序；不隐式改组，锁定／迁移／uncertain 对象拒绝。多选相对顺序保留，确认、undo/redo 与旧 direction 命令共用原历史。

重排保持原整数 order；插入处间隔不足时经所有受影响对象的权限检查统一重编号，仍可保存／共享和撤销重做。长名称在固定行内截断，完整名称可通过悬停或可访问名称读取，动作按钮保持本对象归属。

## 0.12 属性与量价精修 {#drawing-refinement}

单选和多选共用“绘图属性”栏：多选只显示工具能力交集，不同值显示“混合”。文字颜色独立于描边；透明填充可以设置后清除。颜色按钮、原生自定义颜色输入、线宽／线型／字号选择器支持键盘，Esc关闭色板并返回触发按钮。窄图停靠底部，目标至少44px。锁定、迁移、uncertain、混合文档或尚未确认的设置草稿会显示禁用原因。一次共同样式操作沿原命令确认并形成一笔撤销；失败保留逐对象真实结果。

自定义 `DrawingToolDescriptor.styleControls` 可声明 `stroke/fill/lineWidth/lineStyle/textColor/fontSize`。省略时沿旧常规描边／线宽／线型，`[]`表示无快捷样式；没有style设置的工具不显示这些控件。模板应消费标准 `overlay.styles.line/polygon/rect/circle/arc/text` 键。工具参数模板只适用于同工具；“只应用共同样式”仅复制能力交集，不改正文、锚点、独立轴或参数。

AVWAP旧定义缺少新字段时等价于 `bandMode:'none'`。开启带后，价格源仍为原source，公开中心仍为 `mu=sum(p*v)/sum(v)`。标准差半宽为 `multiplier*sqrt(sum(v*(p-mu)^2)/sum(v))`，即source价格的volume加权总体标准差，不使用n-1，也不是VWAP序列的样本标准差。百分比半宽为 `abs(mu)*multiplier/100`，负中心和零中心均按此公式处理。

| 参数 | 默认与允许范围 |
| --- | --- |
| `bandMode` | `none`；或`standard-deviation`、`percentage` |
| `bandMultipliers` | `[1,2,3]`；1–3个互异有限正数；标准差模式≤10，百分比模式≤100 |
| `bandFill` / `bandOpacity` | `true` / `0.12`；透明度为有限[0,1] |
| `bandAlgorithm` | 固定`ohlcv-vwap-bands-v1` |

零量不贡献；坏样本沿原不可用语义处理。未开启带不累计矩；同根替换、追加、分页和回放使用原确认范围。有限中心但带不可表达时保留中心并给出带不可用原因，不伪造零宽带；对数轴只显示可投影的连续边界。`analytics[id].bands`是可选摘要 `{mode,method,values:[{multiplier,lower,upper}],reason?}`，缺失表示未启用；已选但无可用边界返回空values和原因。不公开矩数组。

FRVP新增 `profileSide:'left'|'right'`（默认left）、`profileWidth`有限(0,1]（默认0.3）以及 `levelExtent:'profile'|'range'|'pane-right'`（默认profile）。宽度按所选时间区间的屏幕宽度计算，最小24px并限制在pane内。`showPoc/showVah/showVal`默认true；各自的 `poc/vah/valColor`、`Width`、`Style`是平坦parameters：颜色为#RRGGBB/#RRGGBBAA/transparent，宽度有限[1,4]，线型为solid/dashed/dotted。显示变化不重新分箱；向右延长只改变价位线显示，不把第二锚点之后的行情纳入统计。重合价位标签合并说明，价位本身不偏移。

## 曲线与圆弧 {#curves}

`curve`依次点击起点P0、终点P1、控制点P2，按P0/P2/P1绘制二次贝塞尔；`doubleCurve`再增加P3，按P0/P2/P3/P1绘制三次贝塞尔。`arc`依次点击起点、终点、弧上第三点，在当前屏幕投影中求经过三点的圆弧。选中显示辅助连线和原控制点；辅助线不抢占曲线命中。整体／控制点拖动、键盘、样式、模板、克隆、撤销和保存走原命令链。

锚点是持久权威，屏幕曲率随价格轴、缩放、pane尺寸和DPR重新投影；这不是价格域的圆。绘制和命中共用误差≤0.5 CSS px、最多2048段的线段。共线、重合、非有限或细分不足时保留定义与可编辑控制点并报告原因，不画假直线。未来logical锚点只限本图；共享仍只接受原主图market锚点。

## 第三方工具接入 {#third-party-drawings}

先从peer `klinecharts`调用公开 `registerOverlay`，再把稳定命名空间名称和目录传给构造器。未注册模板在创建DOM实例前明确失败；多个图可复用登记，销毁一图不删除全局模板。目录定义不保存函数或账户数据，也不因全局注册取得系统对象的编辑权限。

原生JS及TS可复制接入见[绘图工作台示例](https://github.com/evotrader/TradingChest/tree/main/examples/drawing-workbench)。示例的`EXAMPLE/AnalysisZone`仅使用公开`trading-chest/chart`、peer引擎、普通OHLCV和原生IndexedDB，无EvoTrader DTO、地址或专属框架API。

## 0.13 画线提醒与曲线显示 {#drawing-alerts}

从属性栏或绘图管理选择单个来源，点击“添加提醒”；“提醒管理”始终可单独打开。支持本图已确认的水平线、直线、线段及射线，local/backend 保留原归属。条件与频率使用选择器，默认仅一次。继续监控保留去重，重置并启用清去重并保触发历史。仅本页运行、关闭后停止，未收到的价格不补报。有限线段进入／离开域不算穿越；持续监控请选择直线或正确方向射线。

三曲线的设置增加起点／终点 none/arrow/circle、背景开关与[0,1]透明度。背景由曲线和两端直弦闭合，填充色沿标准 polygon.color，默认沿实际描边；不成为控制点或截获填充区域命中。旧定义保持关闭。显示变更不改变曲率或原细分误差与段数；同工具参数模板保全部参数，跨工具仅共同样式保持原交集语义。

规则文档独立于布局；稳定 scope、恢复暂停、确认数据、实时／回放隔离、后台边界及原生 IndexedDB 组合例子见[0.13 升级说明](./upgrade/0.13.0.md)。
