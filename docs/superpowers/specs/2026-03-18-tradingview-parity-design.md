# TradingChest → TradingView 图表能力对标设计

## 产品定位

TradingChest 定位为完全对标 TradingView 图表能力的开源交易图表库（不含数据、社区、脚本等平台能力），可高度自定义，不输于商业级产品。

## 架构基础

- **渲染引擎**: KLineChart 9.x（Canvas, 高性能, 30 内置指标, 14 内置 overlay）
- **UI 框架**: Solid.js（响应式, 轻量）
- **构建工具**: Vite（ESM + UMD 双格式输出）
- **外部依赖**: klinecharts (peer), solid-js, lodash

## 差距分析与实施路线

### Phase 1: 图表类型扩展（高优先级）

**现状**: 6 种（candle_solid, candle_stroke, candle_up_stroke, candle_down_stroke, ohlc, area）
**目标**: 12+ 种

新增:
1. **Heikin Ashi** — 自定义数据转换 + registerIndicator 渲染
2. **Baseline** — 基于基准线的双色区域图（klinecharts area 扩展）
3. **Renko** — 砖形图（纯价格, 忽略时间）
4. **Kagi** — 卡吉图（连续折线, 方向变化）
5. **Point & Figure** — 点数图（X/O 列, 时间无关）
6. **Line Break** — 新值线（基于收盘价比较）
7. **Hollow Candles** — 已有 candle_stroke，需 UI 暴露
8. **Range Bars** — 等幅柱图

### Phase 2: 技术指标扩展（高优先级）

**现状**: 28 个（UI 暴露）/ 30 个（引擎内置）
**目标**: 80+ 个

新增指标按类别:

**趋势类** (15+):
- VWAP, SuperTrend, Ichimoku Cloud, Alligator, Parabolic SAR(改进)
- DEMA, TEMA, WMA, HMA, KAMA, T3, VWMA, ZLEMA, McGinley Dynamic, Linear Regression

**波动率类** (8+):
- ATR, Keltner Channels, Donchian Channels, Historical Volatility
- Standard Deviation, Chaikin Volatility, Mass Index, Ulcer Index

**成交量类** (8+):
- VWAP, MFI, Chaikin Money Flow, A/D Line, VROC, Klinger Oscillator
- Accumulation/Distribution, Force Index

**动量类** (10+):
- Stochastic RSI, ADX, Aroon, Ultimate Oscillator, Fisher Transform
- Coppock Curve, PPO, DPO, KST, Twiggs Money Flow

**其他** (5+):
- Pivot Points (Standard/Fibonacci/Camarilla)
- Zig Zag, Volume Profile (简化版), Elder Ray

### Phase 3: 绘图工具扩展（中优先级）

**现状**: 29 个工具
**目标**: 45+ 个

新增:
1. **Andrew's Pitchfork** — 三点定义通道
2. **Schiff Pitchfork** — 变体叉形线
3. **Text Annotation** — 可编辑文字标注
4. **Callout** — 标注气泡
5. **Price Range** — 价格区间测量（显示幅度/百分比/柱数）
6. **Date Range** — 时间区间测量
7. **Price & Date Range** — 综合测量工具
8. **Brush** — 自由画笔
9. **Regression Trend** — 线性回归通道
10. **Regression Channel** — 带标准差通道
11. **Flat Top/Bottom** — 平顶/平底形态
12. **Disjoint Angle** — 角度工具
13. **Long Position** — 做多持仓可视化（入场/止损/止盈）
14. **Short Position** — 做空持仓可视化
15. **Forecast** — 预测区间
16. **Note** — 便签（固定位置注释）

### Phase 4: 键盘快捷键系统（高优先级）

**现状**: 仅引擎内置 Shift+方向键
**目标**: 完整快捷键体系

- `Alt+T` = 趋势线
- `Alt+F` = 斐波那契回撤
- `Alt+H` = 水平线
- `Alt+V` = 垂直线
- `Alt+C` = 十字光标
- `Ctrl+Z` = 撤销
- `Ctrl+Shift+Z` = 重做
- `Delete` = 删除选中
- `Escape` = 取消绘制
- `Alt+S` = 截图
- 支持自定义快捷键映射

### Phase 5: UI/UX 增强（高优先级）

1. **指标搜索** — 模态框内实时搜索过滤
2. **指标收藏** — 常用指标快速访问
3. **绘图工具收藏** — 最近使用 + 收藏
4. **右键菜单** — 上下文感知操作（删除/编辑/锁定/复制）
5. **数据窗口** — 光标处 OHLCV + 指标值面板
6. **图例改进** — 可交互图例（点击显隐, 悬停高亮）
7. **工具提示改进** — 更丰富的格式化显示
8. **撤销/重做** — 绘图操作历史

### Phase 6: 数据导出（中优先级）

1. **CSV 导出** — 可见区间的 OHLCV 数据
2. **截图增强** — 自定义水印、分辨率、格式(PNG/SVG)
3. **绘图导入/导出** — JSON 格式保存和恢复绘图

### Phase 7: 主题系统增强（中优先级）

1. **多内置主题** — Dark, Light, Midnight Blue, Forest, Classic TradingView
2. **主题编辑器** — 颜色选择器 UI
3. **自定义颜色方案** — 蜡烛颜色、背景、网格、文字独立配置
4. **主题导入/导出** — JSON 格式

### Phase 8: 高级功能（低优先级）

1. **对比模式** — 同图叠加多个标的
2. **布局保存/加载** — localStorage 持久化（指标、绘图、设置）
3. **告警线可视化** — 水平告警线 + 触发动画
4. **回放模式** — 逐根 K 线回放历史
5. **标尺工具** — 价格/时间/柱数测量
6. **Session Breaks** — 盘前盘后分隔线

## 技术决策

1. **新图表类型**: 通过 klinecharts registerIndicator 实现数据转换 + 自定义渲染
2. **新指标**: 通过 registerIndicator 注册，计算逻辑在 calc 回调中实现
3. **新绘图工具**: 通过 registerOverlay 注册，渲染逻辑在 createPointFigures 中实现
4. **快捷键**: 全局 keydown 监听 + 可配置映射表
5. **撤销/重做**: Command Pattern，维护操作栈
6. **主题**: 基于 klinecharts registerStyles + CSS 变量
7. **布局持久化**: localStorage + JSON 序列化

## 不在范围内

- Pine Script / 脚本语言
- 社区功能 / 分享
- 实时数据源（Datafeed 接口由消费者实现）
- 多图表布局管理（属于平台层，非图表库职责）
- 财务数据面板
- 新闻/事件日历
