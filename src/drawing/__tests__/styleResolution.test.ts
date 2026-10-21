import {describe,it,expect} from 'vitest'
import {drawingStyleInput,drawingStyleValue,templateStylePatch} from '../styleControls'
import type {DrawingSnapshot} from '../types'
import callout from '../../extension/callout'

const drawing=(styles:any):DrawingSnapshot=>({logicalId:'custom',owner:'local',overlay:{id:'custom',name:'PEER/Shape',points:[],styles,extendData:null,lock:false,visible:true}})
describe('generic semantic style resolution',()=>{
 it.each(['polygon','circle','rect'])('maps explicit %s border styles without relying on a tool name',group=>{
  const styles={[group]:{borderColor:'#f44336',borderSize:5,borderStyle:'dashed',borderDashedValue:[1,3]}}
  const patch=templateStylePatch(styles,['stroke','lineWidth','lineStyle'])
  expect(patch.line).toEqual({color:'#f44336',size:5,style:'dashed',dashedValue:[1,3]})
  expect(drawingStyleValue(drawing(styles),'stroke')).toBe('#f44336')
  expect(drawingStyleValue(drawing(styles),'lineWidth')).toBe(5)
 })
 it('keeps missing source fields absent and text separate',()=>{
  expect(templateStylePatch({polygon:{borderColor:'#f44336'}},['stroke','lineWidth','lineStyle'])).not.toHaveProperty('line.size')
  expect(templateStylePatch({},['lineWidth','lineStyle','fontSize'])).toEqual({})
  expect(templateStylePatch({text:{color:'#123456',size:18}},['textColor','fontSize','stroke'])).toEqual({text:{color:'#123456',size:18}})
 })
 it('preserves heterogeneous groups and complete dash patterns without inventing a common value',()=>{
  const styles={line:{color:'#123456',size:2,style:'dashed',dashedValue:[6,4]},polygon:{borderColor:'#f44336',borderSize:5,borderStyle:'dashed',borderDashedValue:[1,3]}} as any
  expect(templateStylePatch(styles,['stroke','lineWidth','lineStyle'])).toEqual(styles)
  expect(drawingStyleValue(drawing(styles),'stroke')).toBeUndefined()
  expect(drawingStyleValue(drawing(styles),'lineStyle')).toBeUndefined()
  expect(templateStylePatch({line:{style:'dashed',dashedValue:[8,2]}},['lineStyle']).polygon).toEqual({borderStyle:'dashed',borderDashedValue:[8,2]})
 })
 it('reads only the actual figure groups and retains real noninteractive fills and text',()=>{
  const doc=drawing(null),resolved={line:{color:'#123456',size:1},polygon:{borderColor:'#f44336',borderSize:5,color:'#abcdef'},text:{color:'#112233',size:18}} as any
  const figures=[{type:'polygon',ignoreEvent:true,styles:{style:'fill'}},{type:'text',ignoreEvent:true}]
  expect(drawingStyleValue(doc,'fill',resolved,figures)).toBe('#abcdef')
  expect(drawingStyleValue(doc,'textColor',resolved,figures)).toBe('#112233')
  expect(drawingStyleValue(doc,'fontSize',resolved,figures)).toBe(18)
  expect(drawingStyleValue(doc,'stroke',resolved,[{type:'polygon'}])).toBe('#f44336')
 })
 it('reads inherited editable main styles without confusing fixed auxiliary lines',()=>{
  const figures=[{type:'line'},{type:'line',ignoreEvent:true,styles:{color:'#94a3b8',size:1,style:'dashed'}}]
  expect(drawingStyleValue(drawing(null),'lineWidth',{line:{size:2,style:'solid'}},figures)).toBe(2)
  expect(drawingStyleValue(drawing(null),'lineStyle',{line:{size:2,style:'solid'}},figures)).toBe('solid')
  expect(drawingStyleValue(drawing({line:{size:4}}),'lineWidth',{line:{size:2}},figures)).toBe(4)
 })
 it('does not read borders from fill-only figures or fills from stroke-only figures',()=>{
  const styles={line:{color:'#f44336',size:4},polygon:{borderColor:'#1677ff',borderSize:1,color:'#abcdef'}} as any
  const figures=[{type:'polygon',styles:{style:'fill'}},{type:'line'}]
  expect(drawingStyleValue(drawing({line:{color:'#f44336',size:4}}),'stroke',styles,figures)).toBe('#f44336')
  expect(drawingStyleValue(drawing({line:{color:'#f44336',size:4}}),'lineWidth',styles,figures)).toBe(4)
  expect(drawingStyleValue(drawing(null),'fill',styles,[{type:'polygon',styles:{style:'stroke'}}])).toBeUndefined()
 })
 it('reads the real callout background without treating its fixed anchor dot as editable fill',()=>{
  const doc=drawing(null),figures=callout.createPointFigures!({coordinates:[{x:10,y:10},{x:40,y:40}],overlay:doc.overlay} as any)
  expect(drawingStyleValue(doc,'fill',{},figures as any)).toBe('rgba(22, 119, 255, 0.15)')
 })
 it('reads an analytical figure input and lets a draft override its cached rendered value',()=>{
  const figures=[{type:'rect',styles:{style:'fill',color:'#94a3b8'},[drawingStyleInput]:{stroke:{group:'line',fields:{color:'#1677ff'}}}}]
  expect(drawingStyleValue(drawing(null),'stroke',{line:{color:'#00ff00'}},figures)).toBe('#1677ff')
  expect(drawingStyleValue(drawing({line:{color:'#f44336'}}),'stroke',{line:{color:'#00ff00'}},figures)).toBe('#f44336')
 })
 it.each([
  {line:{style:'dashed',dashedValue:[6,4]},polygon:{borderDashedValue:[1,3]}},
  {line:{dashedValue:[1,3]},polygon:{borderStyle:'dashed',borderDashedValue:[6,4]}}
 ])('preserves conflicting explicit partial dash fields: %j',styles=>{
  expect(templateStylePatch(styles as any,['lineStyle'])).toEqual(styles)
 })
 it('maps solid templates without discarding their saved inactive dash pattern',()=>{
  expect(templateStylePatch({line:{style:'solid',dashedValue:[6,4]}},['lineStyle']).polygon).toEqual({borderStyle:'solid',borderDashedValue:[6,4]})
 })
 it('keeps a partial group partial even when its dash happens to match another group',()=>{
  const styles={line:{style:'dashed',dashedValue:[6,4]},polygon:{borderDashedValue:[6,4]}} as any
  expect(templateStylePatch(styles,['lineStyle'])).toEqual(styles)
 })
})
