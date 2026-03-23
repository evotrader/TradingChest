# 指标懒加载 + 增量计算 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 43 个自定义指标从全量启动注册改为按需懒加载，并为实时更新添加增量计算缓存，减少初始化开销和运行时 CPU 占用

**Architecture:** 创建 `IndicatorRegistry` 中间层管理指标注册状态，用动态 `import()` 按需加载指标模块。为 `calc` 函数添加 `IncrementalCalcWrapper` 缓存上一次结果，当仅追加新 K 线时只重算最后 N 个值。

**Tech Stack:** KLineChart 9.x (`registerIndicator`), TypeScript dynamic imports, Vitest

---

## 文件结构

```
新建文件:
  src/indicator/registry.ts                    # IndicatorRegistry — 懒加载注册管理
  src/indicator/loaders.ts                     # 每个指标的动态 import 映射
  src/indicator/__tests__/registry.test.ts     # Registry 单元测试
  src/indicator/incrementalCalc.ts             # 增量计算包装器
  src/indicator/__tests__/incrementalCalc.test.ts

修改文件:
  src/index.ts                                 # 移除全量 registerIndicator 循环
  src/indicator/index.ts                       # 保留 indicatorCategories，移除 customIndicators 默认导出
  src/ChartProComponent.tsx                    # createIndicator 改为 async，先 ensureRegistered
  src/widget/indicator-modal/index.tsx         # 修复 @ts-expect-error
```

---

## Task 1: IndicatorRegistry — 懒加载核心

**Files:**
- Create: `src/indicator/__tests__/registry.test.ts`
- Create: `src/indicator/registry.ts`

- [ ] **Step 1: 编写测试**

```typescript
// src/indicator/__tests__/registry.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IndicatorRegistry } from '../registry'

describe('IndicatorRegistry', () => {
  let registry: IndicatorRegistry

  beforeEach(() => {
    registry = new IndicatorRegistry()
  })

  it('isRegistered 初始为 false', () => {
    expect(registry.isRegistered('ATR')).toBe(false)
  })

  it('markRegistered 后 isRegistered 为 true', () => {
    registry.markRegistered('ATR')
    expect(registry.isRegistered('ATR')).toBe(true)
  })

  it('ensureRegistered 只调用 loader 一次', async () => {
    const loader = vi.fn().mockResolvedValue({ name: 'ATR', calc: () => [] })
    const registerFn = vi.fn()
    registry.setLoader('ATR', loader)
    registry.setRegisterFn(registerFn)

    await registry.ensureRegistered('ATR')
    await registry.ensureRegistered('ATR') // 第二次不应调用 loader

    expect(loader).toHaveBeenCalledTimes(1)
    expect(registerFn).toHaveBeenCalledTimes(1)
    expect(registry.isRegistered('ATR')).toBe(true)
  })

  it('ensureRegistered 并发调用只加载一次', async () => {
    const loader = vi.fn().mockResolvedValue({ name: 'RSI', calc: () => [] })
    const registerFn = vi.fn()
    registry.setLoader('RSI', loader)
    registry.setRegisterFn(registerFn)

    await Promise.all([
      registry.ensureRegistered('RSI'),
      registry.ensureRegistered('RSI'),
      registry.ensureRegistered('RSI'),
    ])

    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('无 loader 的指标视为内置，直接标记', async () => {
    const registerFn = vi.fn()
    registry.setRegisterFn(registerFn)

    // 没有设置 loader 的指标（如 klinecharts 内置的 MA）
    await registry.ensureRegistered('MA')

    expect(registry.isRegistered('MA')).toBe(true)
    expect(registerFn).not.toHaveBeenCalled() // 内置不需要注册
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/indicator/__tests__/registry.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 实现 IndicatorRegistry**

```typescript
// src/indicator/registry.ts
import { IndicatorTemplate } from 'klinecharts'

type IndicatorLoader = () => Promise<IndicatorTemplate>
type RegisterFn = (template: IndicatorTemplate) => void

