import {describe,it,expect} from 'vitest'
import {valueChannelFigures} from '../valueChannel'
const args=(values:number[],log=false):any=>({overlay:{points:values.map((value,index)=>({dataIndex:[0,2,2][index],value}))},coordinates:values.map((value,index)=>({x:[0,20,20][index],y:log?Math.log10(Math.abs(value)):value})),chart:{getDataList:()=>[]},xAxis:{convertToPixel:(n:number)=>n*10,convertFromPixel:(n:number)=>n/10},yAxis:{name:log?'logarithm':'normal',convertToPixel:(n:number)=>log?Math.log10(Math.abs(n)):n},bounding:{width:20,height:500}})
describe('value-domain channels and forks',()=>{
 it('keeps parallel prices and symmetric channel offsets before nonlinear projection',()=>{
  const input=args([100,400,450],true),parallel:any=valueChannelFigures(input,'parallel'),channel:any=valueChannelFigures(input,'channel')
  expect(parallel[0].attrs).toHaveLength(2);expect(channel[0].attrs).toHaveLength(3)
  expect(parallel[0].attrs[0].coordinates[32]).toEqual({x:10,y:Math.log10(250)})
  expect(parallel[0].attrs[1].coordinates[32].y).toBeCloseTo(Math.log10(300))
  expect(channel[0].attrs[2].coordinates[32].y).toBeCloseTo(Math.log10(200))
 })
 it('derives ordinary and Schiff pivots in raw prices',()=>{
  const input=args([100,400,900],true),fork:any=valueChannelFigures(input,'pitchfork'),schiff:any=valueChannelFigures(input,'schiff')
  expect(fork[0].attrs).toHaveLength(5);expect(fork[0].attrs[0].coordinates.at(-1).y).toBeCloseTo(Math.log10(650))
  expect(schiff[0].attrs[0].coordinates[0].y).toBeCloseTo(Math.log10(250))
  expect(schiff[0].attrs[0].coordinates.at(-1).y).toBeCloseTo(Math.log10(650))
 })
 it('reports invalid derived log prices instead of relying on finite engine pixels',()=>{
  const input=args([100,200,500],true);expect(JSON.stringify(valueChannelFigures(input,'channel'))).toContain('不能显示通道派生值')
  input.yAxis.name='normal';input.yAxis.convertToPixel=(n:number)=>n;expect(JSON.stringify(valueChannelFigures(input,'channel'))).not.toContain('不能显示')
 })
})
