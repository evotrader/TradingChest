# 接入数据

宿主提供每图独立的 Datafeed，真实目录决定 SymbolInfo 与 Period。库不依赖某个交易系统的 DTO、鉴权或接口路径。

```typescript
import type {Datafeed,DatafeedRequestContext,HistoryResult,SymbolInfo,Period} from 'trading-chest/chart'
```

| Datafeed 方法 | 契约 |
| --- | --- |
| searchSymbols(search?) | `Promise<SymbolInfo[]>`，返回真实有效目录 |
| getHistoryKLineData(symbol,period,from,to,context?) | `Promise<HistoryResult>`，按当前身份及窗口读取 |
| subscribe(symbol,period,callback) | 给当前图提供真实 bar 更新 |
| unsubscribe(symbol,period) | 暂停该实例订阅 |
| dispose?() | 最终释放自有连接／资源 |

`context.signal` 用于取消读取，reason 为 initial/load-more/resume。不要跨图共享单回调 provider。HistoryResult 是 KLineData[] 或 `{bars,basis?}`；bars 使用 Unix 毫秒、严格递增唯一时标和有效 OHLCV。basis 必须与此次 bars 同源读取，不用全局最后状态。周期是宿主 `{timespan,multiplier,text}`，内部统一转 v10 `{type,span}`。

## 权威快照与确认

`applySnapshot({symbol,period,bars,basis})` 接完整权威快照。身份必须匹配当前图。续读与同根更新走唯一 loader；更早修订／basis 变化先成功读取已加载范围再提交，失败保留最后确认数据、视窗和绘图。缺行不自动代表删除。回放保留待应用快照，退出主图与比较组合恢复成功后再继续订阅。

`onDataState` 返回已确认 basis、timestamp、restoring、replay 和 error；收到 HTTP 新口径不表示图形已提交。`onDataReady` 后调用 getAnalysisContext，分析层必须绑定该 token。标的／周期／确认口径变化后重新提供图层，同口径续读保持。

## 分析结果快照

分析层只接受宿主显式快照，不发请求或建立另一份缓存。宿主沿原 AbortSignal、请求序号和结果归属控制返回顺序；replaceData 整批校验失败保旧。序列只匹配真实相同时标，无近邻、前填或插值。数据可用时刻与 PIT 由宿主声明，回放同时裁剪 timestamp 和 availableAt；时间戳单位为毫秒。

日级 YYYY-MM-DD 或其他有序标签走 label-series，不转成猜测日内时刻。保留原始数值与 null 位置；没有精确 availableAt，回放整层隐藏并说明。单位由来源声明：标准 EvoBacktest 净值初始为 1，不是金额；通用 API 不假定该业务含义。百分数点 1 表示 1%，缺币种不猜测。

未对齐事件保留原时刻并显示原因，点击由宿主打开详情。dataBasis 未知或不同的价格不能叠到 main 原价轴，可选择独立副图。

## 工作台与存储

每个 cell 的 mountCell 构造独立 provider，ready 在真实数据应用后完成，dispose 取消本 cell 工作。captureOptions 只返回真实本地绘图 ID 和后端标注引用；运行时分析层、订单、成交和报警不入布局，不因恢复调用标注写接口。显式传 storage 才启用保存，存储与业务数据由宿主维护。

DefaultDatafeed 仍是可选 Polygon 数据实现，使用时按其上游服务要求提供有效凭证；它不是无凭证的默认行情。无数据、失败、未对齐应区分展示，不把演示输入当生产回退。完整类型和错误／释放行为见 [API](./api)，独立隔离示例见[快速开始](./getting-started)。
