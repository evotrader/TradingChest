// @vitest-environment jsdom
import {expect,it} from 'vitest'
import {fibonacciLevelPrice,fibonacciLevelFigures} from '../fibonacciLevels'
import {resolveDrawingLevels,type DrawingLevelSet} from '../../drawing/levels'
import {builtinDrawingCatalog,drawingToolDefinition} from '../../drawing/catalog'
import {drawingFigureHit} from '../../drawing/hitTest'

const args=(kind='fibonacciLine',parameters:Record<string,unknown>={},axis='normal',reverse=false):any=>({
 chart:{getLocale:()=> 'zh-CN',getSymbol:()=>({pricePrecision:2}),getStyles:()=>({overlay:{line:{color:'#123456',size:2,style:'solid',dashedValue:[3,3]},text:{color:'#abcdef',size:12},polygon:{color:'#000000'}}})},
 overlay:{name:kind,points:(kind==='fibonacciLine'?[10,20]:[10,20,30]).map((value,index)=>({value,timestamp:index*100})),styles:{line:{size:3}},extendData:{drawingParameters:parameters}},
 coordinates:[{x:30,y:10},{x:90,y:20},...(kind==='fibonacciExtension'?[{x:160,y:30}]:[])],bounding:{width:300,height:200},
 yAxis:{name:axis,convertToPixel:(value:number)=>reverse?200-value:axis==='logarithm'?Math.log(value)*20:value},
})
const lines=(figures:any[])=>figures.filter(figure=>figure.key?.startsWith('fibonacci-level:'))
const labels=(figures:any[])=>figures.filter(figure=>figure.key?.startsWith('fibonacci-label:'))

