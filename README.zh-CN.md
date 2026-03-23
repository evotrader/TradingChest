<h1 align="center">TradingChest</h1>
<p align="center">专业级交易图表库，对标 TradingView 图表能力。基于 KLineChart 构建。</p>

<div align="center">

[![Version](https://badgen.net/npm/v/trading-chest)](https://www.npmjs.com/package/trading-chest)
[![Typescript](https://badgen.net/badge/types/TypeScript/blue)](dist/index.d.ts)
[![License](https://badgen.net/badge/license/Apache-2.0/green)](LICENSE)

[English](README.md) | **中文** | [日本語](README.ja.md) | [한국어](README.ko.md)

</div>

<p align="center">
  <img src="docs/public/image.png" alt="TradingChest 截图" width="800" />
</p>

## 特性

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
- 指标懒加载注册，加速启动

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
  - 线宽选择器（1–4px 可视化预览）
  - 线型选择器（实线/虚线/点线）
  - 锁定/删除快捷按钮

### 图表类型（8 种）

蜡烛实心、蜡烛空心、涨空心、跌空心、OHLC、面积图、**Heikin Ashi**、**Baseline**

### 价格报警

- 在指定价位添加/移除报警线
- 价格穿越报警线时触发回调
- 图表上显示报警线 overlay
- 实时和回放模式均可用

### 品种对比

- 叠加额外品种，归一化为百分比变化
- 自动跨品种时间戳对齐

### K 线回放

- 逐根回放历史数据
- 播放/暂停/单步前进/单步后退/跳转
- 可调速度（0.5×–16×）
- 回放期间报警系统正常工作

### 交易可视化

- 在图表上叠加买卖标记（来自交易记录）
- 点击交易标记触发回调
- 集成 `IndicatorClickDetector`

### 设置面板

- 蜡烛图类型选择
- 涨/跌颜色自定义（颜色选择器）
- 价格轴类型（线性/百分比/对数）
- 十字光标显隐（水平/垂直独立控制）
- 网格线、最高/最低价标记、提示框类型
- 设置项分组显示（蜡烛图/坐标轴/网格与光标）

### 其他功能

- **键盘快捷键**：15+ 默认绑定（Alt+T 趋势线、Alt+F 斐波那契等），可完全自定义
- **5 种预设主题**：暗色、亮色、午夜蓝、经典（TradingView 风格）、高对比
- **数据导出**：CSV（可见区间/全量）、截图（PNG/JPEG）
- **布局持久化**：localStorage 保存/加载/删除图表布局
- **国际化**：中文 (zh-CN)、英文 (en-US)
- **时区**：14 个时区支持

## 安装

```bash
npm install trading-chest klinecharts
```

## 使用

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

// 使用完毕时销毁
// chart.dispose()
```

## API

### 构造选项

```typescript
interface ChartProOptions {
  container: string | HTMLElement
  symbol: SymbolInfo
  period: Period
  datafeed: Datafeed
  styles?: DeepPartial<Styles>
  watermark?: string | Node
  theme?: string              // 默认: 'light'
  locale?: string             // 默认: 'zh-CN'
  drawingBarVisible?: boolean // 默认: true
  periods?: Period[]
  timezone?: string           // 默认: 'Asia/Shanghai'
  mainIndicators?: string[]   // 默认: ['MA']
  subIndicators?: string[]    // 默认: ['VOL']
  onIndicatorClick?: (event: IndicatorClickEvent) => void
  onAlertTrigger?: (event: AlertEvent) => void
}
```

### 实例方法

```typescript
// 主题
chart.setTheme('dark' | 'light')
chart.getTheme(): string

// 样式
chart.setStyles(styles: DeepPartial<Styles>)
chart.getStyles(): Styles

// 语言
chart.setLocale('zh-CN' | 'en-US')
chart.getLocale(): string

// 时区
chart.setTimezone('Asia/Shanghai')
chart.getTimezone(): string

// 标的 / 周期
chart.setSymbol(symbol: SymbolInfo)
chart.getSymbol(): SymbolInfo
chart.setPeriod(period: Period)
chart.getPeriod(): Period

// 内部图表实例（用于自定义 overlay 操作）
chart.getChart(): Chart | null

// 数据导出
chart.exportCSV(filename?: string)
chart.exportAllCSV(filename?: string)
chart.exportScreenshot({ format?, backgroundColor?, filename? })

// 快捷键管理
chart.getShortcutManager(): KeyboardShortcutManager

// 报警
chart.addAlert({ id, price, condition, color? })
chart.removeAlert(id: string)
chart.getAlerts(): AlertConfig[]
chart.feedPrice(price: number)     // 传入实时价格触发报警检测

// 品种对比
chart.addComparison(symbol: SymbolInfo): Promise<void>
chart.removeComparison(ticker: string)

// K 线回放
chart.startReplay(startPosition?: number)
chart.stopReplay()
chart.getReplayEngine(): ReplayEngine | null

// 交易可视化
chart.createTradeVisualization(trades: TradeRecord[], paneOptions?)
chart.getClickDetector(): IndicatorClickDetector

// 生命周期
chart.dispose()
```

### 导出模块

```typescript
import {
  KLineChartPro,
  DefaultDatafeed,
  loadLocales,

  // 主题
  themePresets, getThemeByName,

  // 数据导出
  exportToCSV, exportAllToCSV, exportScreenshot,

  // 布局持久化
  saveLayout, loadLayout, deleteLayout, listLayouts,

  // 快捷键
  KeyboardShortcutManager,

  // 指标
  indicatorCategories, indicatorRegistry,

  // 报警
  AlertManager,

  // 对比
  normalizeToPercent,

  // 回放
  ReplayEngine,
} from 'trading-chest'
```

## 技术栈

- **渲染引擎**: [KLineChart](https://github.com/klinecharts/KLineChart) 9.x（Canvas，高性能）
- **UI 框架**: [Solid.js](https://www.solidjs.com/)（响应式，轻量）
- **构建工具**: [Vite](https://vitejs.dev/)（ESM + UMD 双格式输出）
- **语言**: TypeScript（项目代码零 `@ts-expect-error`）
- **测试**: Vitest（211 个测试，18 个测试文件）

## 构建

```bash
npm install
npm run build       # 完整构建（JS + CSS + .d.ts）
npm run test        # 运行测试
```

构建产物：
- `dist/trading-chest.js` — ES Module（~291KB，gzip ~81KB）
- `dist/trading-chest.umd.js` — UMD
- `dist/trading-chest.css` — 样式（~42KB）
- `dist/index.d.ts` — TypeScript 声明

## 源自

Fork 自 [KLineChart Pro](https://github.com/klinecharts/pro)，在此基础上大幅扩展：

- 45+ 自定义技术指标 + 懒加载注册表
- 13+ 绘图工具（测量、标注、交易持仓可视化）
- 绘图选中后浮动属性工具栏（调色板、线宽/线型、锁定、删除）
- 键盘快捷键系统、主题预设、数据导出、布局持久化
- 价格报警系统（实时 + 回放双模式）
- 品种对比叠加（归一化百分比）
- K 线回放引擎（单步/播放/调速）
- 交易可视化 + 点击检测
- 指标面板分类搜索
- 设置面板分组 + 颜色选择器
- `dispose()` 完整资源释放，零内存泄漏

## 许可证

Apache License 2.0
