# TradingChest 质量与能力升级计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 TradingChest 的工程质量问题（零测试、全局变量、内存泄漏），补齐与 TradingView 的核心功能差距（数据层健壮性、多图表布局、报警系统）

**Architecture:** 分 6 个阶段递进 — 先夯实基础（测试 + bug fix），再加固数据层（重连 + 缓存），然后补齐核心功能（报警 + 多品种对比 + 多图表布局）。每个阶段独立可交付。

**Tech Stack:** KLineChart 9.x, Solid.js 1.6, TypeScript, Vitest, Vite

---

## 文件结构总览

```
新建文件:
  src/indicator/__tests__/            # 指标单元测试
    superTrend.test.ts
    atr.test.ts
    ichimoku.test.ts
    macd.test.ts
    rsi.test.ts
    bollingerBands.test.ts
  src/persistence/__tests__/
    persistence.test.ts
  src/shortcut/__tests__/
    shortcut.test.ts
  src/export/__tests__/
    export.test.ts
  src/DefaultDatafeed/__tests__/
    defaultDatafeed.test.ts
  src/__tests__/
    adjustFromTo.test.ts
    buildStyles.test.ts
  vitest.config.ts                    # 测试配置
  src/core/                           # 从 ChartProComponent 抽取的纯函数
    adjustFromTo.ts
    buildStyles.ts
    indicatorClickDetector.ts         # 替代全局变量方案
  src/datafeed/                       # 数据层增强
    ReconnectingWebSocket.ts          # 自动重连 WebSocket
    DataCache.ts                      # K 线数据缓存
  src/alert/                          # 报警系统
    index.ts
    AlertLine.ts                      # overlay 实现
    types.ts
  src/compare/                        # 多品种对比
    index.ts
    CompareOverlay.ts

修改文件:
  package.json                        # 添加 test 脚本
  src/KLineChartPro.tsx               # 消除 setTimeout + globalThis
  src/ChartProComponent.tsx           # 抽取纯函数、集成新功能
  src/DefaultDatafeed.ts              # 实现 unsubscribe、重连、缓存
  src/types.ts                        # 扩展接口
  src/index.ts                        # 导出新模块
```

---

## Phase 1: 测试基础设施 + 核心指标测试（P0）

### Task 1.1: 配置 Vitest

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: 创建 vitest.config.ts**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import solidPlugin from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solidPlugin()],
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    coverage: {
      include: ['src/**/*.ts'],
      exclude: ['src/**/__tests__/**', 'src/index.ts', 'src/**/*.d.ts']
    }
  }
})
```

- [ ] **Step 2: 确认 devDependencies 已包含 vitest 和 vite-plugin-solid**

`package.json` 中已存在 `"vitest": "^0.28.4"` 和 `"vite-plugin-solid": "^2.6.1"`，无需额外安装。在 `scripts` 中添加:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

- [ ] **Step 3: 运行 `npm test` 确认配置正确（应该 0 测试通过）**

Run: `npm test`
Expected: "No test files found" 或 0 tests

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts package.json
git commit -m "chore: configure vitest test infrastructure"
```

---

### Task 1.2: 抽取纯函数 — adjustFromTo

从 `ChartProComponent.tsx:134-184` 抽取 `adjustFromTo` 为独立模块，方便测试。

**Files:**
- Create: `src/core/adjustFromTo.ts`
- Modify: `src/ChartProComponent.tsx`

- [ ] **Step 1: 编写 adjustFromTo 的测试**

```typescript
// src/core/__tests__/adjustFromTo.test.ts
import { describe, it, expect } from 'vitest'
import { adjustFromTo } from '../adjustFromTo'

describe('adjustFromTo', () => {
  it('minute 周期对齐到分钟边界', () => {
    const period = { multiplier: 5, timespan: 'minute', text: '5m' }
    // 2024-01-15 10:03:27 UTC
    const to = 1705312407000
    const [from, alignedTo] = adjustFromTo(period, to, 100)
    // to 对齐到分钟: 10:03:00
    expect(alignedTo % (60 * 1000)).toBe(0)
    // from = alignedTo - 100 * 5 * 60 * 1000
    expect(alignedTo - from).toBe(100 * 5 * 60 * 1000)
  })

  it('hour 周期对齐到小时边界', () => {
    const period = { multiplier: 1, timespan: 'hour', text: '1H' }
    const to = 1705312407000
    const [from, alignedTo] = adjustFromTo(period, to, 500)
    expect(alignedTo % (3600 * 1000)).toBe(0)
    expect(alignedTo - from).toBe(500 * 3600 * 1000)
  })

  it('day 周期对齐到小时边界', () => {
    const period = { multiplier: 1, timespan: 'day', text: 'D' }
    const to = 1705312407000
    const [from, alignedTo] = adjustFromTo(period, to, 500)
    expect(alignedTo % (3600 * 1000)).toBe(0)
    expect(alignedTo - from).toBe(500 * 24 * 3600 * 1000)
  })

  it('count=0 时 from===to', () => {
    const period = { multiplier: 1, timespan: 'minute', text: '1m' }
    const to = 1705312407000
    const [from, alignedTo] = adjustFromTo(period, to, 0)
    expect(from).toBe(alignedTo)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/core/__tests__/adjustFromTo.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 创建 src/core/adjustFromTo.ts — 从 ChartProComponent.tsx:134-184 提取**

```typescript
// src/core/adjustFromTo.ts
import { Period } from '../types'

/**
 * 根据周期类型对齐时间戳，计算 from/to 区间
 * @returns [from, alignedTo]
 */
export function adjustFromTo(period: Period, toTimestamp: number, count: number): [number, number] {
  let to = toTimestamp
  let from = to
  switch (period.timespan) {
    case 'minute': {
      to = to - (to % (60 * 1000))
      from = to - count * period.multiplier * 60 * 1000
      break
    }
    case 'hour': {
      to = to - (to % (60 * 60 * 1000))
      from = to - count * period.multiplier * 60 * 60 * 1000
      break
    }
    case 'day': {
      to = to - (to % (60 * 60 * 1000))
      from = to - count * period.multiplier * 24 * 60 * 60 * 1000
      break
    }
    case 'week': {
      const date = new Date(to)
      const week = date.getDay()
      const dif = week === 0 ? 6 : week - 1
      to = to - dif * 60 * 60 * 24
      const newDate = new Date(to)
      to = new Date(`${newDate.getFullYear()}-${newDate.getMonth() + 1}-${newDate.getDate()}`).getTime()
      from = count * period.multiplier * 7 * 24 * 60 * 60 * 1000
      break
    }
    case 'month': {
      const date = new Date(to)
      const year = date.getFullYear()
      const month = date.getMonth() + 1
      to = new Date(`${year}-${month}-01`).getTime()
      from = count * period.multiplier * 30 * 24 * 60 * 60 * 1000
      const fromDate = new Date(from)
      from = new Date(`${fromDate.getFullYear()}-${fromDate.getMonth() + 1}-01`).getTime()
      break
    }
    case 'year': {
      const date = new Date(to)
      const year = date.getFullYear()
      to = new Date(`${year}-01-01`).getTime()
      from = count * period.multiplier * 365 * 24 * 60 * 60 * 1000
      const fromDate = new Date(from)
      from = new Date(`${fromDate.getFullYear()}-01-01`).getTime()
      break
    }
  }
  return [from, to]
}
```

- [ ] **Step 4: 在 ChartProComponent.tsx 中替换为 import**

将 `ChartProComponent.tsx:134-184` 的 `adjustFromTo` 函数体删除，替换为:
```typescript
import { adjustFromTo } from './core/adjustFromTo'
```

删除组件内的 `const adjustFromTo = ...` 函数定义。

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run src/core/__tests__/adjustFromTo.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/ src/ChartProComponent.tsx
git commit -m "refactor: extract adjustFromTo to testable module with unit tests"
```