it('uses independent retracement and extension value-domain oracles in both calculation modes',()=>{
 for(const reverse of [false,true]){
  expect([0,.5,1,2,-1].map(r=>fibonacciLevelPrice('fibonacciLine',[10,20],r,'linear',reverse))).toEqual(reverse?[10,15,20,30,0]:[20,15,10,0,30])
  expect([0,.5,1,2,-1].map(r=>fibonacciLevelPrice('fibonacciExtension',[10,20,30],r,'linear',reverse))).toEqual(reverse?[30,25,20,10,40]:[30,35,40,50,20])
  expect(fibonacciLevelPrice('fibonacciLine',[10,100],.5,'log',reverse)).toBeCloseTo(Math.sqrt(1000),12)
  expect(fibonacciLevelPrice('fibonacciExtension',[10,20,100],.5,'log',reverse)).toBeCloseTo(reverse?100/Math.sqrt(2):100*Math.sqrt(2),12)
 }
 for(const values of [[0,10],[-1,10]])expect(()=>fibonacciLevelPrice('fibonacciLine',values,.5,'log',false)).toThrow('大于零')
 expect(()=>fibonacciLevelPrice('fibonacciLine',[10,100],1e308,'log',false)).toThrow('有限');expect(()=>fibonacciLevelPrice('fibonacciLine',[10,100],-1e308,'log',false)).toThrow('有限')
})
it('keeps calculation mode independent from native log, percentage and reversed axis projections',()=>{
 for(const name of ['normal','percentage','logarithm'])for(const reverse of [false,true]){
  const value=args('fibonacciLine',{levels:[0,.5,1]},name,reverse),before=structuredClone(value.overlay),figures=fibonacciLevelFigures(value,'fibonacciLine')
  expect(lines(figures).map(figure=>figure.attrs.coordinates[0].y)).toEqual([20,15,10].map(price=>value.yAxis.convertToPixel(price)));expect(value.overlay).toEqual(before)
 }
})
it('retains original default line extents and extension guide, clips segments and aligns labels',()=>{
 let value=args('fibonacciLine',{levels:[0,.5,1]});expect(lines(fibonacciLevelFigures(value,'fibonacciLine'))[0].attrs.coordinates).toEqual([{x:0,y:20},{x:300,y:20}])
 value=args('fibonacciExtension',{levels:[0,.5,1]});let figures=fibonacciLevelFigures(value,'fibonacciExtension');expect(lines(figures)[0].attrs.coordinates).toEqual([{x:90,y:30},{x:160,y:30}]);expect(figures.find(figure=>figure.key==='fibonacci-guide')!.attrs).toEqual({coordinates:value.coordinates})
 value=args('fibonacciLine',{levels:[0,.5,1],extendLeft:false,extendRight:false,levelLabelAlign:'right',levelLabelPosition:'below'});figures=fibonacciLevelFigures(value,'fibonacciLine');expect(lines(figures)[0].attrs.coordinates).toEqual([{x:30,y:20},{x:90,y:20}]);expect(labels(figures)[0].attrs).toMatchObject({x:90,y:20,align:'right',baseline:'top',width:60})
 value.coordinates[0].x=-10;expect(lines(fibonacciLevelFigures(value,'fibonacciLine'))[0].attrs.coordinates[0].x).toBe(0)
 value=args('fibonacciExtension',{levels:[0]});value.coordinates[2].x=value.coordinates[1].x;expect(labels(fibonacciLevelFigures(value,'fibonacciExtension'))[0].attrs.width).toBeUndefined()
})
it('keeps hidden levels out of both paint and native hit geometry, while fills ignore all events',()=>{
 const levels=resolveDrawingLevels([0,.5,1]);levels.items[1].visible=false;levels.items[0].text='单行正文';levels.items[2].color='#ff0000';levels.items[2].width=4;levels.items[2].style='dotted'
 const value=args('fibonacciLine',{levels,backgroundVisible:true,backgroundOpacity:.2}),before=structuredClone(levels),figures=fibonacciLevelFigures(value,'fibonacciLine')
 expect(lines(figures)).toHaveLength(2);expect(labels(figures)).toHaveLength(2);expect(figures.some(figure=>figure.key?.includes(levels.items[1].id))).toBe(false)
 expect(lines(figures)[0].styles).toMatchObject({color:'#123456',size:3});expect(lines(figures)[1].styles).toMatchObject({color:'#ff0000',size:4,style:'dashed',dashedValue:[1,3]});expect(labels(figures)[0].attrs.text).toBe('20.00 (0.0%) 单行正文')
 const fills=figures.filter(figure=>figure.type==='polygon');expect(fills).toHaveLength(1);expect(fills[0].styles).toMatchObject({color:'#12345633',style:'fill'});expect(fills[0].ignoreEvent).toBe(true);expect(drawingFigureHit({x:100,y:15},fills,{},null,'onRightClick')).toBe(false);expect(levels).toEqual(before)
 for(const item of levels.items)item.visible=false;expect(fibonacciLevelFigures(args('fibonacciLine',{levels}),'fibonacciLine')).toEqual([]);expect(fibonacciLevelFigures(args('fibonacciExtension',{levels}),'fibonacciExtension')).toEqual([])
})
it('sorts price bands under reverse axes, skips duplicate bands, clips fills and applies opacity once',()=>{
 const levels=resolveDrawingLevels([2,0,.5,.5,1,-1]),value=args('fibonacciLine',{levels,backgroundVisible:true,backgroundOpacity:.5},'normal',true)
 value.overlay.styles.polygon={color:'#aabbcc'};const figures=fibonacciLevelFigures(value,'fibonacciLine'),fills=figures.filter(figure=>figure.type==='polygon');expect(fills).toHaveLength(4)
 for(const figure of fills){expect(figure.ignoreEvent).toBe(true);expect(figure.styles).toMatchObject({color:'#aabbcc80'});expect(figure.attrs.coordinates.every((point:any)=>point.x>=0&&point.x<=300&&point.y>=0&&point.y<=200)).toBe(true)}
})
it('preserves definitions and reports invalid enabled projections without painting fake values',()=>{
 const levels=resolveDrawingLevels([0,2]),value=args('fibonacciLine',{levels},'logarithm'),before=structuredClone(levels),figures=fibonacciLevelFigures(value,'fibonacciLine')
 expect(lines(figures)).toHaveLength(1);expect(figures.some(figure=>figure.key==='fibonacci-warning')).toBe(true);expect(levels).toEqual(before)
 levels.items[1].visible=false;expect(fibonacciLevelFigures(value,'fibonacciLine').some(figure=>figure.key==='fibonacci-warning')).toBe(false)
 value.overlay.points[0].value=0;value.overlay.extendData.drawingParameters.calculationMode='log';expect(lines(fibonacciLevelFigures(value,'fibonacciLine'))).toHaveLength(0)
 const extreme=args('fibonacciLine',{levels:[1e308]});extreme.overlay.points[0].value=20;expect(labels(fibonacciLevelFigures(extreme,'fibonacciLine'))[0].attrs.text).not.toContain('Infinity')
})
it('honors host-declared defaults, arbitrary extra parameters and old capability omissions',()=>{
 const original=builtinDrawingCatalog.find(tool=>tool.toolId==='fibonacciLine')!,value=args()
 value[drawingToolDefinition]={...original,parameters:[{key:'levels',label:'旧级别',kind:'levels',defaultValue:[-1,.25,2]},{key:'hostValue',label:'宿主字段',kind:'number',defaultValue:2}]};value.overlay.extendData.drawingParameters={hostValue:2}
 expect(lines(fibonacciLevelFigures(value,'fibonacciLine')).map(figure=>figure.attrs.coordinates[0].y)).toEqual([30,17.5,0])
 value[drawingToolDefinition]={...original,parameters:[{key:'levels',label:'外观默认',kind:'level-set',defaultValue:{version:1,items:[{value:.25,visible:true,color:'#123456'},{value:.75,visible:false}]}}]};value.overlay.extendData.drawingParameters={};expect(lines(fibonacciLevelFigures(value,'fibonacciLine'))).toHaveLength(1);expect(lines(fibonacciLevelFigures(value,'fibonacciLine'))[0].styles.color).toBe('#123456')
 value[drawingToolDefinition]={...original,parameters:[]};value.overlay.extendData.drawingParameters={};expect(lines(fibonacciLevelFigures(value,'fibonacciLine'))).toHaveLength(7)
})
it('uses the actual native line hit test without granting selection to a hidden middle level',()=>{
 const levels=resolveDrawingLevels([0,.5,1]);levels.items[1].visible=false;const value=args('fibonacciLine',{levels});value.overlay.points[1].value=110
 const figures=fibonacciLevelFigures(value,'fibonacciLine');expect(drawingFigureHit({x:150,y:60},figures,{},null,'onRightClick')).toBe(false);expect(drawingFigureHit({x:150,y:110},figures,{},null,'onRightClick')).toBe(true)
})
