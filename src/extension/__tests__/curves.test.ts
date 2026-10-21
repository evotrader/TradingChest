import {describe,it,expect} from 'vitest'
import type {Coordinate,OverlayCreateFiguresCallbackParams} from 'klinecharts'
import curves,{bezierCoordinates,arcCoordinates,curveGeometry,clearCurveGeometry,curveSelection} from '../curves'
const distance=(p:Coordinate,a:Coordinate,b:Coordinate)=>{const x=b.x-a.x,y=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*x+(p.y-a.y)*y)/(x*x+y*y)||0));return Math.hypot(p.x-a.x-t*x,p.y-a.y-t*y)}
const toLine=(point:Coordinate,line:Coordinate[])=>Math.min(...line.slice(1).map((b,i)=>distance(point,line[i],b)))
const quadratic=(a:Coordinate,c:Coordinate,b:Coordinate,t:number)=>({x:(1-t)**2*a.x+2*(1-t)*t*c.x+t*t*b.x,y:(1-t)**2*a.y+2*(1-t)*t*c.y+t*t*b.y})
const cubic=(a:Coordinate,c:Coordinate,d:Coordinate,b:Coordinate,t:number)=>({x:(1-t)**3*a.x+3*(1-t)**2*t*c.x+3*(1-t)*t*t*d.x+t**3*b.x,y:(1-t)**3*a.y+3*(1-t)**2*t*c.y+3*(1-t)*t*t*d.y+t**3*b.y})
const args=(name='curve')=>({chart:{},overlay:{id:'a',name,currentStep:-1},coordinates:[{x:0,y:0},{x:100,y:0},{x:50,y:100},{x:50,y:-100}].slice(0,name==='doubleCurve'?4:3),bounding:{width:400,height:300},xAxis:{getRange:()=>({from:0,to:100})},yAxis:{name:'normal',getRange:()=>({from:0,to:100})}} as unknown as OverlayCreateFiguresCallbackParams<unknown>)
describe('bounded screen-space drawing curves',()=>{
 it('bounds independent quadratic and cubic samples within half a CSS pixel, including backtracking',()=>{
  for(const points of [[{x:10,y:20},{x:70,y:300},{x:300,y:40}],[{x:10,y:20},{x:400,y:500},{x:-300,y:-200},{x:300,y:40}],[{x:0,y:0},{x:300,y:0},{x:-200,y:0},{x:1,y:0}]]){
   const line=bezierCoordinates(points);expect(line.length-1).toBeLessThanOrEqual(2048);expect(line[0]).toEqual(points[0]);expect(line.at(-1)).toEqual(points.at(-1))
   for(let i=0;i<=2000;i++){const p=points.length===3?quadratic(points[0],points[1],points[2],i/2000):cubic(points[0],points[1],points[2],points[3],i/2000);expect(toLine(p,line)).toBeLessThanOrEqual(.500000001)}
  }
 })
 it('passes through the third circle point in either direction, a major arc and subpixel circles',()=>{
  for(const [radius,c,end] of [[100,{x:0,y:100},{x:-100,y:0}],[100,{x:0,y:-100},{x:-100,y:0}],[100,{x:-100,y:0},{x:0,y:100}],[.1,{x:0,y:.1},{x:-.1,y:0}]] as Array<[number,Coordinate,Coordinate]>){
   const a={x:radius,y:0},line=arcCoordinates([a,end,c]);expect(line[0]).toEqual(a);expect(line.at(-1)).toEqual(end);expect(line).toContainEqual(c);expect(line.length-1).toBeLessThanOrEqual(2048)
   for(const p of line)expect(Math.abs(Math.hypot(p.x,p.y)-radius)).toBeLessThan(1e-10)
   for(let i=1;i<line.length;i++){const middle={x:(line[i-1].x+line[i].x)/2,y:(line[i-1].y+line[i].y)/2};expect(radius-Math.hypot(middle.x,middle.y)).toBeLessThanOrEqual(.500000001)}
  }
 })
 it('reports degenerate, nonfinite and over-budget geometry without a fake segment',()=>{
  for(const points of [[{x:0,y:0},{x:1,y:1},{x:2,y:2}],[{x:0,y:0},{x:0,y:0},{x:1,y:1}],[{x:NaN,y:0},{x:1,y:2},{x:2,y:3}]])expect(()=>arcCoordinates(points)).toThrow()
  expect(()=>bezierCoordinates([{x:0,y:0},{x:1e9,y:1e9},{x:2e9,y:0}])).toThrow('2048')
  expect(()=>arcCoordinates([{x:1e9,y:0},{x:-1e9,y:0},{x:0,y:1e9}])).toThrow('2048')
  const value=args('arc');value.coordinates=[{x:0,y:0},{x:1,y:1},{x:2,y:2}];const figures=curves[2].createPointFigures!(value);expect(JSON.stringify(figures)).toContain('共线');expect(JSON.stringify(figures)).not.toContain('"type":"line"')
 })
 it('uses the public click order and one native line for both rendering and hit testing',()=>{
  for(const [name,count] of [['curve',3],['doubleCurve',4]] as const){
   const value=args(name),template=curves.find(item=>item.name===name)!,figures=[template.createPointFigures!(Object.assign(value,{[curveSelection]:true}))].flat()
   expect(template.totalStep).toBe(count+1);expect(figures).toHaveLength(2);expect(figures[0].type).toBe('line');expect(figures[0].ignoreEvent).toBeUndefined();expect(figures[1].ignoreEvent).toBe(true)
   const line=(figures[0].attrs as any).coordinates;expect(line[0]).toEqual(value.coordinates[0]);expect(line.at(-1)).toEqual(value.coordinates[1])
   const without=[template.createPointFigures!(Object.assign(value,{[curveSelection]:false}))].flat();expect(without).toHaveLength(1)
  }
 })
 it('reuses geometry for hover and invalidates on projection, axis, viewport and explicit disposal',()=>{
  const value=args(),first=curveGeometry(value);expect(curveGeometry(value)).toBe(first)
  value.bounding.width++;const resized=curveGeometry(value);expect(resized).not.toBe(first)
  value.coordinates[2].y++;const moved=curveGeometry(value);expect(moved).not.toBe(resized)
  value.yAxis!.name='logarithm';const axis=curveGeometry(value);expect(axis).not.toBe(moved)
  clearCurveGeometry(value.chart,'a');expect(curveGeometry(value)).not.toBe(axis);const next=curveGeometry(value);clearCurveGeometry(value.chart);expect(curveGeometry(value)).not.toBe(next)
 })
})
