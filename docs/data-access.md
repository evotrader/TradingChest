# 接入数据
可以使用默认的数据，和自定义数据完成数据接入。

## 使用默认数据
默认数据来源于 https://polygon.io/ ，在使用前需要去申请API key。申请完成后，通过内置`DefaultDatafeed`这个类完成数据接入。
示例：
```typescript
import { KLineChartPro, DefaultDatafeed } from '@klinecharts/pro'
const chart = new KLineChartPro({
  container: document.getElementById('container'),
  datafeed: new DefaultDatafeed(`${polygonIoApiKey}`)
})
```

## 使用自定义数据
需要使用自定义数据，只需要按如下步骤即可。

### 第一步，实现数据接入API
```typescript
class CustomDatafeed {
  /**
   * 模糊搜索标的
   * 在搜索框输入的时候触发
   * 返回标的信息数组
   */
  searchSymbols (search?: string): Promise<SymbolInfo[]> {
    // 根据模糊字段远程拉取标的数据
  }

  /**
   * 获取历史k线数据
   * 当标的和周期发生变化的时候触发
   * 
   * 返回标的k线数据数组
   */
  getHistoryKLineData (symbol: SymbolInfo, period: Period, from: number, to: number): Promise<KLineData[]> {
    // 完成数据请求
  }

  /**
   * 订阅标的在某个周期的实时数据
   * 当标的和周期发生变化的时候触发
   * 
   * 通过callback告知图表接收数据
   */
  subscribe (symbol: SymbolInfo, period: Period, callback: DatafeedSubscribeCallback): void {
    // 完成ws订阅或者http轮询
  }

  /**
   * 取消订阅标的在某个周期的实时数据
   * 当标的和周期发生变化的时候触发
   * 
   */ 
  unsubscribe (symbol: SymbolInfo, period: Period): void {
    // 完成ws订阅取消或者http轮询取消
  }
}
```

### 第二步，接入自定义数据
```typescript
import { KLineChartPro, DefaultDatafeed } from '@klinecharts/pro'
const chart = new KLineChartPro({
  container: document.getElementById('container'),
  datafeed: new CustomDatafeed()
})
```

## 0.6.0 引擎迁移

本版固定 `klinecharts@10.1.0`，`getChart()` 返回 v10 Chart。宿主使用库自有 Period，加载器统一转换为 `{type, span}`；直接调用引擎时使用 v10 的字符串 action、`getIndicators(filter)`、`getOverlays(filter)` 和独立价格轴。旧 `applyNewData`／`updateData` 不再可用。

`reloadData({preserveViewport:true})` 先成功读取，再替换数据。失败保留最后确认的行情、视窗与绘图；回放中须先用退出／重试入口恢复实时模式。币种等元数据缺失时显示未知，不从标的名称推断。

当前布局只通过 `captureLayout`、`saveLayoutV3`、`loadLayoutV3`、`restoreLayout`、`deleteLayoutV3`、`listLayoutsV3` 写读 v3。读取结果为 `ok`／`missing`／`error`；错误携带 code 和 message。旧 v1／v2 只在内存迁移，原键保留；新版损坏不会回落旧记录。恢复前先准备同身份、同周期的数据。后端标注只保存引用，本地绘图须显式提供 IDs，订单、成交、持仓及报警状态不写入布局。

设置面板和快捷键使用 `getYAxes`／`overrideYAxis` 修改真实价格轴，名称为 `normal`／`percentage`／`logarithm`；价格轴类型不再写入 `styles.yAxis.type`。

图表支持浏览器打包及 UMD，React 分析入口保持独立。原始 Node 图表导入不属于 SSR 支持范围。CJS 浏览器子入口为规避上游 CJS→ESM 型 UMD 入口缺陷，打包同一发布版的真实 ESM 引擎；ESM 和 UMD 仍消费固定 peer。
## 权威快照续读

宿主可以调用 `chart.applySnapshot({symbol, period, bars, basis})`。`symbol.ticker` 必须为当前完整标的 ID；周期也必须完全相同。`bars` 必须按时标严格递增且 OHLCV 有效，重复和错身份会拒绝。

同根修改和新根通过当前引擎订阅 callback 更新；更早数据的修订先重读整个已加载范围，成功后替换并保留视窗和绘图，不触发实时报警。缺少旧行不代表删除。回放中只保留待应用输入，退出时重读权威历史。

`Datafeed.getHistoryKLineData` 可返回原数组，或 `{bars, basis}`。`basis` 是该次读取的口径标识，例如后端 `adjustment_status` 与 `adjustment_basis` 的组合，必须与 bars 同次取得；不能使用全局“最后一次”状态。口径变化时必须成功读齐已加载时标才能替换；失败保留旧图并显示恢复错误，下一次快照或重试继续恢复。


`onDataState` 返回引擎已确认的 `basis`、末根 `timestamp`、`restoring`、`replay` 和错误。宿主应据此标注当前图形口径；刚收到 HTTP 新口径不等于旧图已完成替换。实盘历史分页通过 `adjustment_end` 沿用当前序列的参考日期，并比较实际累计因子，不能仅比较 adjusted 状态。
## 工作台宿主

每个 `WorkspaceCell` 有稳定 `cellId`、完整 symbol、period 和 context。`mountCell` 必须为本窗格构造并释放独立 provider，不得共享单回调 feed。目录读取遵守传入的 AbortSignal；移除窗格、身份切换和销毁会取消本窗格工作，不取消其他窗格。

`captureOptions` 只返回确实由本实例用户创建的本地绘图 ID 和后端标注引用。禁止将订单、TradeVis、报警状态或 API 标注复制为本地布局对象。布局恢复不调用标注写接口。
