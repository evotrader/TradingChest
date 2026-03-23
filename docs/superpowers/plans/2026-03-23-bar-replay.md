# K 线回放 (Bar Replay) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 K 线回放功能，让交易员可以选择历史时间点，逐根 K 线前进/后退/自动播放，用于策略复盘和训练

**Architecture:** 创建 `ReplayEngine` 纯逻辑类管理回放状态（当前位置、速度、播放/暂停），通过 klinecharts 的 `applyNewData` / `updateData` API 驱动图表。UI 层添加 `ReplayControlBar` 组件提供播放控制。回放模式下断开实时数据订阅。

**Tech Stack:** KLineChart 9.x (`applyNewData`, `updateData`), Solid.js, TypeScript, Vitest

---

## 文件结构

```
新建文件:
  src/replay/                          # 回放系统
    ReplayEngine.ts                    # 核心逻辑：步进/播放/暂停/速度
    types.ts                           # ReplayState, ReplayOptions 接口
    __tests__/ReplayEngine.test.ts     # 单元测试
  src/widget/replay-bar/               # 回放控制 UI
    index.tsx                          # ReplayControlBar 组件
    index.less                         # 样式

修改文件:
  src/types.ts                         # ChartPro 接口扩展
  src/KLineChartPro.tsx                # 集成 ReplayEngine
  src/ChartProComponent.tsx            # 回放 UI 集成
  src/widget/index.tsx                 # 导出 ReplayControlBar
  src/index.ts                         # 导出 replay 模块
  src/i18n/zh-CN.ts                    # 回放相关翻译
  src/i18n/en-US.ts
```

---

## Task 1: ReplayEngine 核心逻辑

**Files:**
- Create: `src/replay/types.ts`
- Create: `src/replay/__tests__/ReplayEngine.test.ts`
- Create: `src/replay/ReplayEngine.ts`

- [ ] **Step 1: 创建类型定义**

```typescript
// src/replay/types.ts
import { KLineData } from 'klinecharts'

export type ReplaySpeed = 1 | 2 | 4 | 8 | 16

export interface ReplayState {
  /** 是否处于回放模式 */
  active: boolean
  /** 是否正在自动播放 */
  playing: boolean
  /** 播放速度倍数 */
  speed: ReplaySpeed
  /** 当前回放到的 K 线索引（fullData 中的位置） */
  position: number
  /** 完整数据总长度 */
  totalBars: number
}

export interface ReplayCallbacks {
  /** 当可见数据变化时调用（applyNewData） */
  onDataChange: (data: KLineData[]) => void
  /** 当最后一根 K 线更新时调用（updateData） */
  onBarUpdate: (bar: KLineData) => void
  /** 回放状态变化 */
  onStateChange: (state: ReplayState) => void
}
```

- [ ] **Step 2: 编写测试**

