# 绘图覆盖与对标差距

目录含 51 个旧普通工具、2 个量价工具和3种曲线，共56项。所有工具使用同一命令、确认历史、设置和持久化路径。逐工具浏览器脚本检查创建、取消编辑、确认编辑、撤销重做、删除和恢复；Fib、通道／音叉、回归、多空头另有独立数值预期。目录覆盖不表示所有 TradingView 工具等价。

| 稳定工具 ID | 名称 | 点数 |
| --- | --- | --- |
| horizontalStraightLine | 水平线 | 1 |
| horizontalRayLine | 水平射线 | 2 |
| horizontalSegment | 水平线段 | 2 |
| verticalStraightLine | 垂直线 | 1 |
| verticalRayLine | 垂直射线 | 2 |
| verticalSegment | 垂直线段 | 2 |
| straightLine | 直线 | 2 |
| rayLine | 射线 | 2 |
| segment | 趋势线 | 2 |
| arrow | 箭头 | 2 |
| priceLine | 价格线 | 1 |
| crossLine | 十字线 | 1 |
| trendAngle | 趋势角度 | 2 |
| priceChannelLine | 价格通道 | 3 |
| parallelStraightLine | 平行直线 | 3 |
| pitchfork | 安德鲁斯叉 | 3 |
| schiffPitchfork | 希夫叉 | 3 |
| regressionTrend | 回归趋势 | 2 |
| regressionChannel | 回归通道 | 2 |
| circle | 圆 | 2 |
| rect | 矩形 | 2 |
| parallelogram | 平行四边形 | 3 |
| triangle | 三角形 | 3 |
| ellipse | 椭圆 | 2 |
| rotatedRect | 旋转矩形 | 3 |
| curve | 曲线 | 3 |
| doubleCurve | 双控制点曲线 | 4 |
| arc | 圆弧 | 3 |
| fibonacciLine | 斐波那契回撤 | 2 |
| fibonacciSegment | 斐波那契线段 | 2 |
| fibonacciCircle | 斐波那契圆 | 2 |
| fibonacciSpiral | 斐波那契螺旋 | 2 |
| fibonacciSpeedResistanceFan | 斐波那契阻速扇 | 2 |
| fibonacciExtension | 斐波那契扩展 | 3 |
| gannBox | 江恩箱 | 2 |
| xabcd | XABCD 形态 | 5 |
| abcd | ABCD 形态 | 4 |
| threeWaves | 三浪 | 4 |
| fiveWaves | 五浪 | 6 |
| eightWaves | 八浪 | 9 |
| anyWaves | 任意波浪 | 可变 ≥2 |
| priceRange | 价格范围 | 2 |
| dateRange | 日期范围 | 2 |
| dateAndPriceRange | 日期和价格范围 | 2 |
| textAnnotation | 文字 | 1 |
| callout | 气泡标注 | 2 |
| note | 便签 | 1 |
| brush | 画笔 | 可变 ≥2 |
| highlighter | 荧光笔 | 可变 ≥2 |
| polyline | 折线 | 可变 ≥2 |
| priceLabel | 价格标签 | 1 |
| anchoredVwap | 锚定 VWAP | 1 |
| fixedRangeVolumeProfile | 固定区间成交量分布 | 2 |
| anchoredText | 固定文字 | 1 |
| longPosition | 多头仓位 | 3 |
| shortPosition | 空头仓位 | 3 |

## 高频交互覆盖

| 项目 | 行为 | 验证入口 |
| --- | --- | --- |
| U01 | 发现/搜索/收藏 | drawing-workbench / drawing-tools |
| U02 | 步骤/连续/完成/取消 | drawing-input / drawing-tools |
| U03 | 多选/框选/隐藏保护 | drawing-input / drawing-input-audit |
| U04 | 控制点/整体/微调/单次确认 | drawing-input / drawing-input-audit |
| U05 | 坐标/轴/样式/确认取消 | drawing-tools / drawing-reopen |
| U06 | 多行/组合输入/对齐背景 | drawing-input / drawing-workbench |
| U07 | 对象树/搜索/定位/显隐锁 | drawing-workbench |
| U08 | 分组/组名/排序 | drawing-workbench / workbench-core |
| U09 | 复制粘贴/Alt克隆 | drawing-input / workbench-core |
| U10 | 模板/默认/收藏/快捷键重开 | drawing-workbench / integration drawing-workbench |
| U11 | 周期过滤 | workbench-core / drawing-workbench |
| U12 | 多图/会话/移除源/保存恢复 | drawing-sharing / drawing-sharing-cleanup / drawing-reopen |
| U13 | 失败/部分/未知/慢提交 | history / session / drawing backend stage |
| U14 | 320px/单双四图/DPR/边界 | drawing-touch / drawing-sharing / drawing-performance |
| U15 | 键盘/焦点/触屏菜单 | drawing-input-audit / drawing-touch |

