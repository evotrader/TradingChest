import {describe,it,expect} from 'vitest'
import {fibonacciPrices,linearRegression,rangeValues,positionValues} from '../numerics'
describe('drawing numerical definitions',()=>{
  it('computes retracement and extension in price values independently of the axis transform',()=>{
    expect(fibonacciPrices(100,200,[0,.5,1,1.5])).toEqual([200,150,100,50])
    expect(fibonacciPrices(200,100,[0,.5,1],300)).toEqual([300,350,400])
  })
  it('fits all actual observations rather than joining selected endpoint prices',()=>{
    const fit=linearRegression([1,3,2,5]);expect(fit.slope).toBeCloseTo(1.1);expect(fit.intercept).toBeCloseTo(1.1);expect(fit.deviation).toBeCloseTo(Math.sqrt(.675))
    expect(linearRegression([2,4,6])).toEqual({intercept:2,slope:2,deviation:0})
    expect(()=>linearRegression([1,NaN,3])).toThrow('缺口');expect(()=>linearRegression([1])).toThrow('至少')
  })
  it('separates trading bars from elapsed time and keeps zero-base percentages unavailable',()=>{
    expect(rangeValues([{dataIndex:3,timestamp:100,value:0},{dataIndex:8.5,timestamp:100000,value:5}],[{x:0,y:0},{x:55,y:5}],10)).toEqual({bars:5.5,durationMs:99900,difference:5,percentage:undefined})
    expect(rangeValues([{value:10},{value:11}],[{x:0,y:0},{x:48,y:5}],12)).toEqual({bars:4,durationMs:undefined,difference:1,percentage:10})
  })
  it('validates long and short risk direction and uses only an explicit tick size',()=>{
    expect(positionValues(100,95,110,1,.25)).toMatchObject({risk:5,reward:10,ratio:2,riskTicks:20,rewardTicks:40,riskPercentage:5,rewardPercentage:10})
    expect(positionValues(100,105,90,-1)).toMatchObject({ratio:2,riskTicks:undefined})
    expect(positionValues(100,100,110,1).message).toContain('风险为零')
    expect(positionValues(100,105,110,1).message).toContain('止损方向')
    expect(positionValues(100,95,90,1).message).toContain('止盈方向')
    expect(positionValues(-5,-10,0,1)).toMatchObject({ratio:1,riskPercentage:undefined})
  })
})
