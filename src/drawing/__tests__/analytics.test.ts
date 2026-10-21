import {describe,it,expect} from 'vitest'
import type {KLineData} from 'klinecharts'
import {calculateAnchoredVwap,calculateVolumeProfile,VwapIndex} from '../analytics'
const bar=(timestamp:number,price:number,volume:number):KLineData=>({timestamp,open:price,high:price,low:price,close:price,volume})
describe('OHLCV drawing mathematics',()=>{
  it('retains finite contributions when valid negative prices cancel a large positive prefix',()=>{
    expect(calculateAnchoredVwap([bar(1,1e18,1),bar(2,1,1),bar(3,-1e18,1)],0,'close')[2].value).toBeCloseTo(1/3,12)
  })
  it('retains arbitrarily layered finite residuals in prefixes, local anchors and tail replacement',()=>{
    const prices=[1e36,1e18,1,-1e36,-1e18],data=prices.map((p,i)=>bar(i+1,p,1))
    expect(calculateAnchoredVwap(data,0,'close').at(-1)).toMatchObject({value:.2,volume:5})
    const local=[bar(0,1e50,1),...data]
    expect(calculateAnchoredVwap(local,1,'close').at(-1)).toMatchObject({value:.2,volume:5})
    const index=new VwapIndex('close');index.update(data)
    const replaced=[...data.slice(0,-1),bar(5,-1e18,2)];index.update(replaced,true)
    expect(index.at(replaced,0,4).value).toBe((-1e18+1)/6)
    index.update(data,true);expect(index.at(data,0,4).value).toBe(.2)
    const layered=[1e200,1e150,1e100,1e50,1,-1e200,-1e150,-1e100,-1e50].map((p,i)=>bar(i,p,1))
    expect(calculateAnchoredVwap(layered,0,'close').at(-1)?.value).toBe(1/9)
  })
  it('matches an independent exact integer oracle across shuffled cancellation scales',()=>{
    let seed=17
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32}
    for(let sample=0;sample<100;sample++){
      const prices=[1,...[53,101,167,251,389,521,713,901].flatMap(exponent=>[2**exponent,-(2**exponent)])]
      for(let i=prices.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[prices[i],prices[j]]=[prices[j],prices[i]]}
      const data=prices.map((p,i)=>bar(i+1,p,1)),points=calculateAnchoredVwap(data,0,'close')
      let exact=0n
      for(let i=0;i<data.length;i++){exact+=BigInt(prices[i]);expect(points[i].value).toBe(Number(exact)/(i+1))}
      expect(calculateAnchoredVwap([bar(0,2**950,1),...data],1,'close').at(-1)?.value).toBe(1/data.length)
    }
  })
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
  it('keeps uniform default bins tied under translation and high-price one-cent ranges',()=>{
    for(const rows of [48,96,192])for(const [low,high] of [[0,1],[100,105],[100000,100000.01],[-100005,-100000]]){
      const result=calculateVolumeProfile([{timestamp:1,open:low,low,high,close:high,volume:480}],0,0,rows)
      expect(new Set(result.bins.map(bin=>bin.volume)).size).toBe(1)
      expect(result.pocIndex).toBe(rows/2-1)
      expect(result.vaFrom).toBe(0);expect(result.vaTo).toBe(Math.ceil(rows*.7)-1)
      expect(result.bins.reduce((n,bin)=>n+bin.volume,0)).toBeCloseTo(480,10)
    }
  })
  it('preserves real one-ULP differences for direct POC and value-area comparisons',()=>{
    const result=calculateVolumeProfile([bar(1,0,1),bar(2,1,1+Number.EPSILON)],0,1,2)
    expect(result.pocIndex).toBe(1)
    const area=calculateVolumeProfile([bar(1,0,1),bar(2,1,10),bar(3,2,1+Number.EPSILON)],0,2,3,.9)
    expect(area).toMatchObject({pocIndex:1,vaFrom:1,vaTo:2})
  })
  it('does not overflow finite edge contributions when a narrow bar crosses a boundary',()=>{
    const data=[{timestamp:1,open:0,low:0,high:48,close:48,volume:0},{timestamp:2,open:24,low:23.999999999999996,high:24.000000000000004,close:24,volume:1e308}]
    const result=calculateVolumeProfile(data,0,1,48)
    expect(result.bins[23].volume).toBe(5e307);expect(result.bins[24].volume).toBe(5e307)
    expect(result.volume).toBe(1e308)
  })
  it.each([
    {wide:[0,48,0],narrow:[.25,.25000001,1000.1],expected:[1000.1,0]},
    {wide:[100,148,1],narrow:[100.25,100.25000001,1000.1],expected:[1000.1+1/48,1/48]},
    {wide:[0,48,1],narrow:[.999999995,1.000000005,1000.1],expected:[500.05+1/48,500.05+1/48]},
  ])('preserves non-integer narrow-bar volume without subtracting large rounded products: %j',({wide,narrow,expected})=>{
    for(const down of [false,true]){
      const data=[wide,narrow].map(([low,high,volume],i)=>({timestamp:i+1,low,high,volume,open:down?high:low,close:down?low:high}))
      const result=calculateVolumeProfile(data,0,1,48)
      expect(result.volume).toBe(wide[2]+narrow[2])
      for(let i=0;i<2;i++){
        expect(result.bins[i].volume).toBeCloseTo(expected[i],11)
        expect(result.bins[i][down?'down':'up']).toBeCloseTo(expected[i],11)
        expect(result.bins[i][down?'up':'down']).toBe(0)
      }
      expect(result.bins.reduce((n,bin)=>n+bin.volume,0)).toBeCloseTo(result.volume,9)
    }
  })
  it('keeps equal physical densities tied across adjacent bars, translations and up/down partitions',()=>{
    for(const rows of [48,96,192])for(const shift of [0,100000,-100000])for(const cuts of [[0,9,11],[0,2,5]])for(const down of [false,true]){
      const data=cuts.slice(1).map((high,i)=>({timestamp:i+1,low:cuts[i]+shift,high:high+shift,open:(down?high:cuts[i])+shift,close:(down?cuts[i]:high)+shift,volume:high-cuts[i]}))
      const result=calculateVolumeProfile(data,0,data.length-1,rows)
      expect(result.pocIndex).toBe(rows/2-1);expect(result.vaFrom).toBe(0);expect(result.vaTo).toBe(Math.ceil(rows*.7)-1)
      expect(new Set(result.bins.map(bin=>bin.volume)).size).toBe(1)
    }
  })
  it('keeps small active-bin contributions after large difference terms cancel',()=>{
    for(const down of [false,true]){
      const data=[[0,4,0],[0,2,2e36],[0,3,3]].map(([low,high,volume],i)=>({timestamp:i+1,low,high,open:down?high:low,close:down?low:high,volume}))
      const result=calculateVolumeProfile(data,0,2,4)
      expect(result.bins.map(bin=>bin.volume)).toEqual([1e36,1e36,1,0])
      expect(result.bins[2][down?'down':'up']).toBe(1)
    }
  })
  it('preserves uniform POC and value-area ties across 1000 independent integer-density partitions',()=>{
    let seed=17
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32}
    for(let attempt=0;attempt<1000;attempt++){
      const high=10+Math.floor(random()*1000),rows=[48,96,192][attempt%3],cuts=[0,high]
      for(let i=0;i<10;i++)cuts.push(Math.floor(random()*high))
      const boundaries=[...new Set(cuts.sort((a,b)=>a-b))],density=1+Math.floor(random()*8)
      const data=boundaries.slice(1).map((high,i)=>{const low=boundaries[i],down=attempt%2&&i%2;return {timestamp:i+1,low,high,open:down?high:low,close:down?low:high,volume:(high-low)*density}})
      const result=calculateVolumeProfile(data,0,data.length-1,rows)
      expect(result).toMatchObject({pocIndex:rows/2-1,vaFrom:0,vaTo:Math.ceil(rows*.7)-1})
      expect(new Set(result.bins.map(bin=>bin.volume)).size).toBe(1)
    }
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
