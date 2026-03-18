# TradingChest TradingView 对标实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development to implement this plan.

**Goal:** 将 TradingChest 升级为对标 TradingView 图表能力的专业交易图表库

**Architecture:** 基于 KLineChart 9.x 引擎，通过 registerIndicator/registerOverlay 扩展指标和绘图工具，Solid.js UI 层提供交互控件。分 6 个阶段递进实施。

**Tech Stack:** KLineChart 9.x, Solid.js, TypeScript, Vite

---

## Phase 1: 技术指标扩展（28 → 80+）

KLineChart 引擎内置 30 个指标，TradingChest UI 暴露 28 个。需要：
1. 通过 `registerIndicator` 注册 50+ 新自定义指标
2. 更新 IndicatorModal UI 支持分类、搜索、收藏
3. 更新 i18n

### Task 1.1: 创建指标计算工具库

**Files:**
- Create: `src/indicator/utils.ts`

- [ ] **Step 1: 创建通用计算函数**

```typescript
// src/indicator/utils.ts
// 指标计算通用工具函数

/**
 * 简单移动平均
 */
export function calcSMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = []
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(null); continue }
    let sum = 0
    for (let j = 0; j < period; j++) sum += data[i - j]
    result.push(sum / period)
  }
  return result
}

/**
 * 指数移动平均
 */
export function calcEMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = []
  const k = 2 / (period + 1)
  for (let i = 0; i < data.length; i++) {
    if (i === 0) { result.push(data[0]); continue }
    const prev = result[i - 1] ?? data[i]
    result.push(data[i] * k + prev * (1 - k))
  }
  return result
}

/**
 * 真实波幅 (True Range)
 */
export function calcTR(high: number[], low: number[], close: number[]): number[] {
  const result: number[] = []
  for (let i = 0; i < high.length; i++) {
    if (i === 0) { result.push(high[0] - low[0]); continue }
    const hl = high[i] - low[i]
    const hc = Math.abs(high[i] - close[i - 1])
    const lc = Math.abs(low[i] - close[i - 1])
    result.push(Math.max(hl, hc, lc))
  }
  return result
}

/**
 * 标准差
 */
export function calcStdDev(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = []
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(null); continue }
    let sum = 0
    for (let j = 0; j < period; j++) sum += data[i - j]
    const mean = sum / period
    let variance = 0
    for (let j = 0; j < period; j++) variance += (data[i - j] - mean) ** 2
    result.push(Math.sqrt(variance / period))
  }
  return result
}

/**
 * 最高值
 */
export function calcHighest(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = []
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(null); continue }
    let max = -Infinity
    for (let j = 0; j < period; j++) max = Math.max(max, data[i - j])
    result.push(max)
  }
  return result
}

/**
 * 最低值
 */
export function calcLowest(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = []
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(null); continue }
    let min = Infinity
    for (let j = 0; j < period; j++) min = Math.min(min, data[i - j])
    result.push(min)
  }
  return result
}

/**
 * 加权移动平均
 */
export function calcWMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = []
  const divisor = period * (period + 1) / 2
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(null); continue }
    let sum = 0
    for (let j = 0; j < period; j++) sum += data[i - j] * (period - j)
    result.push(sum / divisor)
  }
  return result
}
```

### Task 1.2: 注册趋势类指标（15 个）

**Files:**
- Create: `src/indicator/trend/index.ts`
- Create: `src/indicator/trend/atr.ts`
- Create: `src/indicator/trend/superTrend.ts`
- Create: `src/indicator/trend/ichimoku.ts`
- Create: `src/indicator/trend/alligator.ts`
- Create: `src/indicator/trend/dema.ts`
- Create: `src/indicator/trend/tema.ts`
- Create: `src/indicator/trend/wma.ts`
- Create: `src/indicator/trend/hma.ts`
- Create: `src/indicator/trend/kama.ts`
- Create: `src/indicator/trend/vwma.ts`
- Create: `src/indicator/trend/zlema.ts`
- Create: `src/indicator/trend/mcginley.ts`
- Create: `src/indicator/trend/linearRegression.ts`
- Create: `src/indicator/trend/envelopes.ts`
- Create: `src/indicator/trend/t3.ts`

