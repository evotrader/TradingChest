# Drawing coverage and differences

The source catalog contains 43 retained tools and 8 additions. Every tool uses the shared command, confirmed history, editor and persistence paths. The all-tool browser runner creates, cancels edits, confirms edits, undoes/redoes, deletes and restores each tool; numerical tests cover Fibonacci, channels/forks, regression and positions separately. This catalog is not a claim of full TradingView parity.

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

## Deliberate differences

TradingChest shares only local main-pane market anchors with confirmed price identity. Host annotations retain their original backend authority. Position drawings do not compute account size, quantity or leverage. Volume profiles, Anchored VWAP, additional Gann/Fib/wave tools, curves/arcs, images/stickers, drawing alerts and order integration remain later candidates. No pixel-identical rendering or matching account calculations is promised.

Reference: [TradingView drawings](https://www.tradingview.com/charting-library-docs/latest/ui_elements/drawings/), [tool families](https://www.tradingview.com/charting-library-docs/latest/ui_elements/drawings/Drawings-List/), [position tool](https://www.tradingview.com/support/solutions/43000517002-long-position-drawing-tool/).

The installed-package `tests/integration/drawing-comparison.mjs` performs the same task: two support lines, rectangle, text, Fib, multi-select styling, grouping, current-interval filtering, sharing and reopening. If the official demo cannot be reached, the comparison is explicitly documentation-only; local acceptance artifacts retain actual results and screenshots.
