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
  it('labels a surviving valid prefix with its actual non-default source despite a bad tail',()=>{
    const data=[1,2,3,4].map((n,i)=>({timestamp:n,open:n*10,high:n*10+2,low:n*10-2,close:n*10+2,volume:i===3?undefined:1}))
    const {chart,args}=setup('anchoredVwap',data)
    chart.getVisibleRange=()=>({from:0,to:1} as ReturnType<Chart['getVisibleRange']>)
    args.overlay.extendData={drawingParameters:{source:'close'}}
    expect(volumeDrawingFigures(args).some(f=>f.type==='rectText'&&JSON.stringify(f.attrs).includes('AVWAP 22.00 · close'))).toBe(true)
  })
})

describe('refined volume drawing display',()=>{
 it('draws six independent boundaries and adjacent fill strips without changing the center',()=>{
  const {args}=setup('anchoredVwap',[bar(1,10,1),bar(2,20,1),bar(3,30,1)])
  args.overlay.extendData={drawingParameters:{source:'close',bandMode:'standard-deviation',bandMultipliers:[1,2,3]}}
  const figures=volumeDrawingFigures(args),lines=figures.filter(figure=>figure.type==='line'),fills=figures.filter(figure=>figure.type==='polygon')
  expect(lines).toHaveLength(7);expect(lines[0].attrs).toEqual({coordinates:[{x:0,y:10},{x:10,y:15},{x:20,y:20}]});expect(fills).toHaveLength(6)
  expect(fills.every(figure=>figure.ignoreEvent)).toBe(true)
 })
 it('keeps the center and visible upper bounds when logarithmic lower bounds are not projectable',()=>{
  const {args}=setup('anchoredVwap',[bar(1,10,1),bar(2,20,1)])
  args.yAxis!.name='logarithm';args.overlay.extendData={drawingParameters:{bandMode:'percentage',bandMultipliers:[100]}}
  const figures=volumeDrawingFigures(args)
  expect(figures.filter(figure=>figure.type==='line')).toHaveLength(2)
  expect(figures.some(figure=>figure.type==='rectText'&&JSON.stringify(figure.attrs).includes('部分 VWAP 带边界'))).toBe(true)
  expect(JSON.stringify(figures)).not.toMatch(/NaN|Infinity/)
 })
 it('changes only profile position, width and level presentation',()=>{
  const {args,runtime}=setup('fixedRangeVolumeProfile',[bar(1,10,100),bar(2,20,100)])
  args.coordinates=[{x:50,y:10},{x:250,y:20}]
  const base=runtime.forOverlay(args.overlay).profile
  args.overlay.extendData={drawingParameters:{profileSide:'right',profileWidth:.5,levelExtent:'pane-right',showVah:false,pocColor:'#f44336',pocWidth:3,pocStyle:'dotted'}}
  const figures=volumeDrawingFigures(args),rects=figures.filter(figure=>figure.type==='rect').map(figure=>figure.attrs as {x:number;width:number}),lines=figures.filter(figure=>figure.type==='line')
  expect(runtime.forOverlay(args.overlay).profile).toBe(base);expect(Math.max(...rects.map(rect=>rect.x+rect.width))).toBe(250)
  expect(lines).toHaveLength(2);expect(lines.every(line=>(line.attrs as any).coordinates[1].x===300)).toBe(true)
  expect(lines.find(line=>(line.styles as any).color==='#f44336')?.styles).toMatchObject({size:3,dashedValue:[1,3]})
  expect(figures.filter(figure=>figure.type==='rectText').some(figure=>JSON.stringify(figure.attrs).includes('VAH'))).toBe(false)
 })
})