/**
 * 指标懒加载注册表
 * 管理指标的按需加载和注册状态，确保每个指标只加载/注册一次
 */
export class IndicatorRegistry {
  private _registered = new Set<string>()
  private _loaders = new Map<string, IndicatorLoader>()
  private _pending = new Map<string, Promise<void>>()
  private _registerFn: RegisterFn = () => {}

  setRegisterFn(fn: RegisterFn): void {
    this._registerFn = fn
  }

  setLoader(name: string, loader: IndicatorLoader): void {
    this._loaders.set(name, loader)
  }

  setLoaders(loaders: Record<string, IndicatorLoader>): void {
    for (const [name, loader] of Object.entries(loaders)) {
      this._loaders.set(name, loader)
    }
  }

  isRegistered(name: string): boolean {
    return this._registered.has(name)
  }

  markRegistered(name: string): void {
    this._registered.add(name)
  }

  /**
   * 确保指标已注册：如果未注册则懒加载并注册
   * 并发安全 — 多次调用同一指标只加载一次
   */
  async ensureRegistered(name: string): Promise<void> {
    if (this._registered.has(name)) return

    // 并发去重
    if (this._pending.has(name)) {
      return this._pending.get(name)!
    }

    const loader = this._loaders.get(name)
    if (!loader) {
      // 无 loader = 内置指标（klinecharts 自带），直接标记
      this._registered.add(name)
      return
    }

    const promise = (async () => {
      const template = await loader()
      this._registerFn(template)
      this._registered.add(name)
      this._pending.delete(name)
    })()

    this._pending.set(name, promise)
    return promise
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/indicator/__tests__/registry.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/indicator/registry.ts src/indicator/__tests__/registry.test.ts
git commit -m "feat: add IndicatorRegistry for lazy-loading indicator management"
```

---

## Task 2: 指标动态加载映射

**Files:**
- Create: `src/indicator/loaders.ts`

- [ ] **Step 1: 创建 loaders 文件**

每个自定义指标对应一个动态 `import()` 函数。klinecharts 内置指标（MA, EMA, SMA, BOLL, SAR, BBI, VOL, MACD, KDJ, RSI, BIAS, BRAR, CCI, DMI, CR, PSY, DMA, TRIX, OBV, VR, WR, MTM, EMV, ROC, PVT, AO）不需要 loader。

```typescript
// src/indicator/loaders.ts
import { IndicatorTemplate } from 'klinecharts'

type IndicatorLoader = () => Promise<IndicatorTemplate>

/**
 * 自定义指标的动态加载映射
 * key = IndicatorTemplate.name，value = 动态 import 函数
 * 内置指标（klinecharts 自带）不在此映射中
 */
export const indicatorLoaders: Record<string, IndicatorLoader> = {
  // === Trend ===
  ATR:              () => import('./trend/atr').then(m => m.default),
  SUPERTREND:       () => import('./trend/superTrend').then(m => m.default),
  ICHIMOKU:         () => import('./trend/ichimoku').then(m => m.default),
  ALLIGATOR:        () => import('./trend/alligator').then(m => m.default),
  DEMA:             () => import('./trend/dema').then(m => m.default),
  TEMA:             () => import('./trend/tema').then(m => m.default),
  WMA:              () => import('./trend/wma').then(m => m.default),
  HMA:              () => import('./trend/hma').then(m => m.default),
  KAMA:             () => import('./trend/kama').then(m => m.default),
  VWMA:             () => import('./trend/vwma').then(m => m.default),
  ZLEMA:            () => import('./trend/zlema').then(m => m.default),
  MCGINLEY:         () => import('./trend/mcginley').then(m => m.default),
  LINEARREGRESSION: () => import('./trend/linearRegression').then(m => m.default),
  ENVELOPES:        () => import('./trend/envelopes').then(m => m.default),
  T3:               () => import('./trend/t3').then(m => m.default),

  // === Volatility ===
  KC:    () => import('./volatility/keltnerChannels').then(m => m.default),
  DC:    () => import('./volatility/donchianChannels').then(m => m.default),
  HV:    () => import('./volatility/historicalVolatility').then(m => m.default),
  STDDEV:() => import('./volatility/standardDeviation').then(m => m.default),
  CV:    () => import('./volatility/chaikinVolatility').then(m => m.default),
  MI:    () => import('./volatility/massIndex').then(m => m.default),
  UI:    () => import('./volatility/ulcerIndex').then(m => m.default),
  BBW:   () => import('./volatility/bollingerBandWidth').then(m => m.default),

  // === Volume ===
  VWAP:      () => import('./volume/vwap').then(m => m.default),
  MFI:       () => import('./volume/mfi').then(m => m.default),
  CMF:       () => import('./volume/chaikinMoneyFlow').then(m => m.default),
  AD:        () => import('./volume/adLine').then(m => m.default),
  VROC:      () => import('./volume/vroc').then(m => m.default),
  KVO:       () => import('./volume/klingerOscillator').then(m => m.default),
  FI:        () => import('./volume/forceIndex').then(m => m.default),
  ELDER_RAY: () => import('./volume/elderRay').then(m => m.default),

  // === Momentum ===
  StochRSI: () => import('./momentum/stochasticRsi').then(m => m.default),
  ADX:      () => import('./momentum/adx').then(m => m.default),
  AROON:    () => import('./momentum/aroon').then(m => m.default),
  UO:       () => import('./momentum/ultimateOscillator').then(m => m.default),
  FISHER:   () => import('./momentum/fisherTransform').then(m => m.default),
  COPPOCK:  () => import('./momentum/coppockCurve').then(m => m.default),
  PPO:      () => import('./momentum/ppo').then(m => m.default),
  DPO:      () => import('./momentum/dpo').then(m => m.default),
  KST:      () => import('./momentum/kst').then(m => m.default),
  TMF:      () => import('./momentum/twiggsMf').then(m => m.default),

  // === Other ===
  PIVOTPOINTS: () => import('./other/pivotPoints').then(m => m.default),
  ZIGZAG:      () => import('./other/zigzag').then(m => m.default),
}
```

- [ ] **Step 2: 运行构建确认 import 路径正确**

Run: `npm run build-core`
Expected: 构建成功（Vite 会为每个动态 import 创建 chunk）

- [ ] **Step 3: Commit**

```bash
git add src/indicator/loaders.ts
git commit -m "feat: add dynamic import loaders for all 43 custom indicators"
```

---

## Task 3: 增量计算包装器

**Files:**
- Create: `src/indicator/__tests__/incrementalCalc.test.ts`
- Create: `src/indicator/incrementalCalc.ts`

- [ ] **Step 1: 编写测试**

```typescript
// src/indicator/__tests__/incrementalCalc.test.ts
import { describe, it, expect, vi } from 'vitest'
import { wrapWithIncrementalCalc } from '../incrementalCalc'

describe('wrapWithIncrementalCalc', () => {
  it('首次调用执行完整计算', () => {
    const fullCalc = vi.fn((dataList: any[]) =>
      dataList.map((d: any) => ({ val: d.close * 2 }))
    )
    const wrapped = wrapWithIncrementalCalc(fullCalc, 5)

    const data = [
      { timestamp: 1, close: 10 },
      { timestamp: 2, close: 20 },
      { timestamp: 3, close: 30 },
    ]
    const result = wrapped(data as any, {} as any)

    expect(fullCalc).toHaveBeenCalledTimes(1)
    expect(result).toHaveLength(3)
    expect(result[0].val).toBe(20)
    expect(result[2].val).toBe(60)
  })

  it('仅追加一根 K 线时只重算最后 N 个', () => {
    const fullCalc = vi.fn((dataList: any[]) =>
      dataList.map((d: any) => ({ val: d.close * 2 }))
    )
    const wrapped = wrapWithIncrementalCalc(fullCalc, 3)

    // 第一次完整计算
    const data1 = [
      { timestamp: 1, close: 10 },
      { timestamp: 2, close: 20 },
      { timestamp: 3, close: 30 },
    ]
    wrapped(data1 as any, {} as any)
    expect(fullCalc).toHaveBeenCalledTimes(1)

    // 追加一根 K 线 — 应该只重算最后 3 个
    const data2 = [
      { timestamp: 1, close: 10 },
      { timestamp: 2, close: 20 },
      { timestamp: 3, close: 30 },
      { timestamp: 4, close: 40 },
    ]
    const result2 = wrapped(data2 as any, {} as any)

    // fullCalc 被调用了第二次，但只传入最后 3 个元素
    expect(fullCalc).toHaveBeenCalledTimes(2)
    expect(result2).toHaveLength(4)
    expect(result2[3].val).toBe(80)
  })

  it('数据长度变短时重新完整计算', () => {
    const fullCalc = vi.fn((dataList: any[]) =>
      dataList.map((d: any) => ({ val: d.close }))
    )
    const wrapped = wrapWithIncrementalCalc(fullCalc, 3)

    wrapped([{ timestamp: 1, close: 10 }, { timestamp: 2, close: 20 }] as any, {} as any)
    // 数据变短（切换品种）
    wrapped([{ timestamp: 5, close: 50 }] as any, {} as any)

    expect(fullCalc).toHaveBeenCalledTimes(2)
  })

  it('最后一根 K 线更新（同 timestamp）时重算最后 N 个', () => {
    const fullCalc = vi.fn((dataList: any[]) =>
      dataList.map((d: any) => ({ val: d.close }))
    )
    const wrapped = wrapWithIncrementalCalc(fullCalc, 3)

    const data1 = [
      { timestamp: 1, close: 10 },
      { timestamp: 2, close: 20 },
    ]
    wrapped(data1 as any, {} as any)

    // 最后一根 K 线 close 更新
    const data2 = [
      { timestamp: 1, close: 10 },
      { timestamp: 2, close: 25 },
    ]
    const result = wrapped(data2 as any, {} as any)
    expect(result[1].val).toBe(25)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/indicator/__tests__/incrementalCalc.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现增量计算包装器**

```typescript
// src/indicator/incrementalCalc.ts
import { KLineData, Indicator } from 'klinecharts'

type CalcFn = (dataList: KLineData[], indicator: Indicator) => any[]

/**
 * 包装指标 calc 函数，支持增量计算
 * 当仅追加/更新最后一根 K 线时，只重算最后 lookback 个值
 * @param fullCalc 原始完整计算函数
 * @param lookback 增量计算时重算的尾部元素数（应 >= 指标的最大 period）
 */
export function wrapWithIncrementalCalc(
  fullCalc: CalcFn,
  lookback: number
): CalcFn {
  let prevLength = 0
  let prevLastTimestamp = 0
  let cachedResult: any[] = []

  return (dataList: KLineData[], indicator: Indicator): any[] => {
    const len = dataList.length
    if (len === 0) {
      prevLength = 0
      prevLastTimestamp = 0
      cachedResult = []
      return []
    }

    const lastTs = dataList[len - 1].timestamp
    const isAppendOrUpdate = len >= prevLength &&
      len - prevLength <= 1 &&
      (prevLength === 0 || dataList[prevLength - 2]?.timestamp === cachedResult[prevLength - 2]?.__ts)

    if (prevLength === 0 || !isAppendOrUpdate || len < lookback) {
      // 完整重算
      cachedResult = fullCalc(dataList, indicator)
      // 存储 timestamp 用于后续比对
      cachedResult.forEach((r, i) => {
        if (r && typeof r === 'object') r.__ts = dataList[i]?.timestamp
      })
      prevLength = len
      prevLastTimestamp = lastTs
      return cachedResult.map(r => {
        if (r && '__ts' in r) {
          const { __ts, ...rest } = r
          return rest
        }
        return r
      })
    }

    // 增量计算：只重算最后 lookback 个
    const startIdx = Math.max(0, len - lookback)
    const tailData = dataList.slice(startIdx)
    const tailResult = fullCalc(tailData, indicator)

    // 合并结果
    const newResult = cachedResult.slice(0, startIdx)
    for (let i = 0; i < tailResult.length; i++) {
      const r = tailResult[i]
      if (r && typeof r === 'object') r.__ts = dataList[startIdx + i]?.timestamp
      newResult.push(r)
    }
    cachedResult = newResult
    prevLength = len
    prevLastTimestamp = lastTs

    return newResult.map(r => {
      if (r && '__ts' in r) {
        const { __ts, ...rest } = r
        return rest
      }
      return r
    })
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/indicator/__tests__/incrementalCalc.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/indicator/incrementalCalc.ts src/indicator/__tests__/incrementalCalc.test.ts
git commit -m "feat: add incremental calculation wrapper for indicator performance"
```

---

## Task 4: 重构 index.ts — 移除全量注册

**Files:**
- Modify: `src/index.ts:32-35`
- Modify: `src/indicator/index.ts`

- [ ] **Step 1: 修改 `src/indicator/index.ts`**

移除 `customIndicators` 默认导出，改为导出 registry 和 loaders：

```typescript
// src/indicator/index.ts
/**
 * 指标模块入口
 * 导出分类元数据和懒加载注册表
 */
import { registerIndicator } from 'klinecharts'
import { IndicatorRegistry } from './registry'
import { indicatorLoaders } from './loaders'

// 创建全局单例注册表
export const indicatorRegistry = new IndicatorRegistry()
indicatorRegistry.setRegisterFn(registerIndicator)
indicatorRegistry.setLoaders(indicatorLoaders)

// 指标分类映射（保持不变 — 只是名称元数据，无实际代码）
export const indicatorCategories: Record<string, { names: string[], label_zh: string, label_en: string }> = {
  trend: {
    names: ['MA', 'EMA', 'SMA', 'BOLL', 'SAR', 'BBI', 'ATR', 'SUPERTREND', 'ICHIMOKU', 'ALLIGATOR', 'DEMA', 'TEMA', 'WMA', 'HMA', 'KAMA', 'VWMA', 'ZLEMA', 'MCGINLEY', 'LINEARREGRESSION', 'ENVELOPES', 'T3'],
    label_zh: '趋势',
    label_en: 'Trend'
  },
  volatility: {
    names: ['BOLL', 'KC', 'DC', 'HV', 'STDDEV', 'CV', 'MI', 'UI', 'BBW'],
    label_zh: '波动率',
    label_en: 'Volatility'
  },
  volume: {
    names: ['VOL', 'OBV', 'PVT', 'VR', 'VWAP', 'MFI', 'CMF', 'AD', 'VROC', 'KVO', 'FI', 'ELDER_RAY'],
    label_zh: '成交量',
    label_en: 'Volume'
  },
  momentum: {
    names: ['MACD', 'KDJ', 'RSI', 'BIAS', 'BRAR', 'CCI', 'DMI', 'CR', 'PSY', 'DMA', 'TRIX', 'WR', 'MTM', 'EMV', 'ROC', 'AO', 'StochRSI', 'ADX', 'AROON', 'UO', 'FISHER', 'COPPOCK', 'PPO', 'DPO', 'KST', 'TMF'],
    label_zh: '动量',
    label_en: 'Momentum'
  },
  other: {
    names: ['PIVOTPOINTS', 'ZIGZAG'],
    label_zh: '其他',
    label_en: 'Other'
  }
}
```

- [ ] **Step 2: 修改 `src/index.ts`**

移除全量指标注册，保留 overlay 和 chartType 注册（它们数量少且启动必需）：

替换 lines 17-18 和 32-35:

删除:
```typescript
import customIndicators from './indicator'
customIndicators.forEach(i => { registerIndicator(i) })
```

保留:
```typescript
overlays.forEach(o => { registerOverlay(o) })
chartTypes.forEach(ct => { registerIndicator(ct) })
registerIndicator(tradeVisualization)
```

添加导出:
```typescript
export { indicatorRegistry } from './indicator'
```

- [ ] **Step 3: 运行构建**

Run: `npm run build-core`
Expected: 构建成功

- [ ] **Step 4: Commit**

```bash
git add src/index.ts src/indicator/index.ts
git commit -m "refactor: remove eager indicator registration, export lazy registry"
```

---

## Task 5: ChartProComponent — async createIndicator

**Files:**
- Modify: `src/ChartProComponent.tsx`

- [ ] **Step 1: 修改 createIndicator 函数为 async**

在 `ChartProComponent.tsx` 中:

1. 添加 import:
```typescript
import { indicatorRegistry } from './indicator'
```

2. 将 `createIndicator` 改为 async（当前在 line ~47）:

```typescript
async function createIndicator(
  widget: Nullable<Chart>,
  indicatorName: string,
  isStack?: boolean,
  paneOptions?: PaneOptions
): Promise<Nullable<string>> {
  // 确保指标已注册（懒加载）
  await indicatorRegistry.ensureRegistered(indicatorName)

  if (indicatorName === 'VOL') {
    paneOptions = { gap: { bottom: 2 }, ...paneOptions }
  }
  return widget?.createIndicator({
    name: indicatorName,
    createTooltipDataSource: ({ indicator, defaultStyles }: any) => {
      // ... 保持现有 tooltip 逻辑不变
    }
  } as any, isStack, paneOptions) ?? null
}
```

3. 更新所有调用 `createIndicator` 的地方加上 `await`：

在 `onMount` 中（初始化主图指标）:
```typescript
// 改为 async IIFE
;(async () => {
  for (const indicator of mainIndicators()) {
    await createIndicator(widget, indicator, true, { id: 'candle_pane' })
  }
  // ... sub indicators 同理
})()
```

在 `onMainIndicatorChange` 回调中:
```typescript
onMainIndicatorChange={async data => {
  // ... 保持逻辑不变，createIndicator 调用加 await
  if (data.added) {
    await createIndicator(widget, data.name, true, { id: 'candle_pane' })
    // ...
  }
}}
```

在 `onSubIndicatorChange` 回调中同理。

- [ ] **Step 2: 运行构建**

Run: `npm run build-core`
Expected: 构建成功

- [ ] **Step 3: 运行全部测试**

Run: `npx vitest run`
Expected: 全部 PASS

- [ ] **Step 4: Commit**

```bash
git add src/ChartProComponent.tsx
git commit -m "refactor: make createIndicator async for lazy-loading support"
```

---

## Task 6: 修复 indicator-modal @ts-expect-error

**Files:**
- Modify: `src/widget/indicator-modal/index.tsx:169-170`

- [ ] **Step 1: 修复类型**

在 `src/widget/indicator-modal/index.tsx` 中:

将 `IndicatorModalProps` 的 `subIndicators` 类型从 `object` 改为 `Record<string, string>`:
```typescript
export interface IndicatorModalProps {
  locale: string
  mainIndicators: string[]
  subIndicators: Record<string, string>   // 原来是 object
  onMainIndicatorChange: OnIndicatorChange
  onSubIndicatorChange: OnIndicatorChange
  onClose: () => void
}
```

然后删除 line 169 的 `// @ts-expect-error` 注释。

- [ ] **Step 2: 运行构建**

Run: `npm run build-core`
Expected: 构建成功

- [ ] **Step 3: Commit**

```bash
git add src/widget/indicator-modal/index.tsx
git commit -m "fix: type IndicatorModalProps.subIndicators as Record<string, string>"
```

---

## Task 7: 全量验证

- [ ] **Step 1: 运行完整测试**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 2: 运行完整构建**

Run: `npm run build`
Expected: 构建成功

- [ ] **Step 3: 验证 bundle 中指标代码被分割**

Run: `ls -la dist/`
Expected: 主 bundle 大小应比之前（344KB ES）减少，或出现额外 chunk 文件

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: verify lazy-loading indicator build and test suite"
```
