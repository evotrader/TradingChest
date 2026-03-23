<h1 align="center">TradingChest</h1>
<p align="center">TradingView 수준의 기능을 목표로 하는 프로페셔널 트레이딩 차트 라이브러리. KLineChart 기반.</p>

<div align="center">

[![Version](https://badgen.net/npm/v/trading-chest)](https://www.npmjs.com/package/trading-chest)
[![Typescript](https://badgen.net/badge/types/TypeScript/blue)](dist/index.d.ts)
[![License](https://badgen.net/badge/license/Apache-2.0/green)](LICENSE)

[English](README.md) | [中文](README.zh-CN.md) | [日本語](README.ja.md) | **한국어**

</div>

<p align="center">
  <img src="docs/public/image.png" alt="TradingChest 스크린샷" width="800" />
</p>

## 기능

### 기술 지표 (73+)

| 카테고리 | 수 | 예시 |
|----------|----|----|
| 추세 | 21 | MA, EMA, BOLL, Ichimoku, SuperTrend, Alligator, KAMA, HMA... |
| 변동성 | 9 | Keltner Channels, Donchian Channels, ATR, Bollinger Band Width... |
| 거래량 | 12 | VOL, VWAP, MFI, CMF, Klinger Oscillator, Elder Ray... |
| 모멘텀 | 26 | MACD, RSI, KDJ, StochRSI, ADX, Aroon, Fisher Transform, PPO... |
| 기타 | 2 | Pivot Points, ZigZag |

- 카테고리 탭으로 빠른 필터링 (추세/변동성/거래량/모멘텀/기타)
- 실시간 검색 필터
- 지표 파라미터 커스터마이징
- 지표 지연 로딩으로 빠른 시작

### 그리기 도구 (42+)

| 카테고리 | 도구 |
|----------|------|
| 선 | 수평선, 수직선, 추세선, 레이, 세그먼트, 화살표, 가격선, 평행선, 가격 채널 |
| 피보나치 | 되돌림, 세그먼트, 원, 나선, 속도 저항 팬, 추세 확장 |
| 파동 | 3파, 5파, 8파, 임의파, ABCD, XABCD |
| 도형 | 원, 사각형, 삼각형, 평행사변형 |
| 패턴 | Andrew's Pitchfork, Schiff Pitchfork, 선형 회귀, 회귀 채널, Gann Box |
| 측정 | 가격 범위, 시간 범위, 종합 측정 |
| 주석 | 텍스트 라벨, 주석 버블, 메모, 자유 그리기 |
| 트레이딩 | 롱/숏 포지션 (진입/손절/익절 시각화 + 위험보상비) |

- 모든 도구에 호버 툴팁 지원
- 텍스트 도구 인라인 편집 + 우클릭 편집 지원
- **선택한 그리기에 플로팅 속성 도구 모음** (TradingView 스타일):
  - 9×8 컬러 팔레트 (72색)
  - 선 두께 선택기 (1–4px 시각적 미리보기)
  - 선 스타일 선택기 (실선/점선/도트)
  - 잠금/삭제 빠른 버튼

### 차트 유형 (8종)

캔들 채움, 캔들 빈, 양봉 빈, 음봉 빈, OHLC, 영역, **Heikin Ashi**, **Baseline**

### 가격 알림

- 지정 가격에 알림 라인 추가/제거
- 가격이 알림 레벨을 넘으면 콜백 실행
- 차트에 알림 라인 오버레이 표시
- 실시간 및 리플레이 모드 모두 지원

### 종목 비교

- 추가 종목을 퍼센트 변화로 정규화하여 오버레이
- 크로스 종목 타임스탬프 자동 정렬

### 바 리플레이

- 과거 데이터를 바 단위로 재생
- 재생/일시정지/한 칸 앞으로/한 칸 뒤로/위치 이동
- 속도 조절 (0.5×–16×)
- 리플레이 중 알림 시스템 작동

### 트레이드 시각화

- 트레이드 기록에서 매수/매도 마커를 차트에 표시
- 트레이드 마커 클릭 감지 및 콜백
- `IndicatorClickDetector`와 통합

### 설정 패널

- 캔들 유형 선택
- 양봉/음봉 색상 커스터마이징 (컬러 피커)
- 가격축 유형 (선형/퍼센트/로그)
- 크로스헤어 표시 전환 (수평/수직 독립 제어)
- 그리드 라인, 최고가/최저가 마커, 툴팁 유형
- 그룹화된 설정 (캔들/축/그리드&크로스헤어)

### 기타

- **키보드 단축키**: 15+ 기본 바인딩 (Alt+T 추세선, Alt+F 피보나치 등), 완전한 커스터마이징 가능
- **5가지 테마 프리셋**: 다크, 라이트, 미드나잇 블루, 클래식 (TradingView 스타일), 하이 콘트라스트
- **데이터 내보내기**: CSV (표시 범위/전체), 스크린샷 (PNG/JPEG)
- **레이아웃 저장**: localStorage로 차트 레이아웃 저장/불러오기/삭제
- **국제화**: 중국어 (zh-CN), 영어 (en-US)
- **타임존**: 14개 타임존 지원

## 설치

```bash
npm install trading-chest klinecharts
```

## 사용법

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
      // KLineData[]를 반환 — 데이터 가져오기 로직 구현
      return []
    },
    subscribe: () => {},
    unsubscribe: () => {},
  },
  theme: 'dark',
  locale: 'en-US',
})

// 사용 후 반드시 해제
// chart.dispose()
```

## API

### 생성자 옵션

```typescript
interface ChartProOptions {
  container: string | HTMLElement
  symbol: SymbolInfo
  period: Period
  datafeed: Datafeed
  styles?: DeepPartial<Styles>
  watermark?: string | Node
  theme?: string              // 기본값: 'light'
  locale?: string             // 기본값: 'zh-CN'
  drawingBarVisible?: boolean // 기본값: true
  periods?: Period[]
  timezone?: string           // 기본값: 'Asia/Shanghai'
  mainIndicators?: string[]   // 기본값: ['MA']
  subIndicators?: string[]    // 기본값: ['VOL']
  onIndicatorClick?: (event: IndicatorClickEvent) => void
  onAlertTrigger?: (event: AlertEvent) => void
}
```

### 인스턴스 메서드

```typescript
// 테마
chart.setTheme('dark' | 'light')
chart.getTheme(): string

// 스타일
chart.setStyles(styles: DeepPartial<Styles>)
chart.getStyles(): Styles

// 로케일
chart.setLocale('zh-CN' | 'en-US')
chart.getLocale(): string

// 타임존
chart.setTimezone('Asia/Shanghai')
chart.getTimezone(): string

// 종목 / 기간
chart.setSymbol(symbol: SymbolInfo)
chart.getSymbol(): SymbolInfo
chart.setPeriod(period: Period)
chart.getPeriod(): Period

// 내부 차트 인스턴스 (커스텀 오버레이 조작용)
chart.getChart(): Chart | null

// 데이터 내보내기
chart.exportCSV(filename?: string)
chart.exportAllCSV(filename?: string)
chart.exportScreenshot({ format?, backgroundColor?, filename? })

// 키보드 단축키
chart.getShortcutManager(): KeyboardShortcutManager

// 알림
chart.addAlert({ id, price, condition, color? })
chart.removeAlert(id: string)
chart.getAlerts(): AlertConfig[]
chart.feedPrice(price: number)     // 실시간 가격을 전달하여 알림 감지

// 종목 비교
chart.addComparison(symbol: SymbolInfo): Promise<void>
chart.removeComparison(ticker: string)

// 바 리플레이
chart.startReplay(startPosition?: number)
chart.stopReplay()
chart.getReplayEngine(): ReplayEngine | null

// 트레이드 시각화
chart.createTradeVisualization(trades: TradeRecord[], paneOptions?)
chart.getClickDetector(): IndicatorClickDetector

// 라이프사이클
chart.dispose()
```

### 내보내기

```typescript
import {
  KLineChartPro,
  DefaultDatafeed,
  loadLocales,

  // 테마
  themePresets, getThemeByName,

  // 데이터 내보내기
  exportToCSV, exportAllToCSV, exportScreenshot,

  // 레이아웃 저장
  saveLayout, loadLayout, deleteLayout, listLayouts,

  // 키보드 단축키
  KeyboardShortcutManager,

  // 지표
  indicatorCategories, indicatorRegistry,

  // 알림
  AlertManager,

  // 비교
  normalizeToPercent,

  // 리플레이
  ReplayEngine,
} from 'trading-chest'
```

## 기술 스택

- **렌더링 엔진**: [KLineChart](https://github.com/klinecharts/KLineChart) 9.x (Canvas, 고성능)
- **UI 프레임워크**: [Solid.js](https://www.solidjs.com/) (리액티브, 경량)
- **빌드 도구**: [Vite](https://vitejs.dev/) (ESM + UMD 이중 출력)
- **언어**: TypeScript (프로젝트 코드 `@ts-expect-error` 제로)
- **테스트**: Vitest (211개 테스트, 18개 테스트 파일)

## 빌드

```bash
npm install
npm run build       # 전체 빌드 (JS + CSS + .d.ts)
npm run test        # 테스트 실행
```

빌드 산출물:
- `dist/trading-chest.js` — ES Module (~291KB, gzip ~81KB)
- `dist/trading-chest.umd.js` — UMD
- `dist/trading-chest.css` — 스타일 (~42KB)
- `dist/index.d.ts` — TypeScript 선언

## 기반

[KLineChart Pro](https://github.com/klinecharts/pro)에서 포크하여 대폭 확장:

- 45+ 커스텀 기술 지표 + 지연 로딩 레지스트리
- 13+ 그리기 도구 (측정, 주석, 트레이드 포지션 시각화)
- 선택한 그리기에 플로팅 속성 도구 모음 (컬러 팔레트, 선 두께/스타일, 잠금, 삭제)
- 키보드 단축키 시스템, 테마 프리셋, 데이터 내보내기, 레이아웃 저장
- 가격 알림 시스템 (실시간 + 리플레이 모두 지원)
- 종목 비교 오버레이 (정규화 퍼센트)
- 바 리플레이 엔진 (스텝/재생/속도 조절)
- 트레이드 시각화 + 클릭 감지
- 지표 패널 카테고리 탭 + 검색
- 설정 패널 그룹화 + 컬러 피커
- `dispose()`로 완전한 리소스 해제, 메모리 누수 제로

## 라이선스

Apache License 2.0
