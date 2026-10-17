# 数据说明

## 周期
```typescript
interface Period {
  // 时间跨度乘数，如1，3，5
  multiplier: number;

  // 时间跨度，如'year'，'month'
  timespan: string;

  // 文字，用于显示，如'1H'，'5H'
  text: string;
}
```

## 标的信息
```typescript
interface SymbolInfo {
  // 唯一标识
  ticker: string;

  // 标的名
  name?: string

  // 标的简短名
  shortName?: string

  // 交易所
  exchange?: string

  // 市场分类
  market?: string

  // 价格精度
  pricePrecision?: number

  // 数量精度
  volumePrecision?: number

  // 价格币种
  priceCurrency?: string

  // 类型
  type?: string

  // logo url
  logo?: string
}
```

## 历史数据与状态

0.8.0 的历史入口返回对象 `HistoryResult`，不返回裸数组。`HistorySnapshot` 共用 bars、basis?、metadata?；`ChartSnapshot` 另含 symbol 和 period。bars 的 timestamp 为 Unix 毫秒，升序唯一，不能填造休市 bar。basis 属于这次响应，不是来源名。

`HistoryQuery` 为 `{kind:'before',before,countBack}` 或 `{kind:'range',from,to}`。before 不含上界，countBack 是期望根数而非自然周期；range 为完整 `[from,to)`。before 必须返回 boolean hasMoreBefore，短页／空窗口不证明穷尽。range 可省略边界；partial range 不表示完整快照。

可选 metadata 为 `{state:'ready'|'empty'|'partial',sourceTimestamp?,delayMs?}`。来源观察时刻与声明延迟未提供时显示未知，不由 HTTP 或末根时标推导。ChartDataState.dataStatus 描述全部已确认数据，lastRead 只描述本次成功提交读取；连接能力未声明时为 unknown。详细边界、重试及接口见[数据接入](./data-access)和 [API](./api#_0-8-0-数据接口)。

## 工作台记录

WorkspaceDocument.version 仍为 1，各窗格 chart 仍为 ChartLayoutV3。持久记录外层的 `{id,name,updatedAt,revision,document}` 承载命名管理；scope 为宿主原 context，ID/revision 不透明。行情、分析数据、运行时句柄不入文档。异步 WorkspaceStore 的更新／删除使用 expectedRevision；冲突不自动覆盖。旧键仅通过显式导入读取，原件保持不变。