每个指标文件遵循 klinecharts IndicatorTemplate 模式：

```typescript
// 示例: src/indicator/trend/atr.ts
import { IndicatorTemplate, KLineData } from 'klinecharts'
import { calcTR, calcSMA } from '../utils'

const atr: IndicatorTemplate = {
  name: 'ATR',
  shortName: 'ATR',
  calcParams: [14],
  figures: [
    { key: 'atr', title: 'ATR: ', type: 'line' }
  ],
  calc: (dataList: KLineData[], indicator) => {
    const params = indicator.calcParams
    const period = params[0] as number
    const highs = dataList.map(d => d.high)
    const lows = dataList.map(d => d.low)
    const closes = dataList.map(d => d.close)
    const tr = calcTR(highs, lows, closes)
    const atrValues = calcSMA(tr, period)
    return dataList.map((_, i) => ({ atr: atrValues[i] }))
  }
}
export default atr
```

- [ ] **Step 1: 创建所有 16 个趋势指标文件**
- [ ] **Step 2: 创建 trend/index.ts 导出数组**
- [ ] **Step 3: 在 src/index.ts 中注册所有趋势指标**

### Task 1.3: 注册波动率类指标（8 个）

**Files:**
- Create: `src/indicator/volatility/index.ts`
- Create: `src/indicator/volatility/keltnerChannels.ts`
- Create: `src/indicator/volatility/donchianChannels.ts`
- Create: `src/indicator/volatility/historicalVolatility.ts`
- Create: `src/indicator/volatility/standardDeviation.ts`
- Create: `src/indicator/volatility/chaikinVolatility.ts`
- Create: `src/indicator/volatility/massIndex.ts`
- Create: `src/indicator/volatility/ulcerIndex.ts`
- Create: `src/indicator/volatility/bollingerBandWidth.ts`

- [ ] **Step 1: 创建所有 8 个波动率指标**
- [ ] **Step 2: 创建 index.ts 导出并注册**

### Task 1.4: 注册成交量类指标（8 个）

**Files:**
- Create: `src/indicator/volume/index.ts`
- Create: `src/indicator/volume/vwap.ts`
- Create: `src/indicator/volume/mfi.ts`
- Create: `src/indicator/volume/chaikinMoneyFlow.ts`
- Create: `src/indicator/volume/adLine.ts`
- Create: `src/indicator/volume/vroc.ts`
- Create: `src/indicator/volume/klingerOscillator.ts`
- Create: `src/indicator/volume/forceIndex.ts`
- Create: `src/indicator/volume/elderRay.ts`

- [ ] **Step 1: 创建所有 8 个成交量指标**
- [ ] **Step 2: 导出并注册**

### Task 1.5: 注册动量类指标（10 个）

**Files:**
- Create: `src/indicator/momentum/index.ts`
- Create: `src/indicator/momentum/stochasticRsi.ts`
- Create: `src/indicator/momentum/adx.ts`
- Create: `src/indicator/momentum/aroon.ts`
- Create: `src/indicator/momentum/ultimateOscillator.ts`
- Create: `src/indicator/momentum/fisherTransform.ts`
- Create: `src/indicator/momentum/coppockCurve.ts`
- Create: `src/indicator/momentum/ppo.ts`
- Create: `src/indicator/momentum/dpo.ts`
- Create: `src/indicator/momentum/kst.ts`
- Create: `src/indicator/momentum/twiggsMf.ts`

- [ ] **Step 1: 创建所有 10 个动量指标**
- [ ] **Step 2: 导出并注册**

### Task 1.6: 注册其他类指标（5 个）

**Files:**
- Create: `src/indicator/other/index.ts`
- Create: `src/indicator/other/pivotPoints.ts`
- Create: `src/indicator/other/zigzag.ts`
- Create: `src/indicator/other/volumeProfile.ts`
- Create: `src/indicator/other/elderRayBull.ts`
- Create: `src/indicator/other/elderRayBear.ts`

