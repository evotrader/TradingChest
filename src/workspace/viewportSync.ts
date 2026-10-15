import type { Chart, Crosshair } from 'klinecharts'

export function visibleTimestamps(chart:Chart):{from:number;to:number}|null {
  const bars=chart.getDataList(), range=chart.getVisibleRange()
  const first=bars[Math.max(0,range.from)],last=bars[Math.min(bars.length-1,range.to-1)]
  return first&&last?{from:first.timestamp,to:last.timestamp}:null
}

export function hideCrosshair(target:Chart):void {
  // The fixed v10 runtime accepts null; {} is defaulted to the candle pane and last bar.
  target.executeAction('onCrosshairChange',null as unknown as Crosshair)
}
export function syncCrosshair(sourceChart:Chart,target:Chart,source:Crosshair):boolean {
  const point=source.x===undefined?{}:(sourceChart.convertFromPixel([{x:source.x}],{paneId:source.paneId??'candle_pane'}) as Array<{dataIndex?:number}>)[0]
  const timestamp=point.dataIndex===undefined?undefined:sourceChart.getDataList()[point.dataIndex]?.timestamp
  const index=target.getDataList().findIndex(bar=>bar.timestamp===timestamp)
  if(index<0 || source.paneId===undefined){hideCrosshair(target);return false}
  const pixel=target.convertToPixel({dataIndex:index},{paneId:'candle_pane'}) as {x?:number}
  if(pixel.x===undefined){hideCrosshair(target);return false}
  // Only the time coordinate is shared. The price coordinate belongs to each instrument.
  target.executeAction('onCrosshairChange',{x:pixel.x,paneId:'candle_pane'})
  return true
}

export function syncViewport(target:Chart,window:{from:number;to:number}):boolean {
  const bars=target.getDataList()
  const first=bars.findIndex(bar=>bar.timestamp>=window.from&&bar.timestamp<=window.to)
  let last=-1
  for(let i=bars.length-1;i>=first&&first>=0;i--)if(bars[i].timestamp<=window.to){last=i;break}
  const width=target.getSize('candle_pane','main')?.width
  if(first<0||last<first||!width)return false
  // v10's visible range includes the partially visible left bar.
  target.setBarSpace(width/(last-first+1))
  target.scrollToDataIndex(last,0)
  // v10 scrollToDataIndex anchors a bar center. Move half a bar to its right edge;
  // otherwise rounding can expose the next (out-of-window) timestamp.
  target.scrollByDistance(target.getBarSpace().bar/2,0)
  const actual=target.getVisibleRange()
  return actual.from<=first&&actual.to===last+1 && Math.abs(actual.from-first)<=1
}