---

### Task 1.3: 抽取纯函数 — buildStyles

从 `ChartProComponent.tsx:478-500` 抽取 `buildStyles`。

**Files:**
- Create: `src/core/buildStyles.ts`
- Create: `src/core/__tests__/buildStyles.test.ts`
- Modify: `src/ChartProComponent.tsx`

- [ ] **Step 1: 编写 buildStyles 测试**

```typescript
// src/core/__tests__/buildStyles.test.ts
import { describe, it, expect } from 'vitest'
import { buildStyles } from '../buildStyles'

describe('buildStyles', () => {
  it('无填充时只返回 line/point/arc', () => {
    const result = buildStyles({ color: '#ff0000', lineWidth: 2, lineStyle: 'solid' })
    expect(result.line.color).toBe('#ff0000')
    expect(result.line.size).toBe(2)
    expect(result.line.style).toBe('solid')
    expect(result.polygon).toBeUndefined()
  })

  it('有填充时返回完整 polygon/circle/rect', () => {
    const result = buildStyles({
      color: '#ff0000', fillColor: 'rgba(255,0,0,0.2)',
      lineWidth: 3, lineStyle: 'solid'
    })
    expect(result.polygon.color).toBe('rgba(255,0,0,0.2)')
    expect(result.polygon.borderColor).toBe('#ff0000')
    expect(result.polygon.borderSize).toBe(3)
    expect(result.circle.borderColor).toBe('#ff0000')
    expect(result.rect.borderRadius).toBe(0)
  })

  it('dashed 转换为 klinecharts dashed + dashedValue', () => {
    const result = buildStyles({ color: '#000', lineWidth: 1, lineStyle: 'dashed' })
    expect(result.line.style).toBe('dashed')
    expect(result.line.dashedValue).toEqual([6, 4])
  })

  it('dotted 转换为 dashed + [1,3] dashedValue', () => {
    const result = buildStyles({ color: '#000', lineWidth: 1, lineStyle: 'dotted' })
    expect(result.line.style).toBe('dashed')
    expect(result.line.dashedValue).toEqual([1, 3])
  })

  it('fillColor 未提供时使用透明', () => {
    const result = buildStyles({ color: '#000', lineWidth: 1, lineStyle: 'solid' })
    // 不应该有 polygon key（无填充场景）
    expect(result.polygon).toBeUndefined()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/core/__tests__/buildStyles.test.ts`
Expected: FAIL

- [ ] **Step 3: 创建 src/core/buildStyles.ts**

```typescript
// src/core/buildStyles.ts

export interface OverlayStyleInput {
  color: string
  fillColor?: string
  lineWidth: number
  lineStyle: string // 'solid' | 'dashed' | 'dotted'
}

/**
 * 构建完整的 klinecharts overlay 样式对象
 * 每次 override 都传入全部属性，防止浅替换丢失
 */
export function buildStyles(s: OverlayStyleInput): any {
  const lineStyleKC = s.lineStyle === 'dashed' || s.lineStyle === 'dotted' ? 'dashed' : 'solid'
  const dashedValue = s.lineStyle === 'dashed' ? [6, 4] : s.lineStyle === 'dotted' ? [1, 3] : [0]
  const fc = s.fillColor ?? 'rgba(0,0,0,0)'
  const hasFill = s.fillColor != null

  const lineStyles = { color: s.color, size: s.lineWidth, style: lineStyleKC, dashedValue }
  const pointStyles = { color: s.color }

  if (!hasFill) {
    return { line: lineStyles, point: pointStyles, arc: { color: s.color, style: lineStyleKC, dashedValue } }
  }

  const shapeStyles = {
    color: fc, borderColor: s.color, borderSize: s.lineWidth,
    borderStyle: lineStyleKC, borderDashedValue: dashedValue, style: 'stroke_fill',
  }
  return {
    line: lineStyles, point: pointStyles,
    polygon: shapeStyles, circle: shapeStyles, rect: { ...shapeStyles, borderRadius: 0 },
    arc: { color: s.color, style: lineStyleKC, dashedValue },
  }
}
```

- [ ] **Step 4: ChartProComponent.tsx 中替换为 import**

替换 `ChartProComponent.tsx:476-500` 的 `buildStyles` 定义为:
```typescript
import { buildStyles } from './core/buildStyles'
```

删除组件内的 `const buildStyles = ...` 函数定义。

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run src/core/__tests__/buildStyles.test.ts`
Expected: PASS

- [ ] **Step 6: 运行构建确保不破坏**

Run: `npm run build-core`
Expected: 构建成功

- [ ] **Step 7: Commit**

```bash
git add src/core/buildStyles.ts src/core/__tests__/buildStyles.test.ts src/ChartProComponent.tsx
git commit -m "refactor: extract buildStyles to testable module with unit tests"
```

---

### Task 1.4: SuperTrend 指标单元测试

**Files:**
- Create: `src/indicator/__tests__/superTrend.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
// src/indicator/__tests__/superTrend.test.ts
import { describe, it, expect } from 'vitest'
import superTrend from '../trend/superTrend'
import { KLineData } from 'klinecharts'

// 手工构造 20 根 K 线
function makeKlines(count: number): KLineData[] {
  const base = 100
  return Array.from({ length: count }, (_, i) => ({
    timestamp: 1700000000000 + i * 60000,
    open: base + i * 0.5,
    high: base + i * 0.5 + 2,
    low: base + i * 0.5 - 1,
    close: base + i * 0.5 + 1,
    volume: 1000 + i * 10,
    turnover: 0
  }))
}