- [ ] **Step 1: 创建所有 5 个指标**
- [ ] **Step 2: 导出并注册**

### Task 1.7: 指标注册入口

**Files:**
- Create: `src/indicator/index.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: 创建 indicator/index.ts 汇总所有指标**

```typescript
import trendIndicators from './trend'
import volatilityIndicators from './volatility'
import volumeIndicators from './volume'
import momentumIndicators from './momentum'
import otherIndicators from './other'

const indicators = [
  ...trendIndicators,
  ...volatilityIndicators,
  ...volumeIndicators,
  ...momentumIndicators,
  ...otherIndicators
]

export default indicators

// 指标分类映射（用于 UI）
export const indicatorCategories = {
  trend: ['ATR', 'SuperTrend', 'Ichimoku', 'Alligator', 'DEMA', 'TEMA', 'WMA', 'HMA', 'KAMA', 'VWMA', 'ZLEMA', 'McGinley', 'LinReg', 'Envelopes', 'T3'],
  volatility: ['KeltnerChannels', 'DonchianChannels', 'HV', 'StdDev', 'ChaikinVol', 'MassIndex', 'UlcerIndex', 'BBW'],
  volume: ['VWAP', 'MFI', 'CMF', 'ADLine', 'VROC', 'Klinger', 'ForceIndex', 'ElderRay'],
  momentum: ['StochRSI', 'ADX', 'Aroon', 'UltOsc', 'Fisher', 'Coppock', 'PPO', 'DPO', 'KST', 'TwiggsMF'],
  other: ['PivotPoints', 'ZigZag', 'VolumeProfile', 'ElderRayBull', 'ElderRayBear']
}
```

- [ ] **Step 2: 在 src/index.ts 注册所有自定义指标**

```typescript
// 在 overlays 注册后添加:
import customIndicators from './indicator'
import { registerIndicator } from 'klinecharts'
customIndicators.forEach(indicator => { registerIndicator(indicator) })
```

### Task 1.8: 更新 IndicatorModal 支持分类和搜索

**Files:**
- Modify: `src/widget/indicator-modal/index.tsx`

- [ ] **Step 1: 重写 IndicatorModal**

新增功能：
- 指标分类 Tab（趋势/波动率/成交量/动量/其他）
- 实时搜索过滤
- 所有新指标的 checkbox 选择

### Task 1.9: 更新 i18n

**Files:**
- Modify: `src/i18n/zh-CN.json`
- Modify: `src/i18n/en-US.json`

- [ ] **Step 1: 添加所有新指标的中英文翻译**

### Task 1.10: 构建并验证

- [ ] **Step 1: npm run build 确保编译通过**
- [ ] **Step 2: 提交**

---

## Phase 2: 绘图工具扩展（29 → 45+）

### Task 2.1: 测量工具

**Files:**
- Create: `src/extension/priceRange.ts` — 价格区间（显示价差/百分比/柱数）
- Create: `src/extension/dateRange.ts` — 时间区间测量
- Create: `src/extension/dateAndPriceRange.ts` — 综合测量

### Task 2.2: 形态工具

**Files:**
- Create: `src/extension/pitchfork.ts` — Andrew's Pitchfork
- Create: `src/extension/schiffPitchfork.ts` — Schiff 变体
- Create: `src/extension/regressionTrend.ts` — 线性回归趋势
- Create: `src/extension/regressionChannel.ts` — 回归通道

### Task 2.3: 标注工具

**Files:**
- Create: `src/extension/textAnnotation.ts` — 文字标注
- Create: `src/extension/callout.ts` — 标注气泡
- Create: `src/extension/note.ts` — 便签
- Create: `src/extension/brush.ts` — 自由画笔

### Task 2.4: 交易工具

**Files:**
- Create: `src/extension/longPosition.ts` — 做多持仓（入场/止损/止盈三区域）
- Create: `src/extension/shortPosition.ts` — 做空持仓

### Task 2.5: 更新绘图工具栏

**Files:**
- Modify: `src/widget/drawing-bar/index.tsx`
- Create: `src/widget/drawing-bar/icons/pitchfork.ts`
- Create: `src/widget/drawing-bar/icons/priceRange.ts`
- Create: `src/widget/drawing-bar/icons/textAnnotation.ts`
- Create: `src/widget/drawing-bar/icons/longPosition.ts`
- Create: `src/widget/drawing-bar/icons/shortPosition.ts`
- Create: `src/widget/drawing-bar/icons/brush.ts`
- Modify: `src/widget/drawing-bar/icons/index.ts`

新增工具分组:
- 测量工具组（priceRange, dateRange, dateAndPriceRange）
- 形态工具组（pitchfork, schiffPitchfork, regressionTrend, regressionChannel）
- 标注工具组（textAnnotation, callout, note, brush）
- 交易工具组（longPosition, shortPosition）

### Task 2.6: i18n + 构建

- [ ] **Step 1: 更新两个语言文件**
- [ ] **Step 2: 注册所有新 overlay 到 extension/index.ts**
- [ ] **Step 3: 构建验证**
- [ ] **Step 4: 提交**

---

## Phase 3: 图表类型扩展

### Task 3.1: Heikin Ashi 图表

**Files:**
- Create: `src/chartType/heikinAshi.ts`

通过 registerIndicator 实现：对原始 OHLCV 数据做 HA 变换，渲染为蜡烛图。

### Task 3.2: Baseline 图表

**Files:**
- Create: `src/chartType/baseline.ts`

基于收盘价和基准线的双色区域图。

### Task 3.3: 更新设置面板

**Files:**
- Modify: `src/widget/setting-modal/data.ts`

在 candle.type 选项中增加 heikin_ashi, baseline 等选项。

### Task 3.4: i18n + 构建 + 提交

---

## Phase 4: 键盘快捷键系统

### Task 4.1: 快捷键管理器

**Files:**
- Create: `src/shortcut/index.ts` — KeyboardShortcutManager 类
- Create: `src/shortcut/defaultBindings.ts` — 默认快捷键映射

### Task 4.2: 集成到 ChartProComponent

**Files:**
- Modify: `src/ChartProComponent.tsx`

在 onMount 中初始化快捷键监听，onCleanup 中清理。

### Task 4.3: 撤销/重做系统

**Files:**
- Create: `src/shortcut/undoRedo.ts` — Command Pattern 实现

### Task 4.4: 构建 + 提交

---

## Phase 5: UI/UX 增强

### Task 5.1: 右键上下文菜单

**Files:**
- Create: `src/widget/context-menu/index.tsx`

### Task 5.2: 数据窗口面板

**Files:**
- Create: `src/widget/data-window/index.tsx`

光标位置的 OHLCV + 所有活跃指标值。

### Task 5.3: 改进 PeriodBar

**Files:**
- Modify: `src/widget/period-bar/index.tsx`

添加：数据窗口按钮、对比按钮、导出按钮。

### Task 5.4: 数据导出

**Files:**
- Create: `src/widget/export-modal/index.tsx`

CSV 导出可见区间数据。

### Task 5.5: 主题系统增强

**Files:**
- Create: `src/theme/index.ts` — 预设主题（dark, light, midnight, classic）
- Modify: `src/widget/setting-modal/data.ts` — 主题选择

### Task 5.6: 绘图持久化（保存/恢复）

**Files:**
- Create: `src/persistence/index.ts`

将绘图、指标配置序列化为 JSON，支持 localStorage 保存/恢复。

### Task 5.7: 构建 + 提交

---

## Phase 6: 高级功能

### Task 6.1: 对比模式

多标的叠加在同一图表上。

### Task 6.2: 告警线

水平告警价格线。

### Task 6.3: 更新公共 API

扩展 ChartPro 接口：
- `addComparison(symbol)` / `removeComparison(symbol)`
- `addAlert(price, options)` / `removeAlert(id)`
- `exportData(format)` / `exportImage(options)`
- `getShortcutManager()`
- `saveLayout()` / `loadLayout(data)`

### Task 6.4: 最终构建 + 全面测试 + 提交
