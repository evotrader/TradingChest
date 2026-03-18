<h1 align="center">TradingChest</h1>
<p align="center">专业级交易图表库，对标 TradingView 图表能力。基于 KLineChart 构建。</p>
<p align="center">Professional trading chart library targeting TradingView-level capabilities. Built on KLineChart.</p>

<div align="center">

[![Version](https://badgen.net/npm/v/trading-chest)](https://www.npmjs.com/package/trading-chest)
[![Typescript](https://badgen.net/badge/types/TypeScript/blue)](dist/index.d.ts)
[![LICENSE](https://badgen.net/badge/license/Apache-2.0/green)](LICENSE)

</div>

## 特性 / Features

### 技术指标（73+）
| 分类 | 数量 | 示例 |
|------|------|------|
| 趋势 | 21 | MA, EMA, BOLL, Ichimoku, SuperTrend, Alligator, KAMA, HMA... |
| 波动率 | 9 | Keltner Channels, Donchian Channels, ATR, Bollinger Band Width... |
| 成交量 | 12 | VOL, VWAP, MFI, CMF, Klinger Oscillator, Elder Ray... |
| 动量 | 26 | MACD, RSI, KDJ, StochRSI, ADX, Aroon, Fisher Transform, PPO... |
| 其他 | 2 | Pivot Points, ZigZag |

- 分类 Tab 快速筛选（趋势/波动率/成交量/动量/其他）
- 实时搜索过滤
- 指标参数可自定义

### 绘图工具（42+）
| 分类 | 工具 |
|------|------|
| 线条 | 水平线、垂直线、趋势线、射线、线段、箭头、价格线、平行线、价格通道 |
| 斐波那契 | 回调线、线段、圆环、螺旋、速度阻力扇、趋势扩展 |
| 波浪 | 三浪、五浪、八浪、任意浪、ABCD、XABCD |
| 几何 | 圆、矩形、三角形、平行四边形 |
| 形态 | Andrew's Pitchfork、Schiff Pitchfork、线性回归、回归通道、Gann Box |
| 测量 | 价格区间、时间区间、综合测量 |
| 标注 | 文字标注、标注气泡、便签、自由画笔 |
| 交易 | 做多持仓、做空持仓（入场/止损/止盈可视化 + 盈亏比） |

- 所有工具支持 hover tooltip 提示
- 文字类工具支持输入文字 + 右键编辑
- **选中绘图后弹出浮动属性工具栏**（对标 TradingView）：
  - TradingView 风格 9×8 调色板（72 色）
  - 线宽选择器（1-4px 可视化预览）
  - 线型选择器（实线/虚线/点线）
  - 锁定/删除快捷按钮

### 图表类型（8 种）
蜡烛实心、蜡烛空心、涨空心、跌空心、OHLC、面积图、**Heikin Ashi**、**Baseline**

### 设置面板
- 蜡烛图类型选择
- **涨/跌颜色自定义**（颜色选择器）
- 价格轴类型（线性/百分比/对数）
- 十字光标显隐（水平/垂直独立控制）
- 网格线、最高/最低价标记、提示框类型
- 设置项分组显示（蜡烛图/坐标轴/网格与光标）

### 其他功能
- **键盘快捷键**：19 默认绑定（Alt+T 趋势线、Alt+F 斐波那契、Ctrl+Z 撤销等），可自定义
- **5 种预设主题**：暗色、亮色、午夜蓝、经典（TradingView 风格）、高对比
- **数据导出**：CSV（可见区间/全量）、截图（PNG/JPEG）
- **布局持久化**：localStorage 保存/加载/删除图表布局
- **撤销/重做**：Command Pattern 操作历史管理
- **国际化**：中文 (zh-CN)、英文 (en-US)
- **时区**：14 个时区支持

## 安装 / Install

```bash
npm install trading-chest
```

**Peer Dependency:**
```bash
npm install klinecharts
```

## 使用 / Usage

```typescript
import { KLineChartPro } from 'trading-chest'
import 'trading-chest/dist/trading-chest.css'

const chart = new KLineChartPro({
  container: document.getElementById('chart'),
  symbol: {
    ticker: 'BTC-USDT',
    name: 'Bitcoin',
    exchange: 'Binance',
    pricePrecision: 2,
    volumePrecision: 4,
  },
  period: { multiplier: 1, timespan: 'day', text: '1D' },
  datafeed: {
    searchSymbols: async () => [],
    getHistoryKLineData: async (symbol, period, from, to) => {
      // 返回 KLineData[] — 实现你的数据获取逻辑
      return []
    },
    subscribe: () => {},
    unsubscribe: () => {},
  },
  theme: 'dark',
  locale: 'zh-CN',
})
```

## API

### KLineChartPro

```typescript
// 主题
chart.setTheme('dark' | 'light')
chart.getTheme(): string

// 样式
chart.setStyles(styles: DeepPartial<Styles>)
chart.getStyles(): Styles

// 语言
chart.setLocale('zh-CN' | 'en-US')

// 时区
chart.setTimezone('Asia/Shanghai')

// 标的/周期
chart.setSymbol(symbol: SymbolInfo)
chart.setPeriod(period: Period)

// 内部图表实例（用于自定义 overlay 操作）
chart.getChart(): Chart | null

// 数据导出
chart.exportCSV(filename?: string)
chart.exportAllCSV(filename?: string)
chart.exportScreenshot({ format?, backgroundColor?, filename? })

// 快捷键管理
chart.getShortcutManager(): KeyboardShortcutManager
```

### 导出模块

```typescript
import {
  // 主类
  KLineChartPro,
  DefaultDatafeed,
  loadLocales,

  // 主题
  themePresets,
  getThemeByName,

  // 数据导出
  exportToCSV,
  exportAllToCSV,
  exportScreenshot,

  // 布局持久化
  saveLayout,
  loadLayout,
  deleteLayout,
  listLayouts,

  // 快捷键
  KeyboardShortcutManager,

  // 指标分类
  indicatorCategories,
} from 'trading-chest'
```

## 技术栈 / Tech Stack

- **渲染引擎**: [KLineChart](https://github.com/klinecharts/KLineChart) 9.x (Canvas, 高性能)
- **UI 框架**: [Solid.js](https://www.solidjs.com/) (响应式, 轻量)
- **构建工具**: [Vite](https://vitejs.dev/) (ESM + UMD 双格式)
- **语言**: TypeScript

## 构建 / Build

```bash
# 安装依赖
npm install

# 开发构建（仅 JS + CSS）
npm run build-core

# 完整构建（含类型声明）
npm run build
```

构建产物:
- `dist/trading-chest.js` — ES Module (~325KB)
- `dist/trading-chest.umd.js` — UMD (~249KB)
- `dist/trading-chest.css` — 样式 (~42KB)
- `dist/index.d.ts` — TypeScript 声明

## 源自 / Based On

Fork 自 [KLineChart Pro](https://github.com/klinecharts/pro)，在此基础上大幅扩展：
- 新增 45+ 自定义技术指标
- 新增 13+ 绘图工具（测量、标注、交易持仓可视化）
- 新增绘图选中后浮动属性工具栏（调色板、线宽、线型、锁定、删除）
- 新增键盘快捷键系统、主题预设、数据导出、布局持久化
- 指标面板分类搜索、设置面板分组 + 颜色选择器
- 暴露 `getChart()` API 用于自定义 overlay 操作

## License

Apache License 2.0
