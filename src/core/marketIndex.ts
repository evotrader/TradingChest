/** Locate a market instant geometrically without changing its canonical timestamp. */
export function marketIndex(timestamp:number,bars:readonly {timestamp:number}[]):number {
  if(!Number.isFinite(timestamp)||!bars.length||timestamp<bars[0].timestamp||timestamp>bars[bars.length-1].timestamp)throw Error('市场锚点不在当前已加载或回放范围，请加载参考历史后重试')
  let low=0,high=bars.length-1
  while(low<=high){const middle=(low+high)>>>1,time=bars[middle].timestamp;if(time===timestamp)return middle;if(time<timestamp)low=middle+1;else high=middle-1}
  const span=bars[low].timestamp-bars[high].timestamp
  if(span<=0)throw Error('真实历史的时标顺序无效')
  return high+(timestamp-bars[high].timestamp)/span
}
