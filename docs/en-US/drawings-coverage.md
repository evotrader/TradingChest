# Drawing coverage and differences

The catalog contains 51 existing ordinary tools, two volume drawings and three curves, for 56 total. Every tool uses the shared command, confirmed history, editor and persistence paths. The all-tool browser runner creates, cancels edits, confirms edits, undoes/redoes, deletes and restores each tool; numerical tests cover Fibonacci, channels/forks, regression and positions separately. This catalog is not a claim of full TradingView parity.

| Tool ID | Label | Points |
| --- | --- | --- |
| horizontalStraightLine | Horizontal line | 1 |
| horizontalRayLine | Horizontal ray | 2 |
| horizontalSegment | Horizontal segment | 2 |
| verticalStraightLine | Vertical line | 1 |
| verticalRayLine | Vertical ray | 2 |
| verticalSegment | Vertical segment | 2 |
| straightLine | Extended line | 2 |
| rayLine | Ray | 2 |
| segment | Trend line | 2 |
| arrow | Arrow | 2 |
| priceLine | Price line | 1 |
| crossLine | Cross line | 1 |
| trendAngle | Trend angle | 2 |
| priceChannelLine | Price channel | 3 |
| parallelStraightLine | Parallel lines | 3 |
| pitchfork | Pitchfork | 3 |
| schiffPitchfork | Schiff pitchfork | 3 |
| regressionTrend | Regression trend | 2 |
| regressionChannel | Regression channel | 2 |
| circle | Circle | 2 |
| rect | Rectangle | 2 |
| parallelogram | Parallelogram | 3 |
| triangle | Triangle | 3 |
| ellipse | Ellipse | 2 |
| rotatedRect | Rotated rectangle | 3 |
| curve | Curve | 3 |
| doubleCurve | Double curve | 4 |
| arc | Arc | 3 |
| fibonacciLine | Fibonacci retracement | 2 |
| fibonacciSegment | Fibonacci segment | 2 |
| fibonacciCircle | Fibonacci circles | 2 |
| fibonacciSpiral | Fibonacci spiral | 2 |
| fibonacciSpeedResistanceFan | Fibonacci speed resistance fan | 2 |
| fibonacciExtension | Fibonacci extension | 3 |
| gannBox | Gann box | 2 |
| xabcd | XABCD pattern | 5 |
| abcd | ABCD pattern | 4 |
| threeWaves | Three waves | 4 |
| fiveWaves | Five waves | 6 |
| eightWaves | Eight waves | 9 |
| anyWaves | Any waves | variable ≥2 |
| priceRange | Price range | 2 |
| dateRange | Date range | 2 |
| dateAndPriceRange | Date and price range | 2 |
| textAnnotation | Text | 1 |
| callout | Callout | 2 |
| note | Note | 1 |
| brush | Brush | variable ≥2 |
| highlighter | Highlighter | variable ≥2 |
| polyline | Polyline | variable ≥2 |
| priceLabel | Price label | 1 |
| anchoredVwap | Anchored VWAP | 1 |
| fixedRangeVolumeProfile | Fixed range volume profile | 2 |
| anchoredText | Anchored text | 1 |
| longPosition | Long position | 3 |
| shortPosition | Short position | 3 |

## Interaction coverage

| Task | Behavior | Verification entry |
| --- | --- | --- |
| U01 | Discovery, search, favorites | drawing-workbench / drawing-tools |
| U02 | Steps, continuous, finish/cancel | drawing-input / drawing-tools |
| U03 | Selection, box, hidden protection | drawing-input / drawing-input-audit |
| U04 | Handles, move, nudge, one confirmation | drawing-input / drawing-input-audit |
| U05 | Coordinates, axes, styles, confirm/cancel | drawing-tools / drawing-reopen |
| U06 | Multiline, IME, alignment/background | drawing-input / drawing-workbench |
| U07 | Object tree, search, locate, hide/lock | drawing-workbench |
| U08 | Groups, names, order | drawing-workbench / workbench-core |
| U09 | Copy/paste, Alt-clone | drawing-input / workbench-core |
| U10 | Templates/defaults/preferences reload | drawing-workbench / integration drawing-workbench |
| U11 | Interval visibility | workbench-core / drawing-workbench |
| U12 | Sharing, source removal, persistence | drawing-sharing / drawing-sharing-cleanup / drawing-reopen |
| U13 | Rejected/partial/uncertain/slow writes | history / session / drawing backend stage |
| U14 | 320px, 1/2/4 charts, DPR, bounds | drawing-touch / drawing-sharing / drawing-performance |
| U15 | Keyboard, focus, touch menu | drawing-input-audit / drawing-touch |
| U16 | Seven attached-text tools, metadata, template/body boundary | drawing-expressiveness |
| U17 | Complete overlap candidates, virtual rows, keyboard, selection without writes | drawing-expressiveness |
| U18 | Real-bar/price/tick translation and confirmation boundaries | numericMove / drawing-expressiveness |
| U19 | Both Fib tools: 64 levels, formulas, text, draft confirmation/cancellation | drawing-workflow / performance-drawing-workflow |
| U20 | Content-free presets, pre-draw templates, preference migration, third-party levels | drawing-workflow / integration drawing-workbench |
| U21 | Favorites, recent tools, continuous drawing, 320px menus and focus | drawing-workflow |
| U22 | Snap sources, sensitivity, actual axes and async calculation generations | drawing-workflow |

