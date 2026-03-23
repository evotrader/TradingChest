<h1 align="center">TradingChest</h1>
<p align="center">TradingView レベルの機能を目指すプロフェッショナルなトレーディングチャートライブラリ。KLineChart ベース。</p>

<div align="center">

[![Version](https://badgen.net/npm/v/trading-chest)](https://www.npmjs.com/package/trading-chest)
[![Typescript](https://badgen.net/badge/types/TypeScript/blue)](dist/index.d.ts)
[![License](https://badgen.net/badge/license/Apache-2.0/green)](LICENSE)

[English](README.md) | [中文](README.zh-CN.md) | **日本語** | [한국어](README.ko.md)

</div>

<p align="center">
  <img src="docs/public/image.png" alt="TradingChest スクリーンショット" width="800" />
</p>

## 特徴

### テクニカル指標（73+）

| カテゴリ | 数 | 例 |
|----------|----|----|
| トレンド | 21 | MA, EMA, BOLL, Ichimoku, SuperTrend, Alligator, KAMA, HMA... |
| ボラティリティ | 9 | Keltner Channels, Donchian Channels, ATR, Bollinger Band Width... |
| 出来高 | 12 | VOL, VWAP, MFI, CMF, Klinger Oscillator, Elder Ray... |
| モメンタム | 26 | MACD, RSI, KDJ, StochRSI, ADX, Aroon, Fisher Transform, PPO... |
| その他 | 2 | Pivot Points, ZigZag |

- カテゴリタブで素早くフィルタリング（トレンド/ボラティリティ/出来高/モメンタム/その他）
- リアルタイム検索フィルタ
- 指標パラメータのカスタマイズ
- 指標の遅延読み込みで高速起動

### 描画ツール（42+）

| カテゴリ | ツール |
|----------|--------|
| ライン | 水平線、垂直線、トレンドライン、レイ、セグメント、矢印、価格ライン、平行線、価格チャネル |
| フィボナッチ | リトレースメント、セグメント、サークル、スパイラル、スピードレジスタンスファン、トレンドエクステンション |
| ウェーブ | 3波、5波、8波、任意波、ABCD、XABCD |
| ジオメトリ | 円、矩形、三角形、平行四辺形 |
| パターン | Andrew's Pitchfork、Schiff Pitchfork、線形回帰、回帰チャネル、Gann Box |
| 計測 | 価格レンジ、時間レンジ、統合計測 |
| アノテーション | テキストラベル、吹き出し、付箋、フリーハンド |
| トレード | ロング/ショートポジション（エントリー/ストップロス/テイクプロフィット表示 + リスクリワード比） |

- 全ツールでホバーツールチップ対応
- テキストツールはインライン編集 + 右クリック編集対応
- **選択した描画にフローティングプロパティツールバー**（TradingView スタイル）：
  - 9×8 カラーパレット（72色）
  - 線幅セレクタ（1–4px ビジュアルプレビュー）
  - 線種セレクタ（実線/破線/点線）
  - ロック/削除クイックボタン

### チャートタイプ（8種）

ローソク足（塗りつぶし）、ローソク足（中空）、陽線中空、陰線中空、OHLC、エリア、**平均足（Heikin Ashi）**、**ベースライン**

### 価格アラート

- 指定価格にアラートラインを追加/削除
- 価格がアラートレベルを超えた時にコールバック
- チャート上にアラートライン表示
- リアルタイム・リプレイ両モードで動作

### 銘柄比較

- 追加銘柄をパーセンテージ変化に正規化してオーバーレイ
- クロスシンボルのタイムスタンプ自動整合

### バーリプレイ

- 過去のデータをバーごとに再生
- 再生/一時停止/ステップ前進/ステップ後退/位置ジャンプ
- 速度調整（0.5×–16×）
- リプレイ中もアラートシステム動作

### トレード可視化

- トレード記録から売買マーカーをチャートに表示
- トレードマーカーのクリック検出とコールバック
- `IndicatorClickDetector` と統合

### 設定パネル

- ローソク足タイプ選択
- 陽線/陰線カラーカスタマイズ（カラーピッカー）
- 価格軸タイプ（リニア/パーセンテージ/対数）
- クロスヘア表示切替（水平/垂直独立制御）
- グリッド線、高値/安値マーカー、ツールチップタイプ
- グループ化された設定（ローソク足/軸/グリッド＆クロスヘア）

### その他

- **キーボードショートカット**：15+ のデフォルトバインディング（Alt+T トレンドライン、Alt+F フィボナッチなど）、完全カスタマイズ可能
- **5種のテーマプリセット**：ダーク、ライト、ミッドナイトブルー、クラシック（TradingView スタイル）、ハイコントラスト
- **データエクスポート**：CSV（表示範囲/全データ）、スクリーンショット（PNG/JPEG）
- **レイアウト永続化**：localStorage でチャートレイアウトの保存/読込/削除
- **i18n**：中国語 (zh-CN)、英語 (en-US)
- **タイムゾーン**：14タイムゾーン対応

## インストール

```bash
npm install trading-chest klinecharts
```

## 使い方

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
      // KLineData[] を返す — データ取得ロジックを実装
      return []
    },
    subscribe: () => {},
    unsubscribe: () => {},
  },
  theme: 'dark',
  locale: 'en-US',
})

// 使用後は必ず破棄
// chart.dispose()
```

## API

### コンストラクタオプション

```typescript
interface ChartProOptions {
  container: string | HTMLElement
  symbol: SymbolInfo
  period: Period
  datafeed: Datafeed
  styles?: DeepPartial<Styles>
  watermark?: string | Node
  theme?: string              // デフォルト: 'light'
  locale?: string             // デフォルト: 'zh-CN'
  drawingBarVisible?: boolean // デフォルト: true
  periods?: Period[]
  timezone?: string           // デフォルト: 'Asia/Shanghai'
  mainIndicators?: string[]   // デフォルト: ['MA']
  subIndicators?: string[]    // デフォルト: ['VOL']
  onIndicatorClick?: (event: IndicatorClickEvent) => void
  onAlertTrigger?: (event: AlertEvent) => void
}
```

### インスタンスメソッド

```typescript
// テーマ
chart.setTheme('dark' | 'light')
chart.getTheme(): string

// スタイル
chart.setStyles(styles: DeepPartial<Styles>)
chart.getStyles(): Styles

// ロケール
chart.setLocale('zh-CN' | 'en-US')
chart.getLocale(): string

// タイムゾーン
chart.setTimezone('Asia/Shanghai')
chart.getTimezone(): string

// 銘柄 / 期間
chart.setSymbol(symbol: SymbolInfo)
chart.getSymbol(): SymbolInfo
chart.setPeriod(period: Period)
chart.getPeriod(): Period

// 内部チャートインスタンス（カスタムオーバーレイ操作用）
chart.getChart(): Chart | null

// データエクスポート
chart.exportCSV(filename?: string)
chart.exportAllCSV(filename?: string)
chart.exportScreenshot({ format?, backgroundColor?, filename? })

// キーボードショートカット
chart.getShortcutManager(): KeyboardShortcutManager

// アラート
chart.addAlert({ id, price, condition, color? })
chart.removeAlert(id: string)
chart.getAlerts(): AlertConfig[]
chart.feedPrice(price: number)     // リアルタイム価格を渡してアラート検出

// 銘柄比較
chart.addComparison(symbol: SymbolInfo): Promise<void>
chart.removeComparison(ticker: string)

// バーリプレイ
chart.startReplay(startPosition?: number)
chart.stopReplay()
chart.getReplayEngine(): ReplayEngine | null

// トレード可視化
chart.createTradeVisualization(trades: TradeRecord[], paneOptions?)
chart.getClickDetector(): IndicatorClickDetector

// ライフサイクル
chart.dispose()
```

### エクスポート

```typescript
import {
  KLineChartPro,
  DefaultDatafeed,
  loadLocales,

  // テーマ
  themePresets, getThemeByName,

  // データエクスポート
  exportToCSV, exportAllToCSV, exportScreenshot,

  // レイアウト永続化
  saveLayout, loadLayout, deleteLayout, listLayouts,

  // キーボードショートカット
  KeyboardShortcutManager,

  // 指標
  indicatorCategories, indicatorRegistry,

  // アラート
  AlertManager,

  // 比較
  normalizeToPercent,

  // リプレイ
  ReplayEngine,
} from 'trading-chest'
```

## テクノロジースタック

- **レンダリングエンジン**: [KLineChart](https://github.com/klinecharts/KLineChart) 9.x（Canvas、高パフォーマンス）
- **UI フレームワーク**: [Solid.js](https://www.solidjs.com/)（リアクティブ、軽量）
- **ビルドツール**: [Vite](https://vitejs.dev/)（ESM + UMD デュアル出力）
- **言語**: TypeScript（プロジェクトコードで `@ts-expect-error` ゼロ）
- **テスト**: Vitest（211テスト、18テストファイル）

## ビルド

```bash
npm install
npm run build       # フルビルド（JS + CSS + .d.ts）
npm run test        # テスト実行
```

ビルド成果物：
- `dist/trading-chest.js` — ES Module（~291KB、gzip ~81KB）
- `dist/trading-chest.umd.js` — UMD
- `dist/trading-chest.css` — スタイル（~42KB）
- `dist/index.d.ts` — TypeScript 宣言

## ベース

[KLineChart Pro](https://github.com/klinecharts/pro) からフォークし、大幅に拡張：

- 45+ カスタムテクニカル指標 + 遅延読み込みレジストリ
- 13+ 描画ツール（計測、アノテーション、トレードポジション可視化）
- 選択した描画にフローティングプロパティツールバー（カラーパレット、線幅/線種、ロック、削除）
- キーボードショートカットシステム、テーマプリセット、データエクスポート、レイアウト永続化
- 価格アラートシステム（リアルタイム + リプレイ両モード）
- 銘柄比較オーバーレイ（正規化パーセンテージ）
- バーリプレイエンジン（ステップ/再生/速度調整）
- トレード可視化 + クリック検出
- 指標パネルのカテゴリタブ + 検索
- 設定パネルのグループ化 + カラーピッカー
- `dispose()` による完全なリソース解放、メモリリークゼロ

## ライセンス

Apache License 2.0
