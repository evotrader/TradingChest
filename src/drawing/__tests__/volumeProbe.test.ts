import {describe,it,expect} from 'vitest'
import {assertVolumeFigureCalls,assertVolumeTotals} from '../../../tests/browser/volumeOracle'
describe('volume benchmark negative controls',()=>{
  it('rejects repeated calls from only one tool or only one chart',()=>{
    expect(()=>assertVolumeFigureCalls({'0:anchoredVwap':2},[0])).toThrow()
    expect(()=>assertVolumeFigureCalls({'0:anchoredVwap':2,'0:fixedRangeVolumeProfile':2},[0,1])).toThrow()
    expect(()=>assertVolumeFigureCalls({'0:anchoredVwap':1,'0:fixedRangeVolumeProfile':1,'1:anchoredVwap':1,'1:fixedRangeVolumeProfile':1},[0,1])).not.toThrow()
  })
  it('rejects a changed but incorrect VWAP, nonfinite results and wrong participating counts',()=>{
    const expected={volume:101,vwap:10.5,count:2},actual={volume:101,profileVolume:101,vwap:10.5,count:2,profileCount:2}
    assertVolumeTotals(actual,expected)
    for(const patch of [{vwap:999999},{vwap:NaN},{vwap:Infinity},{profileVolume:100},{count:1}])expect(()=>assertVolumeTotals({...actual,...patch},expected)).toThrow()
  })
})
