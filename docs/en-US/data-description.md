# Data Description

## Period
```typescript
interface Period {
  // Time span multiplier, such as 1, 3, 5
  multiplier: number;

  // Time span, such as 'year', 'month'
  timespan: string;

  // Text for display, such as '1H', '5H'
  text: string;
}
```

## Symbol information
```typescript
interface SymbolInfo {
  // Unique identification
  ticker: string;

  // Name
  name?: string

  // Short name
  shortName?: string

  // Exchange
  exchange?: string

  // Market classification
  market?: string

  // Price precision
  pricePrecision?: number

  // Volume precision
  volumePrecision?: number

  // Price currency
  priceCurrency?: string

  // Type
  type?: string

  // logo url
  logo?: string
}
```

## History and state

In 0.8.0 history returns a HistoryResult object, not a bare array. HistorySnapshot shares bars, basis? and metadata?; ChartSnapshot adds symbol and period. Bar timestamps are ascending unique Unix milliseconds; never invent closed-market bars. Basis belongs to this response, not the source name.

HistoryQuery is `{kind:'before',before,countBack}` or `{kind:'range',from,to}`. before excludes its upper bound; countBack targets a bar count, not calendar periods. range reads the complete `[from,to)` interval. Before must return boolean hasMoreBefore; short pages/empty windows do not prove exhaustion. Ranges may omit boundaries; partial ranges are not complete snapshots.

Optional metadata is `{state:'ready'|'empty'|'partial',sourceTimestamp?,delayMs?}`. Undeclared provider observation times/delays stay unknown, never inferred from HTTP or the last bar. ChartDataState.dataStatus describes all confirmed data; lastRead describes the committed read only. Connection defaults to unknown. See [data access](./data-access) and the [API](./api#_0-8-0-data-api).

## Workspace records

WorkspaceDocument stays version 1 with ChartLayoutV3 per cell. The outer `{id,name,updatedAt,revision,document}` record carries management metadata. Scope is the original opaque host context; IDs/revisions are opaque. Market/analysis data and runtime handles are excluded. Asynchronous WorkspaceStore updates/deletes compare expectedRevision; conflicts never overwrite automatically. Explicit import only reads legacy keys and preserves the originals.
