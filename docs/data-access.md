# 接入数据

宿主提供每图独立的 Datafeed，真实目录决定 SymbolInfo 与 Period。库不依赖某个交易系统的 DTO、鉴权或接口路径。

```typescript
import type {Datafeed,DatafeedRequestContext,HistoryResult,SymbolInfo,Period} from 'trading-chest/chart'
```

| Datafeed 方法 | 契约 |
| --- | --- |
| searchSymbols(search?) | `Promise<SymbolInfo[]>`，返回真实有效目录 |
| getHistoryKLineData(symbol,period,query,context?) | `Promise<HistoryResult>`，按当前身份及请求读取 |
| subscribe(symbol,period,callback) | 给当前图提供真实 bar 更新 |
| unsubscribe(symbol,period) | 暂停该实例订阅 |
| subscribeStatus?(symbol,period,accept) | 返回释放函数，通知连接、修订或错误，不携带行情 |
| dispose?() | 最终释放自有连接／资源 |

`context.signal` 用于取消读取，reason 为 initial/load-more/resume。不要跨图共享单回调 provider。HistoryResult 只接受对象 `{bars,basis?,metadata?,hasMoreBefore?}`；bars 使用可被 Date 表达的 Unix 毫秒、严格递增唯一时标和有效 OHLCV。basis 必须与此次 bars 同源读取，不用全局最后状态。周期是宿主 `{timespan,multiplier,text}`，内部统一转 v10 `{type,span}`。

历史读取交接时校验并复制 bars 数组、每根 OHLCV 对象与 metadata。provider 可继续维护自己的缓存；缓存后改不会直接改变已确认图形，后续价格变化仍通过订阅或快照提交。验证与取得副本在同一次遍历完成，loader 提交前仍复验。

`createSessionDatafeed` 在同一图表请求身份下保留同一完整会话。unsubscribe 仅暂停实时订阅并使未完成历史读取失效，随后 subscribe 继续使用该会话；标的／周期等请求身份变化或 dispose 才释放会话。历史与实时始终校验 source、adjustment、sessionFilter、timezone 等完整身份。

## 历史请求与边界

```typescript
type HistoryQuery =
  | {kind:'before'; before:number; countBack:number}
  | {kind:'range'; from:number; to:number}
interface HistoryMetadata {
  state:'ready'|'empty'|'partial'
  sourceTimestamp?:number
  delayMs?:number
}
interface HistorySnapshot {bars:KLineData[]; basis?:string; metadata?:HistoryMetadata}
interface HistoryResult extends HistorySnapshot {hasMoreBefore?:boolean}
```

`before` 严格不含上界；`countBack` 为正整数的**期望根数**，不是自然周期长度，也不保证每次返回该数量。`range` 完整读取 `[from,to)`，不裁成最后 countBack 根。不补造休市 bar，所有返回值须属于请求身份和范围。

before 响应必须有 boolean `hasMoreBefore`。false 只表示该来源允许的历史已经确认穷尽；短页、空窗口、超时或权限错误不能推导穷尽。非空短页可返回 true；空页加 true 是无进展响应，会被拒绝。无法确认边界时应报可重试错误。按日期接口寻找最近根数的适配器应共享一次取消／超时，并最多执行 24 次区间请求；未取得可提交数据又未确认穷尽时报告 `HISTORY_BOUNDARY_UNRESOLVED`。

range 的 `hasMoreBefore` 可省略，表示边界未知。partial range 不能作为完整的重载、复权或恢复快照确认。basis 只属于此次响应，不能从来源名称或 metadata 推导；不同 basis 不拼接。

## 已确认状态与重试

`onDataState.dataStatus`（unconfirmed/empty/ready）描述整个已确认数据集，向前读取空页不会把已有图表标为空。`lastRead` 记录本次成功提交的 `query/metadata?/hasMoreBefore?`，不宣称整个系列完整。`connection` 默认 unknown；可选 subscribeStatus 上报 connected/disconnected/reconnecting/failed。订阅安装成功不等于已连接。`revisionRequired` 提示应重载，`error/errorCode/operation` 给出失败原因和操作。

metadata 可省略。sourceTimestamp 是来源声明的观察时刻，delayMs 是来源声明的延迟；未声明时显示**未知**。不能用 HTTP 完成时刻、末根开盘时刻或本机时间差冒充新鲜度。ready 仅表示本次响应可用，empty 表示本次成功读取为空，partial 表示来源明确声明部分结果；均不等于可交易新鲜或市场历史完整。

`chart.retryData()` 重试失败的原请求；分页失败保留原 before 锚点，成功后合入更早数据并恢复继续分页；无失败请求时幂等完成。`reloadData({preserveViewport:true})` 先完整读取已加载区间再提交。失败保留 bars、basis、分析 token、视窗和绘图；身份切换或销毁取消旧请求与状态监听。

重载预取期间继续接收当前确认口径的分页与实时数据，提交时合并最新已确认集合，并保留等待期间用户调整的视窗。同口径下，等待期间已确认的新增或变化 bar 优先于迟到的 range 响应；其它历史修订仍采用响应值。更换口径时，响应必须覆盖提交时全部已加载时标；若等待期间新增数据未被覆盖，则保留当前图并报告可重试错误。空页重试的 empty 元数据只进入 lastRead，不标记合并后的非空集合为空。

## 权威快照与确认

`applySnapshot({symbol,period,bars,basis?,metadata?})` 接完整权威快照。身份必须匹配当前图。bars、basis 和 metadata 在同一提交点确认，预取或失败结果不提前发布 lastRead。续读与同根更新走唯一 loader；更早修订／basis 变化先成功读取已加载范围再提交，失败保留最后确认数据、视窗和绘图。缺行不自动代表删除。回放保留待应用快照，退出主图与比较组合恢复成功后再继续订阅。