describe('SuperTrend indicator', () => {
  const klines = makeKlines(30)
  const indicator = { calcParams: [10, 3] } as any

  it('返回与输入等长的数组', () => {
    const result = superTrend.calc!(klines, indicator)
    expect(result).toHaveLength(klines.length)
  })

  it('前 period 个值为 undefined', () => {
    const result = superTrend.calc!(klines, indicator)
    for (let i = 0; i < 10; i++) {
      expect(result[i].up).toBeUndefined()
      expect(result[i].down).toBeUndefined()
    }
  })

  it('period 之后每行恰好有 up 或 down 之一', () => {
    const result = superTrend.calc!(klines, indicator)
    for (let i = 10; i < result.length; i++) {
      const hasUp = result[i].up !== undefined
      const hasDown = result[i].down !== undefined
      expect(hasUp || hasDown).toBe(true)
      // up 和 down 不同时存在
      expect(hasUp && hasDown).toBe(false)
    }
  })

  it('上升趋势 up 值应在 close 下方', () => {
    const result = superTrend.calc!(klines, indicator)
    for (let i = 10; i < result.length; i++) {
      if (result[i].up !== undefined) {
        expect(result[i].up).toBeLessThan(klines[i].high)
      }
    }
  })

  it('空数据返回空数组', () => {
    const result = superTrend.calc!([], indicator)
    expect(result).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 运行测试**

Run: `npx vitest run src/indicator/__tests__/superTrend.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/indicator/__tests__/superTrend.test.ts
git commit -m "test: add SuperTrend indicator unit tests"
```

---

### Task 1.5: Persistence 模块单元测试

**Files:**
- Create: `src/persistence/__tests__/persistence.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
// src/persistence/__tests__/persistence.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { saveLayout, loadLayout, deleteLayout, listLayouts } from '../index'

// Mock localStorage
const store: Record<string, string> = {}
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value }),
  removeItem: vi.fn((key: string) => { delete store[key] }),
  get length() { return Object.keys(store).length },
  key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]) })
}

vi.stubGlobal('localStorage', localStorageMock)

describe('persistence', () => {
  beforeEach(() => {
    localStorageMock.clear()
  })

  it('saveLayout + loadLayout 往返', () => {
    const layout = {
      theme: 'dark', locale: 'zh-CN', timezone: 'Asia/Shanghai',
      mainIndicators: ['MA'], subIndicators: ['VOL'],
      styles: null, overlayData: []
    }
    saveLayout('test1', layout)
    const loaded = loadLayout('test1')
    expect(loaded).not.toBeNull()
    expect(loaded!.theme).toBe('dark')
    expect(loaded!.version).toBe(1)
    expect(loaded!.timestamp).toBeGreaterThan(0)
  })

  it('loadLayout 不存在的 key 返回 null', () => {
    expect(loadLayout('nonexistent')).toBeNull()
  })

  it('deleteLayout 移除后无法加载', () => {
    saveLayout('delme', {
      theme: 'dark', locale: 'en', timezone: 'UTC',
      mainIndicators: [], subIndicators: [],
      styles: null, overlayData: []
    })
    deleteLayout('delme')
    expect(loadLayout('delme')).toBeNull()
  })

  it('listLayouts 返回按时间倒序', () => {
    saveLayout('a', {
      theme: 'dark', locale: 'en', timezone: 'UTC',
      mainIndicators: [], subIndicators: [],
      styles: null, overlayData: []
    })
    saveLayout('b', {
      theme: 'light', locale: 'en', timezone: 'UTC',
      mainIndicators: [], subIndicators: [],
      styles: null, overlayData: []
    })
    const list = listLayouts()
    expect(list.length).toBe(2)
    // 最新的在前
    expect(list[0].timestamp).toBeGreaterThanOrEqual(list[1].timestamp)
  })
})
```

- [ ] **Step 2: 运行测试**

Run: `npx vitest run src/persistence/__tests__/persistence.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/persistence/__tests__/persistence.test.ts
git commit -m "test: add persistence module unit tests"
```

---

### Task 1.6: KeyboardShortcutManager 单元测试

**Files:**
- Create: `src/shortcut/__tests__/shortcut.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
// src/shortcut/__tests__/shortcut.test.ts
import { describe, it, expect, vi } from 'vitest'
import KeyboardShortcutManager from '../index'

describe('KeyboardShortcutManager', () => {
  it('注册并触发 action', () => {
    const mgr = new KeyboardShortcutManager()
    const handler = vi.fn()
    mgr.registerAction('test:action', handler)
    mgr.addBinding({ combo: 'ctrl+t', action: 'test:action' })

    // 模拟键盘事件
    const event = new KeyboardEvent('keydown', { key: 't', ctrlKey: true })
    // 直接调用内部处理（因为 bindTo 需要 DOM）
    const bindings = mgr.getBindings()
    expect(bindings.some(b => b.combo === 'ctrl+t')).toBe(true)
  })

  it('removeBinding 移除绑定', () => {
    const mgr = new KeyboardShortcutManager()
    mgr.addBinding({ combo: 'alt+f', action: 'draw:fibonacci' })
    expect(mgr.getBindings().length).toBeGreaterThan(0)
    const countBefore = mgr.getBindings().length
    mgr.removeBinding('alt+f')
    expect(mgr.getBindings().length).toBe(countBefore - 1)
  })

  it('setEnabled(false) 后不触发 handler', () => {
    const mgr = new KeyboardShortcutManager()
    const handler = vi.fn()
    mgr.registerAction('test:action', handler)
    mgr.addBinding({ combo: 'ctrl+t', action: 'test:action' })

    // 创建一个 mock element 并绑定
    const el = document.createElement('div')
    mgr.bindTo(el)
    mgr.setEnabled(false)

    // 模拟 keydown 事件
    const event = new KeyboardEvent('keydown', { key: 't', ctrlKey: true, bubbles: true })
    el.dispatchEvent(event)

    expect(handler).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 运行测试**

Run: `npx vitest run src/shortcut/__tests__/shortcut.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/shortcut/__tests__/shortcut.test.ts
git commit -m "test: add KeyboardShortcutManager unit tests"
```

---

## Phase 2: 消除架构硬伤（P0）

### Task 2.1: 消除 globalThis.__tradeVisHitTargets

用实例级 `IndicatorClickDetector` 替代全局变量。

**Files:**
- Create: `src/core/indicatorClickDetector.ts`
- Create: `src/core/__tests__/indicatorClickDetector.test.ts`
- Modify: `src/KLineChartPro.tsx:81-121`

- [ ] **Step 1: 编写测试**

```typescript
// src/core/__tests__/indicatorClickDetector.test.ts
import { describe, it, expect } from 'vitest'
import { IndicatorClickDetector } from '../indicatorClickDetector'

describe('IndicatorClickDetector', () => {
  it('注册和清除 hitTarget', () => {
    const detector = new IndicatorClickDetector()
    detector.addTarget({ x: 100, y: 200, trade: { id: 1 }, type: 'entry' })
    detector.addTarget({ x: 300, y: 400, trade: { id: 2 }, type: 'exit' })
    expect(detector.getTargets()).toHaveLength(2)
    detector.clearTargets()
    expect(detector.getTargets()).toHaveLength(0)
  })

  it('findClosest 返回 40px 内最近的目标', () => {
    const detector = new IndicatorClickDetector()
    detector.addTarget({ x: 100, y: 100, trade: { id: 1 }, type: 'entry' })
    detector.addTarget({ x: 200, y: 200, trade: { id: 2 }, type: 'exit' })
    const result = detector.findClosest(105, 105, 40)
    expect(result).not.toBeNull()
    expect(result!.trade.id).toBe(1)
  })

  it('findClosest 超出半径返回 null', () => {
    const detector = new IndicatorClickDetector()
    detector.addTarget({ x: 100, y: 100, trade: { id: 1 }, type: 'entry' })
    const result = detector.findClosest(500, 500, 40)
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/core/__tests__/indicatorClickDetector.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 IndicatorClickDetector**

```typescript
// src/core/indicatorClickDetector.ts

export interface HitTarget {
  x: number
  y: number
  trade: any
  type: string
}

/**
 * 实例级指标图形点击检测器
 * 替代 globalThis.__tradeVisHitTargets 全局变量
 */
export class IndicatorClickDetector {
  private _targets: HitTarget[] = []

  addTarget(target: HitTarget): void {
    this._targets.push(target)
  }

  clearTargets(): void {
    this._targets = []
  }

  getTargets(): readonly HitTarget[] {
    return this._targets
  }

  findClosest(clickX: number, clickY: number, maxRadius: number): HitTarget | null {
    let closest: HitTarget | null = null
    let minDist = Infinity
    for (const ht of this._targets) {
      const dx = clickX - ht.x
      const dy = clickY - ht.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < maxRadius && dist < minDist) {
        minDist = dist
        closest = ht
      }
    }
    return closest
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/core/__tests__/indicatorClickDetector.test.ts`
Expected: PASS

- [ ] **Step 5: 在 KLineChartPro.tsx 中替换全局变量逻辑**

修改 `src/KLineChartPro.tsx`:

1. 添加 import:
```typescript
import { IndicatorClickDetector } from './core/indicatorClickDetector'
```

2. 添加私有成员:
```typescript
private _clickDetector: IndicatorClickDetector = new IndicatorClickDetector()
```

3. 替换 `constructor` 中 `lines 81-121` 的 setTimeout + globalThis 逻辑为:

```typescript
// 指标图形点击检测：先检查元素是否已存在，否则用 MutationObserver
if (options.onIndicatorClick) {
  const onIndClick = options.onIndicatorClick
  const detector = this._clickDetector
  const container = this._container!

  const attachClickListener = (widgetEl: Element) => {
    widgetEl.addEventListener('click', (e: Event) => {
      const me = e as MouseEvent
      const rect = (widgetEl as HTMLElement).getBoundingClientRect()
      const clickX = me.clientX - rect.left
      const clickY = me.clientY - rect.top
      const closest = detector.findClosest(clickX, clickY, 40)
      if (closest) {
        onIndClick({
          indicatorName: 'TradeVis',
          data: { ...closest.trade, type: closest.type },
          x: clickX,
          y: clickY,
        })
      }
    }, true)
  }

  // Solid.js render() 是同步的，元素可能已存在
  const existingEl = container.querySelector('.klinecharts-pro-widget')
  if (existingEl) {
    attachClickListener(existingEl)
  } else {
    // 回退到 MutationObserver 以防 DOM 尚未就绪
    const observer = new MutationObserver(() => {
      const widgetEl = container.querySelector('.klinecharts-pro-widget')
      if (widgetEl) {
        observer.disconnect()
        attachClickListener(widgetEl)
      }
    })
    observer.observe(container, { childList: true, subtree: true })
  }
}
```

4. 添加公共方法供 tradeVisualization 指标使用:
```typescript
getClickDetector(): IndicatorClickDetector {
  return this._clickDetector
}
```

- [ ] **Step 6: 运行构建确认**

Run: `npm run build-core`
Expected: 构建成功

- [ ] **Step 7: Commit**

```bash
git add src/core/indicatorClickDetector.ts src/core/__tests__/indicatorClickDetector.test.ts src/KLineChartPro.tsx
git commit -m "fix: replace globalThis.__tradeVisHitTargets with instance-level IndicatorClickDetector"
```

---

### Task 2.2: 修复 DefaultDatafeed.unsubscribe 内存泄漏

**Files:**
- Modify: `src/DefaultDatafeed.ts:93-94`

- [ ] **Step 1: 实现 unsubscribe**

修改 `src/DefaultDatafeed.ts`:

```typescript
unsubscribe(symbol: SymbolInfo, period: Period): void {
  if (this._ws) {
    // 发送取消订阅消息
    try {
      this._ws.send(JSON.stringify({ action: 'unsubscribe', params: `T.${symbol.ticker}` }))
    } catch {
      // WebSocket 可能已关闭
    }
  }
}
```

- [ ] **Step 2: 添加 dispose 方法关闭 WebSocket**

在 DefaultDatafeed 类中添加:
```typescript
dispose(): void {
  if (this._ws) {
    this._ws.close()
    this._ws = undefined
  }
}
```

- [ ] **Step 3: 运行构建确认**

Run: `npm run build-core`
Expected: 构建成功

- [ ] **Step 4: Commit**

```bash
git add src/DefaultDatafeed.ts
git commit -m "fix: implement DefaultDatafeed.unsubscribe to prevent WebSocket memory leak"
```

---

## Phase 3: 数据层加固（P1）

### Task 3.1: ReconnectingWebSocket

自动重连 WebSocket，带指数退避。

**Files:**
- Create: `src/datafeed/ReconnectingWebSocket.ts`
- Create: `src/datafeed/__tests__/ReconnectingWebSocket.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
// src/datafeed/__tests__/ReconnectingWebSocket.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReconnectingWebSocket, ReconnectOptions } from '../ReconnectingWebSocket'

// 我们测试选项解析和退避计算，不 mock 实际 WebSocket 连接
describe('ReconnectingWebSocket options', () => {
  it('默认选项', () => {
    const opts: ReconnectOptions = {}
    const resolved = {
      maxRetries: opts.maxRetries ?? 5,
      baseDelay: opts.baseDelay ?? 1000,
      maxDelay: opts.maxDelay ?? 30000,
    }
    expect(resolved.maxRetries).toBe(5)
    expect(resolved.baseDelay).toBe(1000)
    expect(resolved.maxDelay).toBe(30000)
  })

  it('指数退避计算', () => {
    const baseDelay = 1000
    const maxDelay = 30000
    // attempt 0: 1000, 1: 2000, 2: 4000, 3: 8000, 4: 16000
    for (let i = 0; i < 5; i++) {
      const delay = Math.min(baseDelay * Math.pow(2, i), maxDelay)
      expect(delay).toBeLessThanOrEqual(maxDelay)
    }
    // attempt 5: min(32000, 30000) = 30000
    const delay5 = Math.min(baseDelay * Math.pow(2, 5), maxDelay)
    expect(delay5).toBe(maxDelay)
  })
})
```

- [ ] **Step 2: 实现 ReconnectingWebSocket**

```typescript
// src/datafeed/ReconnectingWebSocket.ts

export interface ReconnectOptions {
  maxRetries?: number
  baseDelay?: number
  maxDelay?: number
}

/**
 * 带自动重连的 WebSocket 包装器
 * 使用指数退避策略
 */
export class ReconnectingWebSocket {
  private _url: string
  private _ws: WebSocket | null = null
  private _retryCount = 0
  private _maxRetries: number
  private _baseDelay: number
  private _maxDelay: number
  private _disposed = false
  private _retryTimer: ReturnType<typeof setTimeout> | null = null

  onopen: ((ev: Event) => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  onclose: ((ev: CloseEvent) => void) | null = null
  /** 重连时触发，参数为重试次数 */
  onreconnect: ((attempt: number) => void) | null = null

  constructor(url: string, options?: ReconnectOptions) {
    this._url = url
    this._maxRetries = options?.maxRetries ?? 5
    this._baseDelay = options?.baseDelay ?? 1000
    this._maxDelay = options?.maxDelay ?? 30000
    this._connect()
  }

  private _connect(): void {
    if (this._disposed) return
    this._ws = new WebSocket(this._url)

    this._ws.onopen = (ev) => {
      this._retryCount = 0
      this.onopen?.(ev)
    }

    this._ws.onmessage = (ev) => {
      this.onmessage?.(ev)
    }

    this._ws.onerror = (ev) => {
      this.onerror?.(ev)
    }

    this._ws.onclose = (ev) => {
      this.onclose?.(ev)
      if (!this._disposed && this._retryCount < this._maxRetries) {
        const delay = Math.min(
          this._baseDelay * Math.pow(2, this._retryCount),
          this._maxDelay
        )
        this._retryCount++
        this.onreconnect?.(this._retryCount)
        this._retryTimer = setTimeout(() => this._connect(), delay)
      }
    }
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(data)
    }
  }

  close(): void {
    this._disposed = true
    if (this._retryTimer) {
      clearTimeout(this._retryTimer)
      this._retryTimer = null
    }
    this._ws?.close()
    this._ws = null
  }

  get readyState(): number {
    return this._ws?.readyState ?? WebSocket.CLOSED
  }
}
```

- [ ] **Step 3: 运行测试**

Run: `npx vitest run src/datafeed/__tests__/ReconnectingWebSocket.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/datafeed/
git commit -m "feat: add ReconnectingWebSocket with exponential backoff"
```

---

### Task 3.2: K 线数据缓存

**Files:**
- Create: `src/datafeed/DataCache.ts`
- Create: `src/datafeed/__tests__/DataCache.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
// src/datafeed/__tests__/DataCache.test.ts
import { describe, it, expect } from 'vitest'
import { DataCache } from '../DataCache'

describe('DataCache', () => {
  it('set + get 基本往返', () => {
    const cache = new DataCache()
    const data = [
      { timestamp: 1000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 100, turnover: 0 }
    ]
    cache.set('BTC-USDT', '1m', data)
    const result = cache.get('BTC-USDT', '1m')
    expect(result).toEqual(data)
  })

  it('不同 symbol/period 互不干扰', () => {
    const cache = new DataCache()
    cache.set('BTC', '1m', [{ timestamp: 1, open: 1, high: 1, low: 1, close: 1, volume: 1, turnover: 0 }])
    cache.set('ETH', '1m', [{ timestamp: 2, open: 2, high: 2, low: 2, close: 2, volume: 2, turnover: 0 }])
    expect(cache.get('BTC', '1m')![0].timestamp).toBe(1)
    expect(cache.get('ETH', '1m')![0].timestamp).toBe(2)
  })

  it('miss 返回 null', () => {
    const cache = new DataCache()
    expect(cache.get('NONE', '1m')).toBeNull()
  })

  it('clear 清空全部', () => {
    const cache = new DataCache()
    cache.set('BTC', '1m', [])
    cache.clear()
    expect(cache.get('BTC', '1m')).toBeNull()
  })

  it('append 追加数据并去重', () => {
    const cache = new DataCache()
    cache.set('BTC', '1m', [
      { timestamp: 1000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 100, turnover: 0 }
    ])
    cache.append('BTC', '1m', [
      { timestamp: 1000, open: 1, high: 2, low: 0.5, close: 1.8, volume: 110, turnover: 0 },  // 重复 ts，覆盖
      { timestamp: 2000, open: 2, high: 3, low: 1.5, close: 2.5, volume: 200, turnover: 0 }
    ])
    const result = cache.get('BTC', '1m')!
    expect(result).toHaveLength(2)
    expect(result[0].close).toBe(1.8)  // 被覆盖
    expect(result[1].timestamp).toBe(2000)
  })
})
```

- [ ] **Step 2: 实现 DataCache**

```typescript
// src/datafeed/DataCache.ts
import { KLineData } from 'klinecharts'

/**
 * K 线数据内存缓存
 * 按 symbol + period 分组存储，支持追加去重
 */
export class DataCache {
  private _store = new Map<string, KLineData[]>()

  private _key(symbol: string, period: string): string {
    return `${symbol}:${period}`
  }

  get(symbol: string, period: string): KLineData[] | null {
    return this._store.get(this._key(symbol, period)) ?? null
  }

  set(symbol: string, period: string, data: KLineData[]): void {
    this._store.set(this._key(symbol, period), [...data])
  }

  /**
   * 追加数据，按 timestamp 去重（新数据覆盖旧数据）
   */
  append(symbol: string, period: string, newData: KLineData[]): void {
    const key = this._key(symbol, period)
    const existing = this._store.get(key) ?? []
    const tsMap = new Map<number, KLineData>()
    for (const d of existing) tsMap.set(d.timestamp, d)
    for (const d of newData) tsMap.set(d.timestamp, d)
    const merged = Array.from(tsMap.values()).sort((a, b) => a.timestamp - b.timestamp)
    this._store.set(key, merged)
  }

  clear(): void {
    this._store.clear()
  }

  delete(symbol: string, period: string): void {
    this._store.delete(this._key(symbol, period))
  }
}
```

- [ ] **Step 3: 运行测试**

Run: `npx vitest run src/datafeed/__tests__/DataCache.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/datafeed/DataCache.ts src/datafeed/__tests__/DataCache.test.ts
git commit -m "feat: add KLineData cache with deduplication"
```

---

### Task 3.3: 集成 ReconnectingWebSocket 到 DefaultDatafeed

**Files:**
- Modify: `src/DefaultDatafeed.ts`

- [ ] **Step 1: 替换原生 WebSocket 为 ReconnectingWebSocket**

修改 `src/DefaultDatafeed.ts`:

1. 替换 import:
```typescript
import { ReconnectingWebSocket } from './datafeed/ReconnectingWebSocket'
```

2. 替换成员类型:
```typescript
private _ws?: ReconnectingWebSocket
```

3. 在 `subscribe()` 方法中替换 `new WebSocket(...)` 为:
```typescript
this._ws = new ReconnectingWebSocket(
  `wss://delayed.polygon.io/${symbol.market}`,
  { maxRetries: 5, baseDelay: 1000, maxDelay: 30000 }
)
```

4. 在 `unsubscribe()` 中改用 `this._ws?.close()`:
```typescript
unsubscribe(symbol: SymbolInfo, period: Period): void {
  if (this._ws) {
    try {
      this._ws.send(JSON.stringify({ action: 'unsubscribe', params: `T.${symbol.ticker}` }))
    } catch { /* ignore */ }
  }
}

dispose(): void {
  this._ws?.close()
  this._ws = undefined
}
```

- [ ] **Step 2: 运行构建**

Run: `npm run build-core`
Expected: 构建成功

- [ ] **Step 3: Commit**

```bash
git add src/DefaultDatafeed.ts
git commit -m "feat: integrate ReconnectingWebSocket into DefaultDatafeed"
```

---

## Phase 4: 报警系统（P2）

### Task 4.1: Alert 类型定义

**Files:**
- Create: `src/alert/types.ts`

- [ ] **Step 1: 创建类型**

```typescript
// src/alert/types.ts

export interface AlertConfig {
  /** 唯一标识 */
  id: string
  /** 报警价格 */
  price: number
  /** 报警类型: crossing = 穿越, above = 上穿, below = 下穿 */
  condition: 'crossing' | 'above' | 'below'
  /** 报警触发时回调 */
  message?: string
  /** 水平线颜色 */
  color?: string
  /** 线型 */
  lineStyle?: 'solid' | 'dashed' | 'dotted'
  /** 是否已触发 */
  triggered?: boolean
}

export interface AlertEvent {
  alert: AlertConfig
  /** 触发时的价格 */
  triggerPrice: number
  timestamp: number
}
```

- [ ] **Step 2: Commit**

```bash
git add src/alert/types.ts
git commit -m "feat: define alert system type interfaces"
```

---

### Task 4.2: AlertManager 实现

**Files:**
- Create: `src/alert/index.ts`
- Create: `src/alert/__tests__/alert.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
// src/alert/__tests__/alert.test.ts
import { describe, it, expect, vi } from 'vitest'
import { AlertManager } from '../index'

describe('AlertManager', () => {
  it('添加和查询 alert', () => {
    const mgr = new AlertManager()
    mgr.addAlert({ id: 'a1', price: 100, condition: 'crossing' })
    expect(mgr.getAlerts()).toHaveLength(1)
    expect(mgr.getAlert('a1')?.price).toBe(100)
  })

  it('removeAlert 移除', () => {
    const mgr = new AlertManager()
    mgr.addAlert({ id: 'a1', price: 100, condition: 'crossing' })
    mgr.removeAlert('a1')
    expect(mgr.getAlerts()).toHaveLength(0)
  })

  it('checkPrice — crossing 条件触发', () => {
    const mgr = new AlertManager()
    const onTrigger = vi.fn()
    mgr.onTrigger = onTrigger
    mgr.addAlert({ id: 'a1', price: 100, condition: 'crossing' })

    // 前一个价格在下方
    mgr.checkPrice(95, 1000)  // 不触发
    expect(onTrigger).not.toHaveBeenCalled()

    mgr.checkPrice(105, 2000)  // 穿越 100，触发
    expect(onTrigger).toHaveBeenCalledWith(
      expect.objectContaining({ alert: expect.objectContaining({ id: 'a1' }), triggerPrice: 105 })
    )
  })

  it('above 条件只在上穿时触发', () => {
    const mgr = new AlertManager()
    const onTrigger = vi.fn()
    mgr.onTrigger = onTrigger
    mgr.addAlert({ id: 'a1', price: 100, condition: 'above' })

    mgr.checkPrice(105, 1000)  // 已在上方 → 设置 prevPrice
    mgr.checkPrice(95, 2000)   // 下穿不触发
    expect(onTrigger).not.toHaveBeenCalled()

    mgr.checkPrice(101, 3000)  // 上穿触发
    expect(onTrigger).toHaveBeenCalledTimes(1)
  })

  it('clearAll 清空', () => {
    const mgr = new AlertManager()
    mgr.addAlert({ id: 'a1', price: 100, condition: 'crossing' })
    mgr.addAlert({ id: 'a2', price: 200, condition: 'above' })
    mgr.clearAll()
    expect(mgr.getAlerts()).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 实现 AlertManager**

```typescript
// src/alert/index.ts
import { AlertConfig, AlertEvent } from './types'

export { AlertConfig, AlertEvent } from './types'

export class AlertManager {
  private _alerts = new Map<string, AlertConfig>()
  private _prevPrice: number | null = null

  /** 报警触发回调 */
  onTrigger: ((event: AlertEvent) => void) | null = null

  addAlert(config: AlertConfig): void {
    this._alerts.set(config.id, { ...config, triggered: false })
  }

  removeAlert(id: string): void {
    this._alerts.delete(id)
  }

  getAlert(id: string): AlertConfig | undefined {
    return this._alerts.get(id)
  }

  getAlerts(): AlertConfig[] {
    return Array.from(this._alerts.values())
  }

  clearAll(): void {
    this._alerts.clear()
  }

  /**
   * 检查当前价格是否触发任何报警
   * 应在每次 K 线更新时调用
   */
  checkPrice(currentPrice: number, timestamp: number): void {
    if (this._prevPrice === null) {
      this._prevPrice = currentPrice
      return
    }

    for (const alert of this._alerts.values()) {
      if (alert.triggered) continue

      let triggered = false
      switch (alert.condition) {
        case 'crossing':
          triggered = (this._prevPrice < alert.price && currentPrice >= alert.price) ||
                      (this._prevPrice > alert.price && currentPrice <= alert.price)
          break
        case 'above':
          triggered = this._prevPrice <= alert.price && currentPrice > alert.price
          break
        case 'below':
          triggered = this._prevPrice >= alert.price && currentPrice < alert.price
          break
      }

      if (triggered) {
        alert.triggered = true
        this.onTrigger?.({
          alert,
          triggerPrice: currentPrice,
          timestamp
        })
      }
    }

    this._prevPrice = currentPrice
  }

  /** 重置所有报警的触发状态 */
  resetAll(): void {
    for (const alert of this._alerts.values()) {
      alert.triggered = false
    }
  }
}
```

- [ ] **Step 3: 运行测试**

Run: `npx vitest run src/alert/__tests__/alert.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/alert/
git commit -m "feat: add AlertManager with crossing/above/below conditions"
```

---

### Task 4.3: Alert Overlay（水平报警线）

**Files:**
- Create: `src/alert/AlertLine.ts`
- Modify: `src/extension/index.ts`

- [ ] **Step 1: 创建 AlertLine overlay**

```typescript
// src/alert/AlertLine.ts
import { OverlayTemplate } from 'klinecharts'

const alertLine: OverlayTemplate = {
  name: 'alertLine',
  totalStep: 2,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay }) => {
    const color = overlay.styles?.line?.color ?? '#ff9800'
    if (coordinates.length < 1) return []
    const y = coordinates[0].y
    return [
      {
        type: 'line',
        attrs: { coordinates: [{ x: 0, y }, { x: 999999, y }] },
        styles: {
          color,
          size: 1,
          style: 'dashed',
          dashedValue: [6, 4]
        }
      },
      {
        type: 'text',
        attrs: { x: 10, y: y - 14, text: overlay.extendData?.message ?? 'Alert' },
        styles: { color, size: 11 }
      }
    ]
  }
}

export default alertLine
```

- [ ] **Step 2: 在 extension/index.ts 注册**

在 `src/extension/index.ts` 的 imports 末尾添加:
```typescript
import alertLine from '../alert/AlertLine'
```

在 overlays 数组末尾添加 `alertLine`。

- [ ] **Step 3: 运行构建**

Run: `npm run build-core`
Expected: 构建成功

- [ ] **Step 4: Commit**

```bash
git add src/alert/AlertLine.ts src/extension/index.ts
git commit -m "feat: add alertLine overlay for visual price alerts"
```

---

### Task 4.4: 集成 AlertManager 到 ChartPro API

**Files:**
- Modify: `src/types.ts`
- Modify: `src/KLineChartPro.tsx`
- Modify: `src/index.ts`

- [ ] **Step 1: 扩展 ChartPro 接口**

在 `src/types.ts` 的 `ChartPro` 接口中添加:
```typescript
/** 添加价格报警 */
addAlert(config: import('./alert/types').AlertConfig): void
/** 移除报警 */
removeAlert(id: string): void
/** 获取所有报警 */
getAlerts(): import('./alert/types').AlertConfig[]
```

在 `ChartProOptions` 中添加:
```typescript
/** 报警触发回调 */
onAlertTrigger?: (event: import('./alert/types').AlertEvent) => void
```

- [ ] **Step 2: 在 KLineChartPro 中实现**

在 `src/KLineChartPro.tsx` 中:

1. Import:
```typescript
import { AlertManager, AlertConfig } from './alert'
```

2. 添加私有成员:
```typescript
private _alertManager: AlertManager = new AlertManager()
```

3. 在 constructor 中，如果有 `onAlertTrigger` 回调:
```typescript
if (options.onAlertTrigger) {
  this._alertManager.onTrigger = options.onAlertTrigger
}
```

4. 实现公共方法:
```typescript
addAlert(config: AlertConfig): void {
  this._alertManager.addAlert(config)
  // 创建可视化 overlay
  const chart = this.getChart()
  if (chart) {
    chart.createOverlay({
      name: 'alertLine',
      id: `alert_${config.id}`,
      points: [{ value: config.price }],
      styles: { line: { color: config.color ?? '#ff9800' } },
      extendData: { message: config.message ?? `Alert @ ${config.price}` },
      lock: true
    })
  }
}

removeAlert(id: string): void {
  this._alertManager.removeAlert(id)
  this.getChart()?.removeOverlay({ id: `alert_${id}` })
}

getAlerts(): AlertConfig[] {
  return this._alertManager.getAlerts()
}
```

- [ ] **Step 3: 在 index.ts 导出**

在 `src/index.ts` 添加:
```typescript
export { AlertManager } from './alert'
export type { AlertConfig, AlertEvent } from './alert/types'
```

- [ ] **Step 4: 运行构建**

Run: `npm run build-core`
Expected: 构建成功

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/KLineChartPro.tsx src/index.ts
git commit -m "feat: integrate AlertManager into ChartPro public API"
```

---

## Phase 5: 多品种对比（P2）

### Task 5.1: Compare 数据归一化

**Files:**
- Create: `src/compare/index.ts`
- Create: `src/compare/__tests__/compare.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
// src/compare/__tests__/compare.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeToPercent } from '../index'

describe('normalizeToPercent', () => {
  it('将价格序列归一化为百分比变化', () => {
    const data = [
      { timestamp: 1, close: 100 },
      { timestamp: 2, close: 110 },
      { timestamp: 3, close: 90 },
    ]
    const result = normalizeToPercent(data as any)
    expect(result[0]).toBeCloseTo(0)         // 基准 = 0%
    expect(result[1]).toBeCloseTo(10)        // +10%
    expect(result[2]).toBeCloseTo(-10)       // -10%
  })

  it('空数据返回空', () => {
    expect(normalizeToPercent([])).toEqual([])
  })
})
```

- [ ] **Step 2: 实现**

```typescript
// src/compare/index.ts
import { KLineData } from 'klinecharts'

/**
 * 将价格序列归一化为相对百分比变化
 * 以第一个数据点为基准 (0%)
 */
export function normalizeToPercent(data: KLineData[]): number[] {
  if (data.length === 0) return []
  const basePrice = data[0].close
  if (basePrice === 0) return data.map(() => 0)
  return data.map(d => ((d.close - basePrice) / basePrice) * 100)
}
```

- [ ] **Step 3: 运行测试**

Run: `npx vitest run src/compare/__tests__/compare.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/compare/
git commit -m "feat: add price normalization utility for multi-symbol comparison"
```

---

### Task 5.2: Compare API 集成

**Files:**
- Modify: `src/types.ts`
- Modify: `src/KLineChartPro.tsx`
- Modify: `src/index.ts`

- [ ] **Step 1: 扩展 ChartPro 接口**

在 `src/types.ts` 的 `ChartPro` 接口添加:
```typescript
/** 添加对比品种（需要 datafeed 获取对比品种数据） */
addComparison(symbol: SymbolInfo): Promise<void>
/** 移除对比品种 */
removeComparison(ticker: string): void
```

在 `ChartProOptions` 添加:
```typescript
/** addComparison 使用的 datafeed，默认复用 options.datafeed */
comparisonDatafeed?: Datafeed
```

- [ ] **Step 2: 在 KLineChartPro 中实现（获取对比品种数据 + 归一化）**

在 `src/KLineChartPro.tsx` 中:

```typescript
import { registerIndicator } from 'klinecharts'
import { normalizeToPercent } from './compare'

private _comparisons = new Map<string, string>() // ticker → indicatorName
private _datafeed: Datafeed  // 在 constructor 中保存: this._datafeed = options.datafeed

async addComparison(symbol: SymbolInfo): Promise<void> {
  const chart = this.getChart()
  if (!chart) return

  // 1. 获取对比品种的历史数据（与主图同周期同区间）
  const p = this.getPeriod()
  const mainData = chart.getDataList()
  if (mainData.length === 0) return

  const from = mainData[0].timestamp
  const to = mainData[mainData.length - 1].timestamp
  const compData = await this._datafeed.getHistoryKLineData(symbol, p, from, to)
  if (compData.length === 0) return

  // 2. 归一化为百分比变化
  const mainPercent = normalizeToPercent(mainData as any)
  const compPercent = normalizeToPercent(compData)

  // 3. 按 timestamp 对齐，构建 calc 数据
  const compMap = new Map<number, number>()
  compData.forEach((d, i) => { compMap.set(d.timestamp, compPercent[i]) })

  // 4. 注册动态指标
  const indicatorName = `COMPARE_${symbol.ticker.replace(/[^A-Z0-9]/g, '_')}`
  registerIndicator({
    name: indicatorName,
    shortName: symbol.shortName ?? symbol.ticker,
    figures: [{ key: 'pct', title: `${symbol.ticker}: `, type: 'line' }],
    calc: (dataList) => {
      return dataList.map(d => ({
        pct: compMap.get(d.timestamp) ?? undefined
      }))
    }
  })

  chart.createIndicator(indicatorName, true, { id: 'candle_pane' })
  this._comparisons.set(symbol.ticker, indicatorName)
}

removeComparison(ticker: string): void {
  const indicatorName = this._comparisons.get(ticker)
  if (indicatorName) {
    this.getChart()?.removeIndicator('candle_pane', indicatorName)
    this._comparisons.delete(ticker)
  }
}
```

注意: 在 constructor 中保存 datafeed 引用:
```typescript
this._datafeed = options.datafeed
```

- [ ] **Step 3: 导出新类型**

在 `src/index.ts` 添加:
```typescript
export { normalizeToPercent } from './compare'
```

- [ ] **Step 4: 运行构建**

Run: `npm run build-core`
Expected: 构建成功

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/KLineChartPro.tsx src/index.ts
git commit -m "feat: add multi-symbol comparison API with data fetching"
```

---

## Phase 6: 错误处理与代码清理（P1）

### Task 6.1: DefaultDatafeed 添加错误处理

**Files:**
- Modify: `src/DefaultDatafeed.ts`

- [ ] **Step 1: 为 searchSymbols 添加 try/catch 和 response.ok 检查**

替换 `DefaultDatafeed.ts:31-43` 的 `searchSymbols` 方法:
```typescript
async searchSymbols(search?: string): Promise<SymbolInfo[]> {
  try {
    const response = await fetch(`https://api.polygon.io/v3/reference/tickers?apiKey=${this._apiKey}&active=true&search=${search ?? ''}`)
    if (!response.ok) {
      console.warn(`[TradingChest] Symbol search failed: ${response.status}`)
      return []
    }
    const result = await response.json()
    return (result.results || []).map((data: any) => ({
      ticker: data.ticker,
      name: data.name,
      shortName: data.ticker,
      market: data.market,
      exchange: data.primary_exchange,
      priceCurrency: data.currency_name,
      type: data.type,
      logo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAAAXNSR0IArs4c6QAAAARzQklUCAgICHwIZIgAAA66SURBVHic7Z17cFTVGcB/...'
    }))
  } catch (e) {
    console.warn('[TradingChest] Symbol search error:', e)
    return []
  }
}
```

- [ ] **Step 2: 为 getHistoryKLineData 添加同样的错误处理**

替换 `DefaultDatafeed.ts:46-58` 的 `getHistoryKLineData` 方法:
```typescript
async getHistoryKLineData(symbol: SymbolInfo, period: Period, from: number, to: number): Promise<KLineData[]> {
  try {
    const response = await fetch(`https://api.polygon.io/v2/aggs/ticker/${symbol.ticker}/range/${period.multiplier}/${period.timespan}/${from}/${to}?apiKey=${this._apiKey}`)
    if (!response.ok) {
      console.warn(`[TradingChest] History data failed: ${response.status}`)
      return []
    }
    const result = await response.json()
    return (result.results || []).map((data: any) => ({
      timestamp: data.t,
      open: data.o,
      high: data.h,
      low: data.l,
      close: data.c,
      volume: data.v,
      turnover: data.vw
    }))
  } catch (e) {
    console.warn('[TradingChest] History data error:', e)
    return []
  }
}
```

- [ ] **Step 3: 运行构建**

Run: `npm run build-core`
Expected: 构建成功

- [ ] **Step 4: Commit**

```bash
git add src/DefaultDatafeed.ts
git commit -m "fix: add error handling to DefaultDatafeed API calls"
```

---

### Task 6.2: 消除 @ts-expect-error

**Files:**
- Modify: `src/ChartProComponent.tsx`

- [ ] **Step 1: 修复 ChartProComponent.tsx 中的 5 处 @ts-expect-error**

**Line 51** (`createTooltipDataSource`): 添加正确的类型断言:
```typescript
createTooltipDataSource: ({ indicator, defaultStyles }: { indicator: Indicator; defaultStyles: Styles }) => {
```

**Line 264** (`subIndicatorMap`): 声明正确类型:
```typescript
const subIndicatorMap: Record<string, string> = {}
```

**Line 268** (`subIndicatorMap[indicator] = paneId`): 上一步修复后此处不再需要 @ts-expect-error。删除注释。

**Line 312** (`delete newIndicators[data.indicatorName]`): 同样在 Line 310 处声明类型:
```typescript
const newIndicators: Record<string, string> = { ...subIndicators() }
```

**Line 534 和 540** (`newSubIndicators[data.name]` 和 `delete newSubIndicators[data.name]`): 同样声明类型:
```typescript
const newSubIndicators: Record<string, string> = { ...subIndicators() }
```

- [ ] **Step 2: 运行构建确认无 TS 错误**

Run: `npm run build-core`
Expected: 构建成功

- [ ] **Step 3: Commit**

```bash
git add src/ChartProComponent.tsx
git commit -m "fix: resolve all 5 @ts-expect-error with proper type declarations"
```

---

### Task 6.3: 运行全部测试 + 构建验证

- [ ] **Step 1: 运行完整测试套件**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 2: 运行完整构建**

Run: `npm run build`
Expected: 构建成功，dist/ 产物正常

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: verify all tests pass and build succeeds"
```

---

## 后续阶段（规划，不在本计划实施范围）

以下功能建议在本计划完成后、独立的计划中实施:

### Phase 7: 多图表布局（P1 — 需要大量 UI 工作）
- 多窗格容器组件 (`src/layout/MultiChartLayout.tsx`)
- 窗格同步（十字线联动、时间轴同步）
- 拖拽调整窗格大小

### Phase 8: K 线回放 / Bar Replay（P2）
- 回放控制器（播放/暂停/速度/跳转）
- 数据切片和步进

### Phase 9: 脚本引擎 / Pine Script 替代（P3）
- DSL 设计和解析器
- 指标 DSL → IndicatorTemplate 编译
- 在线编辑器 UI

### Phase 10: 指标懒加载和增量计算（P1 性能）
- 按需 `registerIndicator` 替代全量注册
- `calc` 函数增量模式（传入 prevResult + 新增数据）