```typescript
// src/replay/__tests__/ReplayEngine.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReplayEngine } from '../ReplayEngine'
import { KLineData } from 'klinecharts'

function makeKlines(count: number): KLineData[] {
  return Array.from({ length: count }, (_, i) => ({
    timestamp: 1700000000000 + i * 60000,
    open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i,
    volume: 1000, turnover: 0
  }))
}

describe('ReplayEngine', () => {
  let engine: ReplayEngine
  const onDataChange = vi.fn()
  const onBarUpdate = vi.fn()
  const onStateChange = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    engine = new ReplayEngine({ onDataChange, onBarUpdate, onStateChange })
    onDataChange.mockClear()
    onBarUpdate.mockClear()
    onStateChange.mockClear()
  })

  afterEach(() => {
    engine.dispose()
    vi.useRealTimers()
  })

  it('start 进入回放模式，显示前 N 根 K 线', () => {
    const data = makeKlines(100)
    engine.start(data, 50)

    expect(onDataChange).toHaveBeenCalledTimes(1)
    expect(onDataChange.mock.calls[0][0]).toHaveLength(50)
    expect(engine.getState().active).toBe(true)
    expect(engine.getState().position).toBe(50)
    expect(engine.getState().totalBars).toBe(100)
    expect(engine.getState().playing).toBe(false)
  })

  it('stepForward 前进一根 K 线', () => {
    const data = makeKlines(100)
    engine.start(data, 50)
    onDataChange.mockClear()

    engine.stepForward()

    expect(onBarUpdate).toHaveBeenCalledTimes(1)
    expect(engine.getState().position).toBe(51)
  })

  it('stepBackward 后退一根 K 线', () => {
    const data = makeKlines(100)
    engine.start(data, 50)
    onDataChange.mockClear()

    engine.stepBackward()

    expect(onDataChange).toHaveBeenCalledTimes(1)
    expect(onDataChange.mock.calls[0][0]).toHaveLength(49)
    expect(engine.getState().position).toBe(49)
  })

  it('play/pause 自动前进', () => {
    const data = makeKlines(100)
    engine.start(data, 50)
    onBarUpdate.mockClear()

    engine.play()
    expect(engine.getState().playing).toBe(true)

    // 默认速度1x = 1000ms/bar
    vi.advanceTimersByTime(3000)
    expect(onBarUpdate.mock.calls.length).toBe(3)
    expect(engine.getState().position).toBe(53)

    engine.pause()
    expect(engine.getState().playing).toBe(false)

    vi.advanceTimersByTime(3000)
    // 暂停后不再前进
    expect(onBarUpdate.mock.calls.length).toBe(3)
  })

  it('setSpeed 改变播放速度', () => {
    const data = makeKlines(100)
    engine.start(data, 50)
    onBarUpdate.mockClear()

    engine.setSpeed(4)
    engine.play()

    // 4x speed = 250ms/bar
    vi.advanceTimersByTime(1000)
    expect(onBarUpdate.mock.calls.length).toBe(4)
  })

  it('到达末尾自动暂停', () => {
    const data = makeKlines(5)
    engine.start(data, 3)
    onBarUpdate.mockClear()

    engine.play()
    vi.advanceTimersByTime(5000) // 超过剩余 2 根

    expect(engine.getState().position).toBe(5)
    expect(engine.getState().playing).toBe(false)
  })

  it('goToPosition 跳转到指定位置', () => {
    const data = makeKlines(100)
    engine.start(data, 50)
    onDataChange.mockClear()

    engine.goToPosition(80)

    expect(onDataChange).toHaveBeenCalledTimes(1)
    expect(onDataChange.mock.calls[0][0]).toHaveLength(80)
    expect(engine.getState().position).toBe(80)
  })

  it('stop 退出回放模式', () => {
    const data = makeKlines(100)
    engine.start(data, 50)

    engine.stop()

    expect(engine.getState().active).toBe(false)
    expect(engine.getState().playing).toBe(false)
  })

  it('stepBackward 在位置 1 时不后退', () => {
    const data = makeKlines(100)
    engine.start(data, 1)

    engine.stepBackward()

    expect(engine.getState().position).toBe(1)
  })
})
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npx vitest run src/replay/__tests__/ReplayEngine.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: 实现 ReplayEngine**

```typescript
// src/replay/ReplayEngine.ts
import { KLineData } from 'klinecharts'
import { ReplayState, ReplaySpeed, ReplayCallbacks } from './types'

const BASE_INTERVAL = 1000 // 1x speed = 1 bar per second

export class ReplayEngine {
  private _fullData: KLineData[] = []
  private _position = 0
  private _playing = false
  private _speed: ReplaySpeed = 1
  private _active = false
  private _timer: ReturnType<typeof setInterval> | null = null
  private _callbacks: ReplayCallbacks

  constructor(callbacks: ReplayCallbacks) {
    this._callbacks = callbacks
  }

  /** 进入回放模式，从 startPosition 开始 */
  start(data: KLineData[], startPosition: number): void {
    this._fullData = data
    this._position = Math.max(1, Math.min(startPosition, data.length))
    this._active = true
    this._playing = false
    this._speed = 1
    this._stopTimer()

    this._callbacks.onDataChange(this._fullData.slice(0, this._position))
    this._emitState()
  }

  /** 退出回放模式 */
  stop(): void {
    this._stopTimer()
    this._active = false
    this._playing = false
    this._emitState()
  }

  /** 前进一根 K 线 */
  stepForward(): void {
    if (!this._active || this._position >= this._fullData.length) return
    this._position++
    this._callbacks.onBarUpdate(this._fullData[this._position - 1])
    this._emitState()
  }

  /** 后退一根 K 线 */
  stepBackward(): void {
    if (!this._active || this._position <= 1) return
    this._position--
    this._callbacks.onDataChange(this._fullData.slice(0, this._position))
    this._emitState()
  }

  /** 自动播放 */
  play(): void {
    if (!this._active || this._playing) return
    this._playing = true
    this._startTimer()
    this._emitState()
  }

  /** 暂停 */
  pause(): void {
    this._playing = false
    this._stopTimer()
    this._emitState()
  }

  /** 设置播放速度 */
  setSpeed(speed: ReplaySpeed): void {
    this._speed = speed
    if (this._playing) {
      this._stopTimer()
      this._startTimer()
    }
    this._emitState()
  }