## Deliberate differences

TradingChest shares only local main-pane market anchors with confirmed price identity. Host annotations retain their original backend authority. Position drawings do not compute account size, quantity or leverage. Finer-timeframe/trade-level volume profiles, additional Gann/Fib/wave tools, curve extension, images/stickers, alerts for more tools, background notifications and order integration remain later candidates. No pixel-identical rendering or matching account calculations is promised.

Reference: [TradingView drawings](https://www.tradingview.com/charting-library-docs/latest/ui_elements/drawings/), [tool families](https://www.tradingview.com/charting-library-docs/latest/ui_elements/drawings/Drawings-List/), [position tool](https://www.tradingview.com/support/solutions/43000517002-long-position-drawing-tool/).

The installed-package `tests/integration/drawing-comparison.mjs` performs the same task: two support lines, rectangle, text, Fib, multi-select styling, grouping, current-interval filtering, sharing and reopening. If the official demo cannot be reached, the comparison is explicitly documentation-only; local acceptance artifacts retain actual results and screenshots.

## 0.11 equivalent tasks

This comparison reviews official documentation and executes local TradingChest tasks. It does not claim live TradingView testing or measured speed improvements. [AVWAP](https://www.tradingview.com/support/solutions/43000669764-anchored-vwap-drawing-tool/) documents choosing a start point; TradingChest adds time editing and current-period OHLCV summaries. [FRVP](https://www.tradingview.com/support/solutions/43000480324-fixed-range-volume-profile-indicator/) documents its resolution and row rules; TradingChest uses its own explicit uniform bar-range algorithm, with rows, POC and value area, without finer-timeframe requests or numerical equivalence claims. [Drawings](https://www.tradingview.com/charting-library-docs/latest/ui_elements/drawings/) provides drawing-management reference; local tasks cover groups, search, virtual rows, confirmed reorder and existing v4/v2 saving.

## 0.12 equivalent tasks

The anonymous TradingView chart was reachable on 2026-10-21, but attempting a horizontal drawing required joining/signing in. Its drawing task was not completed. The comparison therefore uses official documentation and local tasks, without TradingView step counts, timing or numerical parity claims.

| Task | Official reference | TradingChest scope |
| --- | --- | --- |
| Multiselect, template, undo/reopen | [Same-type batch templates](https://www.tradingview.com/support/solutions/43000677801-how-to-apply-a-template-to-several-tools-of-the-same-type-at-once/) | Mixed values, capability intersection, parameter/common-style templates, confirmed history and native IDB |
| AVWAP bands | [Bands and multiplier](https://www.tradingview.com/blog/en/vwap-improvements-across-the-board-28974/) | Three groups using the library's explicit formula; no numerical equivalence claim |
| FRVP display | [Inputs and Extend Right](https://www.tradingview.com/support/solutions/43000480324-fixed-range-volume-profile-indicator/) | Placement, width and level styles. Library level extension does not expand statistics; official Extend Right includes subsequent bars |
| Curve controls | [Curve/Double curve](https://www.tradingview.com/support/solutions/43000791740-curve-and-double-curve-drawing-tools/) | Quadratic/cubic Bezier and three-point screen arc; 0.13 adds endpoint markers and curve background, without infinite extension |

Local witnesses include drawing-refinement, drawing-curves, installed-package drawing-comparison and the third-party example. Actual completion and failures belong to the implementation SUMMARY; an available entry does not imply all acceptance gates passed.

0.13 alerts cover only horizontal/extended lines, finite segments and directed rays, using observed closes. They do not represent the full TradingView website alert catalog or a background service. Sources must be confirmed chart-local main-axis market drawings; backend sources retain their authority. Curve markers and chord-closed backgrounds do not alter definitions. See[0.13](./upgrade/0.13.0.md).

## 0.14 expression and dense-editing boundaries

The local 0.14 upgrade is still being validated; new verification entries above do not imply all gates passed. The catalog stays at 56. This update adds no live TradingView task, numerical-equivalence or timing-comparison claim.

| Task | Local contract and limits |
| --- | --- |
| Attach text to geometry | Seven tools: horizontal/extended/trend lines, rays, parallel lines, price channels and rectangles; six use line geometry, rectangles box. Four body tools remain body; other built-ins gain no attached labels |
| Select overlapping drawings | Confirmed, visible, period-eligible hits with current projections in the pane; retain all stable candidate IDs in native zLevel order, mount at most 60 rows and reach every item by keyboard. Selecting/cancelling writes no content |
| Numeric translation | One writable document/scope, pane, effective price axis and resolvable market anchors. Loaded real bars preserve fractions; price/tick units are explicit, tickSize positive, and no future timestamps are fabricated |
| Capability differences | anchoredText disables translation. AVWAP, FRVP and both regression tools allow bars only; 51 other built-ins allow bars and price. Omitted third-party numericMove means false for both without category inference |
| Persistence/templates | Existing v4/v2/shared v1; extendData is the sole body, while templates/defaults/recent styles copy only styles and parameters. Object copying retains text with new IDs |

Label styling/text does not change alert geometry or comparison points; moving geometry retains existing source handling. No account, quantity, leverage, order or background-service behavior is added. Restoration/data-computation performance requires complete current samples; feature descriptions do not imply performance acceptance. See [0.14 migration](./upgrade/0.14.0.md).
