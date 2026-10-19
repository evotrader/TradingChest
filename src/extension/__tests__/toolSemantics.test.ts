import {describe,it,expect} from 'vitest'
import fibonacciLine from '../fibonacciLine'
import fibonacciExtension from '../fibonacciExtension'
import gannBox from '../gannBox'
import regressionTrend from '../regressionTrend'
import regressionChannel from '../regressionChannel'
import longPosition from '../longPosition'
import shortPosition from '../shortPosition'
const bars=[1,3,2,5].map((close,index)=>({timestamp:100+index*100,open:close,high:close+.5,low:close-.5,close,volume:1}))
const axis=(name='normal')=>({id:'axis',name,convertToPixel:(value:number)=>name==='logarithm'?Math.log10(Math.abs(value))*100:100-value*10})
function args(values:number[],parameters:Record<string,unknown>={},name='normal'):any{return {coordinates:values.map((value,index)=>({x:index*30,y:axis(name).convertToPixel(value)})),overlay:{paneId:'candle_pane',points:values.map((value,index)=>({timestamp:bars[Math.min(index*3,3)].timestamp,value})),extendData:{drawingParameters:parameters},styles:{}},chart:{getSymbol:()=>({pricePrecision:2,tickSize:.25}),getLocale:()=> 'en-US',getDataList:()=>bars},yAxis:axis(name),xAxis:{convertToPixel:(index:number)=>index*10,convertFromPixel:()=>3},bounding:{width:300,height:200}}}
const figures=(tool:any,value:any):any[]=>tool.createPointFigures(value)
describe('rendered tool numerical semantics',()=>{
 it('projects edited Fib levels from prices through the actual nonlinear axis',()=>{
  const result=figures(fibonacciLine,args([100,200],{levels:[0,.5,1]},'logarithm'))
  expect(result[0].attrs.map((line:any)=>line.coordinates[0].y)).toEqual([Math.log10(200)*100,Math.log10(150)*100,200])
  expect(result[1].attrs.map((text:any)=>text.text)).toEqual(['200.00 (0.0%)','150.00 (50.0%)','100.00 (100.0%)'])
  const ext=args([100,200,150],{levels:[.5]},'logarithm'),extension=figures(fibonacciExtension,ext)
  expect(extension[1].attrs[0].coordinates[0].y).toBe(Math.log10(200)*100)
  expect(extension[2].attrs[0].text).toBe('200.00 (50.0%)')
 })
 it('rejects non-positive derived log values even when the axis converts them to finite pixels',()=>{
  for(const [tool,values,levels] of [[fibonacciLine,[100,200],[3]],[fibonacciExtension,[200,100,100],[3]],[gannBox,[100,200],[-2]]] as const){
   expect(JSON.stringify(figures(tool,args([...values],{levels:[...levels]},'logarithm')))).toMatch(/不能显示/)
   expect(JSON.stringify(figures(tool,args([...values],{levels:[...levels]},'normal')))).not.toMatch(/不能显示/)
  }
 })
 it('fits real OHLC observations and projects exact residual-channel values',()=>{
  const input=args([1,5],{source:'close',extend:false,deviations:2}),trend=figures(regressionTrend,input),channel=figures(regressionChannel,input)
  expect(trend[0].attrs.coordinates.map((p:any)=>p.x)).toEqual([0,10,20,30])
  expect(trend[0].attrs.coordinates[0].y).toBeCloseTo(89)
  expect(trend[0].attrs.coordinates.at(-1).y).toBeCloseTo(56)
  const sigma=Math.sqrt(.675)
  expect(channel[2].attrs[0].coordinates[0].y).toBeCloseTo(100-(1.1+2*sigma)*10)
  expect(channel[2].attrs[1].coordinates[0].y).toBeCloseTo(100-(1.1-2*sigma)*10)
  input.yAxis=axis('logarithm');expect(JSON.stringify(figures(regressionChannel,input))).toMatch(/不能显示回归值/)
 })
 it('renders long/short ratios, explicit ticks and invalid directions without fictitious size',()=>{
  for(const [tool,prices] of [[longPosition,[100,95,110]],[shortPosition,[100,105,90]]] as const){const body=JSON.stringify(figures(tool,args([...prices])));expect(body).toContain('R/R 2.00');expect(body).toContain('20.00 tick');expect(body).toContain('40.00 tick');expect(body).not.toMatch(/NaN|Infinity|QTY|杠杆/)}
  expect(JSON.stringify(figures(longPosition,args([100,100,110])))).toContain('风险为零')
  expect(JSON.stringify(figures(longPosition,args([100,105,110])))).toContain('止损方向错误')
 })
})