  /** 跳转到指定位置 */
  goToPosition(position: number): void {
    if (!this._active) return
    this._position = Math.max(1, Math.min(position, this._fullData.length))
    this._callbacks.onDataChange(this._fullData.slice(0, this._position))
    this._emitState()
  }

  getState(): ReplayState {
    return {
      active: this._active,
      playing: this._playing,
      speed: this._speed,
      position: this._position,
      totalBars: this._fullData.length,
    }
  }

  dispose(): void {
    this._stopTimer()
  }

  private _startTimer(): void {
    const interval = BASE_INTERVAL / this._speed
    this._timer = setInterval(() => {
      if (this._position >= this._fullData.length) {
        this.pause()
        return
      }
      this.stepForward()
    }, interval)
  }

  private _stopTimer(): void {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
  }

  private _emitState(): void {
    this._callbacks.onStateChange(this.getState())
  }
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run src/replay/__tests__/ReplayEngine.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/replay/
git commit -m "feat: add ReplayEngine for bar-by-bar chart replay"
```

---

## Task 2: ReplayControlBar UI 组件

**Files:**
- Create: `src/widget/replay-bar/index.tsx`
- Create: `src/widget/replay-bar/index.less`
- Modify: `src/widget/index.tsx` (add export)

- [ ] **Step 1: 创建样式文件**

```less
// src/widget/replay-bar/index.less
.klinecharts-pro-replay-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  background: var(--klinecharts-pro-card-bg, rgba(22, 22, 25, 0.9));
  border-radius: 4px;
  position: absolute;
  bottom: 40px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  user-select: none;

  .replay-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 4px;
    cursor: pointer;
    color: var(--klinecharts-pro-text-color, #929AA5);
    &:hover { background: rgba(255,255,255,0.1); }
    svg { width: 16px; height: 16px; fill: currentColor; }
  }

