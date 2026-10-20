export function assertVolumeFigureCalls(calls:Record<string,number>|undefined,charts:number[]):void {
  for(const chart of charts)for(const tool of ['anchoredVwap','fixedRangeVolumeProfile']){
    const count=calls?.[`${chart}:${tool}`]
    if(!Number.isInteger(count)||count!<1)throw Error(`图 ${chart} 的 ${tool} 未完成真实图形绘制`)
  }
}
export interface VolumeExpected {volume:number;vwap:number;count:number}
export interface VolumeObserved {volume:number;profileVolume:number;vwap:number;count:number;profileCount:number}
export function assertVolumeTotals(actual:VolumeObserved,expected:VolumeExpected):void {
  if(![actual.volume,actual.profileVolume,actual.vwap,expected.volume,expected.vwap].every(Number.isFinite)||
    actual.count!==expected.count||actual.profileCount!==expected.count||actual.volume!==expected.volume||actual.profileVolume!==expected.volume||
    Math.abs(actual.vwap-expected.vwap)>1e-10*Math.max(1,Math.abs(expected.vwap)))throw Error('量价结果不符合独立 OHLCV 分子／分母预期 '+JSON.stringify({actual,expected}))
}
