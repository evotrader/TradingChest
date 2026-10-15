import type {KLineData} from 'klinecharts'
export function commonBase(main:KLineData[],series:KLineData[][],from=-Infinity,to=Infinity):number {
  if(!main.length||series.some(bars=>!bars.length))throw Error('没有足够的真实行情，无法比较')
  return commonBaseWithPrices(main,series.map(priceMap),from,to)
}
export function priceMap(bars:KLineData[]):Map<number,number>{const prices=new Map<number,number>();for(const bar of bars)prices.set(bar.timestamp,bar.close);return prices}
export function commonBaseWithPrices(main:KLineData[],maps:Map<number,number>[],from=-Infinity,to=Infinity):number {
  const base=main.find(bar=>bar.timestamp>=from&&bar.timestamp<=to&&maps.every(map=>map.has(bar.timestamp)))
  if(!base)throw Error('没有共同实际时标，该标的不能加入比较')
  if([base.close,...maps.map(map=>map.get(base.timestamp)!)].some(close=>!Number.isFinite(close)||close===0))throw Error('共同基准价格为零或无效，该标的不能比较')
  return base.timestamp
}
export function baseClose(bars:KLineData[],baseTimestamp:number):number {
  const base=bars.find(bar=>bar.timestamp===baseTimestamp)?.close
  if(base===undefined||!Number.isFinite(base)||base===0)throw Error('固定基准缺失或价格无效，请重读行情或重设比较区间')
  return base
}
export function percentValues(bars:KLineData[],baseTimestamp:number):Record<number,number> {
  const base=baseClose(bars,baseTimestamp)
  const values:Record<number,number>={}
  for(const bar of bars)if(bar.timestamp>=baseTimestamp)values[bar.timestamp]=(bar.close/base-1)*100
  return values
}
