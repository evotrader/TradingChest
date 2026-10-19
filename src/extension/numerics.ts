import type {Overlay,Point,Coordinate,YAxis} from 'klinecharts'

export const fibonacciLevels=[0,.236,.382,.5,.618,.786,1]
export function canProjectAxisValue(axis:Pick<YAxis,'name'|'convertToPixel'>|null,value:number):boolean{return !!axis&&Number.isFinite(value)&&(!/log/i.test(axis.name)||value>0)&&Number.isFinite(axis.convertToPixel(value))}
export function toolParameters(overlay:Pick<Overlay,'extendData'>):Record<string,unknown>{return (overlay.extendData as {drawingParameters?:Record<string,unknown>}|null)?.drawingParameters??{}}
export function toolLevels(overlay:Pick<Overlay,'extendData'>,defaults=fibonacciLevels):number[]{const value=toolParameters(overlay).levels;return Array.isArray(value)&&value.length&&value.every(v=>typeof v==='number'&&Number.isFinite(v))?value:defaults}
export function fibonacciPrices(start:number,end:number,levels:number[],base=end):number[]{return levels.map(level=>base+(start-end)*level)}

/** OLS with population residual deviation, in the original value domain. */
export function linearRegression(values:number[]):{intercept:number;slope:number;deviation:number}{
  if(values.length<2||values.some(value=>!Number.isFinite(value)))throw Error('回归区间至少需要两根有效行情；缺口不能参与回归')
  const n=values.length,mx=(n-1)/2,my=values.reduce((sum,value)=>sum+value,0)/n
  let numerator=0,denominator=0
  for(let i=0;i<n;i++){numerator+=(i-mx)*(values[i]-my);denominator+=(i-mx)**2}
  const slope=numerator/denominator,intercept=my-slope*mx,deviation=Math.sqrt(values.reduce((sum,value,index)=>sum+(value-intercept-slope*index)**2,0)/n)
  return {slope,intercept,deviation}
}
export function rangeValues(points:Partial<Point>[],coordinates:Coordinate[],barSpace:number):{bars:number;durationMs?:number;difference?:number;percentage?:number}{
  const [a,b]=points,difference=a?.value!==undefined&&b?.value!==undefined?b.value-a.value:undefined
  const indexDifference=a?.dataIndex!==undefined&&b?.dataIndex!==undefined?b.dataIndex-a.dataIndex:(coordinates[1].x-coordinates[0].x)/barSpace
  const durationMs=a?.timestamp!==undefined&&b?.timestamp!==undefined?Math.abs(b.timestamp-a.timestamp):undefined
  return {bars:Math.abs(indexDifference),durationMs,difference,percentage:difference!==undefined&&a?.value!==undefined&&a.value>0?difference/a.value*100:undefined}
}
export function positionValues(entry:number,stop:number,target:number|undefined,direction:1|-1,tickSize?:number){
  const risk=(entry-stop)*direction,reward=target===undefined?undefined:(target-entry)*direction
  const message=![entry,stop,...(target===undefined?[]:[target])].every(Number.isFinite)?'价格无效':risk===0?'风险为零，无法计算盈亏比':risk<0?'止损方向错误':reward!==undefined&&reward<=0?'止盈方向错误':undefined
  const tick=tickSize!==undefined&&Number.isFinite(tickSize)&&tickSize>0?tickSize:undefined
  return {risk,reward,message,ratio:!message&&reward!==undefined?reward/risk:undefined,riskPercentage:entry>0?risk/entry*100:undefined,rewardPercentage:entry>0&&reward!==undefined?reward/entry*100:undefined,riskTicks:tick?risk/tick:undefined,rewardTicks:tick&&reward!==undefined?reward/tick:undefined}
}
export function formatRangeDuration(ms:number|undefined,en=false):string {
  if(ms===undefined||!Number.isFinite(ms))return en?'Elapsed time unavailable (logical bars)':'自然时长未知（逻辑根数）'
  const seconds=Math.floor(ms/1000),days=Math.floor(seconds/86400),hours=Math.floor(seconds%86400/3600),minutes=Math.floor(seconds%3600/60)
  return [days?`${days}${en?'d':'天'}`:'',hours?`${hours}${en?'h':'小时'}`:'',minutes?`${minutes}${en?'m':'分'}`:'',!days&&!hours&&!minutes?`${seconds}${en?'s':'秒'}`:''].filter(Boolean).join(' ')
}
