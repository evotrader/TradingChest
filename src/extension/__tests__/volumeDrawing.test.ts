import {describe,it,expect} from 'vitest'
import type {Chart,KLineData,Overlay,OverlayCreateFiguresCallbackParams} from 'klinecharts'
import {DrawingAnalyticsRuntime,drawingAnalyticsRuntimes} from '../../drawing/analyticsRuntime'
import {volumeDrawingFigures} from '../volumeDrawing'

function setup(name:string,bars:KLineData[]){
  const chart={getVisibleRange:()=>({from:0,to:bars.length-1}),getSymbol:()=>({pricePrecision:2}),getBarSpace:()=>({bar:8})} as unknown as Chart
  const runtime=new DrawingAnalyticsRuntime()
  runtime.sync({symbol:{ticker:'ISOLATED'},period:{multiplier:1,timespan:'minute',text:'1m'},epoch:1,revision:1,contentRevision:1,confirmed:true,replay:false},bars)
  drawingAnalyticsRuntimes.set(chart,runtime)
  const overlay={id:'a',name,points:(name==='anchoredVwap'?[bars[0]]:[bars[0],bars.at(-1)!]).map(b=>({timestamp:b.timestamp,value:b.close})),styles:{},extendData:null} as Overlay
  const args={chart,overlay,coordinates:overlay.points.map(()=>({x:299,y:10})),bounding:{width:300,height:100},xAxis:{convertToPixel:(i:number)=>i*10},yAxis:{name:'normal',convertToPixel:(value:number)=>value}} as unknown as OverlayCreateFiguresCallbackParams<unknown>
  return {runtime,chart,args}
}
const bar=(timestamp:number,close:number,volume:number|undefined):KLineData=>({timestamp,open:close,high:close,low:close,close,volume})
describe('volume drawing projection',()=>{
  it('keeps the valid VWAP prefix and reports an invalid tail without forward filling',()=>{
    const {args}=setup('anchoredVwap',[bar(1,10,1),bar(2,20,1),bar(3,30,undefined)]),figures=volumeDrawingFigures(args)
    expect(figures.find(f=>f.type==='line')?.attrs).toEqual({coordinates:[{x:0,y:10},{x:10,y:15}]})
    expect(figures.some(f=>f.type==='rectText'&&JSON.stringify(f.attrs).includes('无效'))).toBe(true)
  })
  it('keeps a flat one-bar profile inside the pane and combines coincident labels',()=>{
    const {args}=setup('fixedRangeVolumeProfile',[bar(1,10,100)]),figures=volumeDrawingFigures(args),rect=figures.find(f=>f.type==='rect')!.attrs as {x:number;width:number;height:number}
    expect(rect.x).toBeGreaterThanOrEqual(0);expect(rect.x+rect.width).toBeLessThanOrEqual(300);expect(rect.width).toBeGreaterThanOrEqual(24);expect(rect.height).toBeGreaterThanOrEqual(2)
    expect(figures.filter(f=>f.type==='rectText'&&JSON.stringify(f.attrs).includes('POC'))).toHaveLength(1)
  })
})