`onDataState` 返回已确认 basis、timestamp、restoring、replay 和 error；收到 HTTP 新口径不表示图形已提交。`onDataReady` 后调用 getAnalysisContext，分析层必须绑定该 token。标的／周期／确认口径变化后重新提供图层，同口径续读保持。

## 分析结果快照

分析层只接受宿主显式快照，不发请求或建立另一份缓存。宿主沿原 AbortSignal、请求序号和结果归属控制返回顺序；replaceData 整批校验失败保旧。序列只匹配真实相同时标，无近邻、前填或插值。数据可用时刻与 PIT 由宿主声明，回放同时裁剪 timestamp 和 availableAt；时间戳单位为毫秒。

日级 YYYY-MM-DD 或其他有序标签走 label-series，不转成猜测日内时刻。保留原始数值与 null 位置；没有精确 availableAt，回放整层隐藏并说明。单位由来源声明，通用 API 不假定业务含义。百分数点 1 表示 1%，缺币种不猜测。

未对齐事件保留原时刻并显示原因，点击由宿主打开详情。dataBasis 未知或不同的价格不能叠到 main 原价轴，可选择独立副图。

## 工作台与存储

每个 cell 的 mountCell 构造独立 provider，ready 在真实数据应用后完成，dispose 取消本 cell 工作。captureOptions 只返回真实本地绘图 ID 和后端标注引用；行情、运行时分析层、订单、成交和报警不入布局，不因恢复调用标注写接口。

向 `ChartWorkspaceOptions.store` 注入异步 `WorkspaceStore` 才启用命名管理，原 storage/storageKey 构造参数已移除。库提供 `createIndexedDBWorkspaceStore({databaseName?})`，也可注入真实宿主服务。每次操作都带不透明 scope（原 context）、ID 和 revision。更新／删除比较原 revision，冲突报 `WORKSPACE_CONFLICT`，不自动覆盖。未提供 store 时禁用管理并说明原因，IndexedDB 不可用不会静默回落内存或 localStorage。

手动保存，不自动保存。加载先验证并暂存全部窗格，成功才替换当前工作台和选中记录；失败保留旧图。取消／超时不能证明写入没发生；保存结果待确认时读取同 scope/ID 核对，核对前禁用新存储变更。`importLegacy(name)` 显式将旧布局新增为可选条目，随后需要选择／加载；不自动加载，不删除或覆盖旧键。WorkspaceDocument v1、单图 v3 不变，ID／名称／revision 在存储外层。详见 [API](./api#工作台存储接口)。

DefaultDatafeed 仍是可选 Polygon 数据实现，需要上游有效凭证。其股票历史覆盖下界使用文档声明的 **2003-09-10**，仅适用于 `market:'stocks'`；不套用到其他 markets，也不表示每只股票当日已有数据。其他 markets 未知边界时不伪造穷尽。实时仍仅支持 `stocks / 1 minute / adjusted:false`，其他组合为历史读取；来源未声明的观察时刻或延迟保持未知。

无数据、失败、未对齐应区分展示，不把演示输入当生产回退。完整类型见 [API](./api)，独立隔离示例见[快速开始](./getting-started)，0.7.0 调用方迁移见 [0.8.0 升级说明](./upgrade/0.8.0)。

临时分析副图不具有持久绘图目标。库按当前图表的运行时 pane 所有权判断，在 UI／提交／整批恢复入口明确拒绝，且不调用标注写接口；主图上的分析层及普通指标副图不受此限制。布局捕获遇到指定本地 ID 仍在临时副图时保留对象并报错，不静默丢弃。

## 独立校验与契约测试模板

0.9.0 新增无 DOM 的 `trading-chest/testing`，直接重导出生产加载器使用的同一历史校验：

```typescript
import {validateHistoryQuery, validateHistoryResult, HistoryError} from 'trading-chest/testing'
import type {HistoryQuery} from 'trading-chest/testing'

const query: HistoryQuery = {kind: 'before', before: upperBound, countBack: 500}
validateHistoryQuery(query)
const result = await host.readHistory(symbol, period, query, signal)
try {
  validateHistoryResult(result, query)
} catch (error) {
  if (error instanceof HistoryError) console.error(error.code, error.message)
  throw error
}
```

成功返回原对象，不复制、不冻结。它能拒绝重复／乱序时标、无效 OHLCV、越界、缺失 before 边界声明和空页加 true；不能证明来源真实性、basis 准确或 false 的穷尽声明。数据进入图表时仍按原 loader 校验并取得副本。

[examples/datafeed-contract](https://github.com/evotrader/TradingChest/tree/main/examples/datafeed-contract) 提供普通 JS adapter 与 Node 内置 `node:test`／`assert` 测试模板。宿主提供 readHistory／subscribe／search，自己决定 URL、鉴权、单位与真实穷尽；模板不创建第二个生产数据源或通用 DSL。

可控源的预期应独立于 adapter：before 严格上界、短页仍有历史、完整半开 range、basis 随响应、空与失败、无效 OHLCV／乱序／重复、同根更新／追加、双图独立退订、重试与取消。假穷尽由夹具预期发现，不能用 validator 成功冒充正确。模板用实际 loopback HTTP 检查 AbortSignal 传到请求；这不要求所有 provider 的 transport 同步停止，核心仍隔离忽略 signal 的迟到结果。

React 的 `createDatafeed(signal)` 每次挂载创建独立实例，取消覆盖初始化；后续读取继续传 `context.signal`。工作台每 cell 同样独立。完整生命周期见[框架接入](./frameworks)。契约模板只证明所测适配行为，不替代真实来源核验、生产浏览器接线或真实后端 E2E。