## 明确差距

TradingChest 共享限于已确认价格身份的本地主图市场锚点，后端标注保留原业务权威。多空头绘图不计算账户数量、资金或杠杆。更细周期／逐笔成交量分布、更多 Gann/Fib/波浪、曲线无限延伸、图片贴纸、更多工具的画线提醒、后台通知和订单联动仍为后续候选。没有承诺逐像素外观或账户模型一致。

对标参考：[TradingView drawings](https://www.tradingview.com/charting-library-docs/latest/ui_elements/drawings/), [tool families](https://www.tradingview.com/charting-library-docs/latest/ui_elements/drawings/Drawings-List/), [position tool](https://www.tradingview.com/support/solutions/43000517002-long-position-drawing-tool/).

同任务流程由安装包独立示例的 `tests/integration/drawing-comparison.mjs` 执行：两条支撑线、矩形、文字、Fib，多选改样式、分组、当前周期过滤、多图共享及保存重开。官方演示连接失败时，仅作官方文档对标，实际结果和截图由本地验收产物记录。

## 0.11 同类任务对照

本轮仅核对官方资料，并在 TradingChest 本地执行对应任务，没有操作 TradingView 在线产品或声称操作提速。

| 任务 | 官方资料说明 | 本地交付与边界 |
| --- | --- | --- |
| 选择锚点并调整 VWAP | [AVWAP](https://www.tradingview.com/support/solutions/43000669764-anchored-vwap-drawing-tool/) 从用户选点开始绘制 | 图上选点、曲线命中、时间编辑、价格源及真实样本摘要；按当前周期 OHLCV 估算 |
| 选区间并修改分布 | [FRVP](https://www.tradingview.com/support/solutions/43000480324-fixed-range-volume-profile-indicator/) 有分箱与分辨率选择规则 | 两点区间、行数、POC／价值区、单根单价；采用公开 bar-range-uniform-v1，不请求更细周期，不声称数值等价 |
| 整理与保存绘图 | [Drawings](https://www.tradingview.com/charting-library-docs/latest/ui_elements/drawings/) 提供绘图及对象管理能力 | 分组折叠、虚拟树、搜索、拖排／键盘目标选择；原 v4／v2 保存与共享 |

## 0.12 同类任务对照

2026-10-21实际访问TradingView匿名图表成功；尝试创建水平线时出现要求注册／登录的提示，因此未完成其绘图同任务流程。以下依据官方资料和本地真实流程，不报告TradingView操作步数、耗时或算法等价。

| 任务 | 官方参考 | TradingChest范围 |
| --- | --- | --- |
| 多选→模板→撤销／重开 | [同类工具批量模板](https://www.tradingview.com/support/solutions/43000677801-how-to-apply-a-template-to-several-tools-of-the-same-type-at-once/) | 混合值、共同能力、同工具参数模板／跨工具共同样式、确认历史及原生IDB |
| AVWAP带开关 | [带与倍数](https://www.tradingview.com/blog/en/vwap-improvements-across-the-board-28974/) | 三组自有公开公式，未主张与其数值相同 |
| FRVP显示设置 | [参数与Extend Right](https://www.tradingview.com/support/solutions/43000480324-fixed-range-volume-profile-indicator/) | 左右／宽度／价位线样式；本库延长不扩统计范围，官方Extend Right会纳入右端之后的bar |
| 曲线控制点 | [Curve/Double curve](https://www.tradingview.com/support/solutions/43000791740-curve-and-double-curve-drawing-tools/) | 二／三次贝塞尔及三点圆弧；屏幕几何；0.13增加端点标记和曲线背景，仍不含无限延伸 |

本地证人包含`drawing-refinement`、`drawing-curves`和安装版`drawing-comparison`／第三方示例。正式完成状态及失败记录以本轮实施SUMMARY为准；入口存在不代表全部验收通过。

0.13 首批画线提醒只覆盖水平线、直线、有限线段和有向射线，基于已观测 close；不等同 TradingView 网站全部技术提醒，也不提供后台服务。仅本图、主价格轴 market 锚点；backend 只读原确认来源。曲线端点及闭合背景不改变定义。具体边界见[0.13说明](./upgrade/0.13.0.md)。
