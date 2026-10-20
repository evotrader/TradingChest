import {describe,it,expect} from 'vitest'
import type {KLineData} from 'klinecharts'
import {calculateAnchoredVwap,calculateVolumeProfile,VwapIndex} from '../analytics'
const bar=(timestamp:number,price:number,volume:number):KLineData=>({timestamp,open:price,high:price,low:price,close:price,volume})
describe('OHLCV drawing mathematics',()=>{
  it('weights independently calculated prices and never resets at a calendar boundary',()=>{
    const data=[bar(1,10,100),bar(86400001,20,200),bar(172800001,30,300)]
    expect(calculateAnchoredVwap(data,0,'close').map(p=>p.value)).toEqual([10,50/3,70/3])
    expect(calculateAnchoredVwap(data,1,'close').map(p=>p.value)).toEqual([20,26])
  })
  it('keeps zero-volume gaps unavailable and rejects a missing or negative size in the cumulative suffix',()=>{
    const data=[bar(1,10,0),bar(2,20,10),{...bar(3,30,10),volume:undefined},bar(4,40,10)]
    expect(calculateAnchoredVwap(data,0).map(p=>p.value)).toEqual([undefined,20,undefined,undefined])
    expect(calculateAnchoredVwap(data,3).map(p=>p.value)).toEqual([40])
    expect(calculateAnchoredVwap([bar(1,10,-1)],0)[0].value).toBeUndefined()
  })
  it('uses each declared OHLC price source and replaces the last contribution before an append',()=>{
    const data=[{timestamp:1,open:4,high:12,low:2,close:8,volume:10}]
    for(const [source,value] of [['close',8],['hl2',7],['hlc3',22/3],['ohlc4',6.5]] as const)expect(calculateAnchoredVwap(data,0,source)[0].value).toBeCloseTo(value,12)
    const index=new VwapIndex('close'),samples=[bar(1,10,100),bar(2,20,200)]
    index.update(samples);samples[1]=bar(2,30,400);index.update(samples,true)
    expect(index.at(samples,0,1).value).toBe(26)
    samples.push(bar(3,40,500));index.update(samples,true)
    expect(index.at(samples,0,2).value).toBe(33)
    samples.unshift(bar(0,0,100));index.update(samples)
    expect(index.at(samples,1,3).value).toBe(33)
  })
  it('does not publish non-finite cumulative values',()=>{
    expect(calculateAnchoredVwap([bar(1,1e308,1e308)],0)[0].value).toBeUndefined()
  })
  it('does not let a large earlier candle erase the weight after a later anchor',()=>{
    expect(calculateAnchoredVwap([bar(1,1e18,1e18),bar(2,1,1)],1,'close')[0]).toMatchObject({value:1,volume:1})
    expect(calculateAnchoredVwap([bar(1,1e18,1e18),bar(2,1.01003e18,1e18),bar(3,1,1)],2,'close')[0]).toMatchObject({value:1,volume:1})
    const index=new VwapIndex('close'),data=[bar(1,1e18,1e18),bar(2,1.01003e18,1e18),bar(3,1,1),bar(4,3,1)]
    index.update(data);expect(index.at(data,2,3).value).toBe(2);expect(index.at(data,2,2).value).toBe(1)
    data[3]=bar(4,5,1);index.update(data,true);expect(index.at(data,2,3).value).toBe(3)
  })
  it('preserves single-price volume and a POC/VA located at the actual price',()=>{
    const result=calculateVolumeProfile([bar(1,10,60),bar(2,10,40)],0,1,192,.7)
    expect(result.bins).toEqual([{lower:10,upper:10,volume:100,up:100,down:0}])
    expect(result).toMatchObject({volume:100,poc:10,val:10,vah:10,valueArea:1})
  })
  it('allocates overlaps, includes the highest boundary and expands whole rows',()=>{
    const data=[{timestamp:1,open:0,low:0,high:4,close:4,volume:80},bar(2,4,20),{timestamp:3,open:4,low:1,high:4,close:1,volume:30}]
    const result=calculateVolumeProfile(data,0,2,4,.7)
    expect(result.bins.map(b=>b.up)).toEqual([20,20,20,40])
    expect(result.bins.map(b=>b.down)).toEqual([0,10,10,10])
    expect(result).toMatchObject({volume:130,poc:3.5,val:1,vah:4,pocIndex:3,vaFrom:1,vaTo:3})
    expect(result.valueArea).toBeCloseTo(110/130,12)
  })
  it('chooses central then lower tied POC and lower tied value-area neighbor',()=>{
    const result=calculateVolumeProfile([bar(1,0,10),bar(2,1,10),bar(3,2,10),bar(4,3,10)],0,3,4,.5)
    expect(result.pocIndex).toBe(1);expect(result.vaFrom).toBe(0);expect(result.vaTo).toBe(1)
  })
  it('rejects zero volume, invalid bars and unsupported row counts',()=>{
    expect(()=>calculateVolumeProfile([bar(1,10,0)],0,0)).toThrow('无成交量')
    expect(()=>calculateVolumeProfile([{...bar(1,10,1),volume:undefined}],0,0)).toThrow('无效')
    for(const rows of [0,1.5,257,Infinity])expect(()=>calculateVolumeProfile([bar(1,10,1)],0,0,rows)).toThrow('参数')
  })
  it('matches a separate quadratic overlap reference across deterministic random cases',()=>{
    let seed=418
    const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32}
    for(let attempt=0;attempt<40;attempt++){
      const samples=Array.from({length:30},(_,i)=>{const low=Math.floor(random()*50),high=low+1+random()*20;return {timestamp:i+1,low,high,open:low+(high-low)*random(),close:low+(high-low)*random(),volume:Math.round(random()*100000)}})
      const rows=1+Math.floor(random()*50),result=calculateVolumeProfile(samples,0,samples.length-1,rows)
      for(const bin of result.bins){
        let up=0,down=0
        for(const sample of samples){const fraction=Math.max(0,Math.min(sample.high,bin.upper)-Math.max(sample.low,bin.lower))/(sample.high-sample.low);if(sample.close>=sample.open)up+=sample.volume*fraction;else down+=sample.volume*fraction}
        expect(bin.up).toBeCloseTo(up,7);expect(bin.down).toBeCloseTo(down,7)
      }
      expect(result.bins.reduce((s,b)=>s+b.volume,0)).toBeCloseTo(samples.reduce((s,b)=>s+b.volume,0),6)
    }
  })
})
