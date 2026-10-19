import {describe,it,expect} from 'vitest'
import {marketIndex,constrainedPoint,translatedDrawing} from '../geometry'
import {snappedPoint} from '../snap'
import type {DrawingSnapshot} from '../types'
const bars=[10,20,80].map(timestamp=>({timestamp,open:1,high:2,low:1,close:2}))
describe('drawing geometry and visible-source snapping',()=>{
 it('projects actual irregular market instants fractionally without changing their identity',()=>{expect(marketIndex(50,bars)).toBe(1.5);expect(marketIndex(20,bars)).toBe(1);expect(()=>marketIndex(81,bars)).toThrow('回放范围')})
 it('constrains screen angles and square bounds independently of financial values',()=>{expect(constrainedPoint({x:0,y:0},{x:100,y:10}).y).toBe(0);expect(constrainedPoint({x:5,y:10},{x:-5,y:40},true)).toEqual({x:-25,y:40})})
 it('keeps weak snapping local and strong snapping precise, excludes non-finite values',()=>{
  const candidates=[{value:10,label:'MA',source:'indicator' as const},{value:NaN,label:'gap',source:'indicator' as const}],point={timestamp:20,value:11}
  expect(snappedPoint(point,11,candidates,'weak_magnet',v=>v).point.value).toBe(10)
  expect(snappedPoint(point,30,candidates,'weak_magnet',v=>v).candidate).toBeUndefined()
  expect(snappedPoint(point,30,candidates,'strong_magnet',v=>v).candidate?.label).toBe('MA')
  expect(snappedPoint(point,11,candidates,'normal',v=>v).point).toEqual(point)
 })
 it('moves a viewport anchor in normalized coordinates without inventing market time',()=>{
  const before:DrawingSnapshot={logicalId:'a',owner:'local',overlay:{id:'a',name:'anchoredText',groupId:'drawing_tools',points:[{timestamp:20,value:1}],styles:null,extendData:'text',visible:true,lock:false},anchors:[{kind:'viewport',x:.5,y:.5}]}
  const after=translatedDrawing(before,20,-10,{bars,period:{multiplier:1,timespan:'day',text:'1D'},size:()=>({width:100,height:100}),toPixel:()=>({x:0,y:0}),fromPixel:()=>({timestamp:10,value:1}),project:()=>[{timestamp:20,value:1}]})
  expect(after.anchors).toEqual([{kind:'viewport',x:.7,y:.4}]);expect(before.anchors).toEqual([{kind:'viewport',x:.5,y:.5}])
 })
})