  .replay-speed {
    font-size: 12px;
    color: var(--klinecharts-pro-text-color, #929AA5);
    cursor: pointer;
    min-width: 28px;
    text-align: center;
    &:hover { color: #1677ff; }
  }

  .replay-progress {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--klinecharts-pro-text-secondary, #76808F);

    input[type="range"] {
      width: 120px;
      height: 4px;
      accent-color: #1677ff;
    }
  }

  .replay-exit {
    color: #F23645;
    font-size: 12px;
    cursor: pointer;
    &:hover { text-decoration: underline; }
  }
}
```

- [ ] **Step 2: 创建组件**

```typescript
// src/widget/replay-bar/index.tsx
import { Component, Show } from 'solid-js'
import type { ReplayState, ReplaySpeed } from '../../replay/types'
import i18n from '../../i18n'
import './index.less'

export interface ReplayControlBarProps {
  locale: string
  state: ReplayState
  onPlay: () => void
  onPause: () => void
  onStepForward: () => void
  onStepBackward: () => void
  onSpeedChange: (speed: ReplaySpeed) => void
  onPositionChange: (position: number) => void
  onStop: () => void
}

const SPEEDS: ReplaySpeed[] = [1, 2, 4, 8, 16]

const ReplayControlBar: Component<ReplayControlBarProps> = (props) => {
  const nextSpeed = () => {
    const idx = SPEEDS.indexOf(props.state.speed)
    return SPEEDS[(idx + 1) % SPEEDS.length]
  }

  return (
    <Show when={props.state.active}>
      <div class="klinecharts-pro-replay-bar">
        {/* Step backward */}
        <div class="replay-btn" onClick={props.onStepBackward} title={i18n('replay_back', props.locale)}>
          <svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" transform="scale(-1,1) translate(-24,0)"/></svg>
        </div>

        {/* Play / Pause */}
        <div class="replay-btn" onClick={() => props.state.playing ? props.onPause() : props.onPlay()}>
          {props.state.playing ? (
            <svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          ) : (
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          )}
        </div>

        {/* Step forward */}
        <div class="replay-btn" onClick={props.onStepForward} title={i18n('replay_forward', props.locale)}>
          <svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
        </div>

        {/* Speed */}
        <span
          class="replay-speed"
          onClick={() => props.onSpeedChange(nextSpeed())}
          title={i18n('replay_speed', props.locale)}>
          {props.state.speed}x
        </span>

        {/* Progress slider */}
        <div class="replay-progress">
          <span>{props.state.position}</span>
          <input
            type="range"
            min={1}
            max={props.state.totalBars}
            value={props.state.position}
            onInput={(e) => props.onPositionChange(parseInt((e.target as HTMLInputElement).value))}
          />
          <span>{props.state.totalBars}</span>
        </div>

        {/* Exit */}
        <span class="replay-exit" onClick={props.onStop}>
          {i18n('replay_exit', props.locale)}
        </span>
      </div>
    </Show>
  )
}

export default ReplayControlBar
```

- [ ] **Step 3: 在 widget/index.tsx 添加导出**

在 `src/widget/index.tsx` 中添加:
```typescript
export { default as ReplayControlBar } from './replay-bar'
```

- [ ] **Step 4: 运行构建**

Run: `npm run build-core`
Expected: 构建成功

- [ ] **Step 5: Commit**

```bash
git add src/widget/replay-bar/ src/widget/index.tsx
git commit -m "feat: add ReplayControlBar UI component"
```

---

## Task 3: i18n 翻译

**Files:**
- Modify: `src/i18n/zh-CN.ts`
- Modify: `src/i18n/en-US.ts`

- [ ] **Step 1: 读取两个 i18n 文件，添加回放相关翻译**

zh-CN 添加:
```typescript
replay: '回放',
replay_back: '后退一根',
replay_forward: '前进一根',
replay_speed: '播放速度',
replay_exit: '退出回放',
replay_start: '开始回放',
```

en-US 添加:
```typescript
replay: 'Replay',
replay_back: 'Step Back',
replay_forward: 'Step Forward',
replay_speed: 'Speed',
replay_exit: 'Exit Replay',
replay_start: 'Start Replay',
```

- [ ] **Step 2: 运行构建**

Run: `npm run build-core`
Expected: 构建成功

- [ ] **Step 3: Commit**

```bash
git add src/i18n/
git commit -m "feat: add bar replay i18n translations"
```

---

## Task 4: 集成到 ChartPro API

**Files:**
- Modify: `src/types.ts`
- Modify: `src/KLineChartPro.tsx`
- Modify: `src/ChartProComponent.tsx`
- Modify: `src/index.ts`

- [ ] **Step 1: 扩展 ChartPro 接口**

在 `src/types.ts` 的 `ChartPro` 接口添加:
```typescript
/** 进入回放模式：从当前数据的指定位置开始回放 */
startReplay(startPosition?: number): void
/** 退出回放模式，恢复实时数据 */
stopReplay(): void
/** 获取回放引擎（用于外部控制播放/暂停/步进） */
getReplayEngine(): import('./replay/ReplayEngine').ReplayEngine | null
```

- [ ] **Step 2: 在 KLineChartPro 中实现**

读取当前 `src/KLineChartPro.tsx`。添加:

1. Import:
```typescript
import { ReplayEngine } from './replay/ReplayEngine'
```

2. 私有成员:
```typescript
private _replayEngine: ReplayEngine | null = null
```

3. 实现方法:
```typescript
startReplay(startPosition?: number): void {
  const chart = this.getChart()
  if (!chart) return

  const dataList = chart.getDataList()
  if (dataList.length === 0) return

  const pos = startPosition ?? Math.floor(dataList.length * 0.5)

  this._replayEngine = new ReplayEngine({
    onDataChange: (data) => {
      chart.applyNewData(data, data.length > 0)
    },
    onBarUpdate: (bar) => {
      chart.updateData(bar)
    },
    onStateChange: () => {
      // 状态变化通过 getReplayEngine().getState() 获取
    }
  })

  this._replayEngine.start(dataList, pos)
}

stopReplay(): void {
  if (this._replayEngine) {
    this._replayEngine.stop()
    this._replayEngine.dispose()
    this._replayEngine = null
  }
}

getReplayEngine(): ReplayEngine | null {
  return this._replayEngine
}
```

4. 在 ChartProComponent 的 `props.ref({...})` 添加 stubs:
```typescript
startReplay: () => {},
stopReplay: () => {},
getReplayEngine: () => null,
```

- [ ] **Step 3: 在 index.ts 导出**

```typescript
export { ReplayEngine } from './replay/ReplayEngine'
export type { ReplayState, ReplaySpeed } from './replay/types'
```

- [ ] **Step 4: 运行构建**

Run: `npm run build-core`
Expected: 构建成功

- [ ] **Step 5: 运行全部测试**

Run: `npx vitest run`
Expected: 全部 PASS

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/KLineChartPro.tsx src/ChartProComponent.tsx src/index.ts
git commit -m "feat: integrate ReplayEngine into ChartPro API"
```

---

## Task 5: 全量验证

- [ ] **Step 1: 运行完整测试**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 2: 运行完整构建**

Run: `npm run build`
Expected: 构建成功

- [ ] **Step 3: Commit (if needed)**

```bash
git add -A
git commit -m "chore: verify bar replay build and test suite"
```
