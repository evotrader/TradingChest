# 第三阶段：只读成交复盘导航（候选，未完成验收）

2026-10-14。基线 TradingChest 3bd1d403 / EvoTrader 1104162d。

## 本批范围

收益日历选择已完成估值行后，使用后端估值游标区间关联当前查询时间窗内的成交回执，再打开该回执真实 instrument_id 的目录行情。不是收益归因，不代表会话全部成交，不发起订单或保存成交注释。

公开 API：onDataReady({symbol, period}) 在当前有效历史数据加载后通知；locateTimestamp({ticker, period, timestamp}) 返回 exact-timestamp / reference-window / unavailable。仅在当前实例、匹配标的和周期、历史准备完成且非回放时使用。

- exact-timestamp 只表示图表毫秒时标相同，不证明成交属于该根 K 线。
- reference-window 只定位两条已存在行情时标之间的参考窗口；仅分钟／小时固定周期且间距不超过周期。
- 缺口、范围外、无数据、不支持区间语义的周期均不吸附最近 K 线。
- 按真实数据索引滚动，不推断开收盘区间、不把原成交价叠加到复权图。
- 切换选择、周期、快照或卸载会取消请求并隔离迟到结果。

## 后端字段契约

PerformanceRow 新增可空 review_cursor_from_exclusive 与 review_cursor_to_inclusive，仅在 ready 的 session 行提供真实前后估值 canonical_cursor。成交关联条件为同 account_scope_id 且 from < canonical_cursor <= to；还受原始快照查询时间窗约束。沿同一 read_token 完整读取分页，错误不降级为无成交。无字段时不按日期猜配。

## 已验证和待验收

根环境库全量 35 文件 / 363 测试通过；完整 JS / 声明构建通过。消费者新增三个单元测试文件共 19 测试通过，覆盖分页、身份、取消、重试及图表就绪。Python 语法编译通过。PerformanceRow 类型块从实际模型 OpenAPI 生成；完整后端导出一致性仍待检验。

待完成：Mac 全量前端类型检查／构建及真实 Chrome 库导航脚本；真实项目 Python 环境内 Paper 财务测试及后端驱动浏览器链路。当前 Mac 没有项目虚拟环境和定制 nautilus_trader==1.230.0+evotrader.1，不能以纯前端夹具代替后端验收。本候选不得标记整阶段完成。

同步布局、撤销／重做、实时比较及延迟预算仍不在本批完成范围。回退采用上述基线代码和消费者 gitlink 配对；无数据迁移或持久账户状态变更。
