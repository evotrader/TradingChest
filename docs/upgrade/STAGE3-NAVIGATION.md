# 第三阶段：只读成交复盘导航（库已验收，消费者链路待后端验收）

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

TradingChest 产品 f7d1bf89：Mac 与根环境全量 35 文件 / 363 测试、完整 JS / 声明构建通过；Mac 原始 Chrome lifecycle.mjs 与 widgets.mjs 通过，包含新增导航断言。库 API 可独立接受；消费者主分支仍保持原 gitlink。

EvoTrader 产品候选 3ccefe4f：Mac 完整 37 页面构建、类型检查、6 项 Node 构建门禁通过。9 个目标文件首次 59 通过、1 个 widget mock 测试失败；同 SHA 隔离诊断及原批次一次复验 60 项通过。保留原失败，不声称间歇性测试问题根因已修复。

Next 编译会把外置 Solid 的 chart 子入口解析到服务端条件；消费者采用既有 bundled 根运行时入口并对齐实例类型，通过 next/dynamic 禁用 SSR。未扩大全局别名或更换依赖。

Python 仅语法编译通过。PerformanceRow 类型块从实际模型 OpenAPI 生成；完整后端导出一致性待检验。真实 Paper 财务测试及真实后端驱动的浏览器链路仍未执行。当前 Mac 没有项目虚拟环境和定制 nautilus_trader==1.230.0+evotrader.1，需要接入完整项目环境，不能以纯前端夹具代替后端验收。消费者候选不合主分支、不标记整阶段完成。

同步布局、撤销／重做、实时比较及延迟预算仍不在本批完成范围。回退采用上述基线代码和消费者 gitlink 配对；无数据迁移或持久账户状态变更。
