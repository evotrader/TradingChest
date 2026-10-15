import {describe,it,expect} from 'vitest'
import {commonBase,percentValues} from '../group'
const bars=(values:number[],stamps=values.map((_,i)=>i+1))=>values.map((close,i)=>({timestamp:stamps[i],open:close,high:close,low:close,close,volume:1}))
describe('comparison common fixed base',()=>{
 it('uses the first actual timestamp common to every member and normalizes each separately',()=>{const main=bars([10,20,30,40]),a=bars([100,200,300],[2,3,4]),b=bars([5,6],[3,4]);const base=commonBase(main,[a,b]);expect(base).toBe(3);expect(percentValues(main,base)[4]).toBeCloseTo(100/3);expect(percentValues(a,base)[4]).toBe(50);expect(percentValues(b,base)[4]).toBeCloseTo(20)})
 it('does not fill gaps or rebase after earlier history is prepended',()=>{const values=percentValues(bars([5,10,20],[1,3,5]),3);expect(values[1]).toBeUndefined();expect(values[4]).toBeUndefined();expect(values[5]).toBe(100)})
 it('rejects missing overlap, zero and invalid bases',()=>{expect(()=>commonBase(bars([10]),[bars([20],[2])])).toThrow('共同实际时标');expect(()=>commonBase(bars([0]),[bars([20])])).toThrow('零');expect(()=>commonBase(bars([10]),[bars([0])])).toThrow('零');expect(()=>percentValues(bars([10]),2)).toThrow('基准缺失');expect(()=>percentValues(bars([NaN]),1)).toThrow('无效')})
})
