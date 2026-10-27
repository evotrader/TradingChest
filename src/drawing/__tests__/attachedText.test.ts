import {describe,it,expect} from 'vitest'
import {builtinDrawingCatalog,copyDrawingCatalog,type DrawingToolDescriptor} from '../catalog'
import {attachedTextFigures} from '../attachedText'
import {drawingText,withDrawingText} from '../text'
import {DrawingHistory} from '../history'
import {DrawingController} from '../controller'
import {valueChannelFigures} from '../../extension/valueChannel'
import type {DrawingSnapshot} from '../types'
import type {OverlayFigure} from 'klinecharts'

const tool=(name:string)=>builtinDrawingCatalog.find(tool=>tool.overlayName===name)!
const drawing=():DrawingSnapshot=>({logicalId:'label',owner:'local',anchors:[{kind:'market',timestamp:1,value:10},{kind:'market',timestamp:2,value:20}],parameters:{labelVisible:true},overlay:{id:'label',name:'segment',paneId:'candle_pane',groupId:'drawing_tools',points:[{timestamp:1,value:10},{timestamp:2,value:20}],lock:false,visible:true,styles:{text:{color:'#123456',size:18}},extendData:{text:'支撑\n等待',metadata:{source:'host'}}}})
const line:OverlayFigure={type:'line',attrs:{coordinates:[{x:-100,y:50},{x:300,y:50}]}}
describe('attached text declarative capability and original body',()=>{
  it('keeps 56 tools, declares exactly seven attached tools and the reviewed movement capabilities',()=>{
    expect(builtinDrawingCatalog).toHaveLength(56)
    expect(builtinDrawingCatalog.filter(tool=>tool.textMode==='attached').map(tool=>tool.toolId).sort()).toEqual(['horizontalStraightLine','straightLine','segment','rayLine','parallelStraightLine','priceChannelLine','rect'].sort())
    expect(builtinDrawingCatalog.filter(tool=>tool.textMode==='body')).toHaveLength(4)
    expect(builtinDrawingCatalog.filter(tool=>tool.numericMove?.price)).toHaveLength(51)
    for(const name of ['anchoredVwap','fixedRangeVolumeProfile','regressionTrend','regressionChannel'])expect(tool(name).numericMove).toEqual({bars:true,price:false})
    expect(tool('anchoredText').numericMove).toEqual({bars:false,price:false})
  })
  it('gives a third-party declaration the same controls without mutating its descriptor',()=>{
    const custom:DrawingToolDescriptor={...tool('segment'),toolId:'host-line',overlayName:'HostLine',parameters:[],settings:['style'],styleControls:['stroke']}
    const catalog=copyDrawingCatalog([custom]);expect(custom.parameters).toEqual([])
    expect(catalog[0].settings).toContain('text');expect(catalog[0].styleControls).toContain('textColor')
    expect(catalog[0].parameters.map(parameter=>parameter.key)).toEqual(['labelVisible','labelAlign','labelPosition'])
    catalog[0].numericMove!.price=false;expect(custom.numericMove?.price).toBe(true)
    for(const patch of [{labelGeometry:undefined},{textMode:'body'},{numericMove:{bars:true}},{numericMove:{bars:true,price:true,extra:true}}])expect(()=>copyDrawingCatalog([{...custom,...patch} as any])).toThrow()
    const legacy={...custom};delete legacy.textMode;delete legacy.labelGeometry;delete legacy.numericMove
    expect(copyDrawingCatalog([legacy])[0].settings).not.toContain('text')
  })
  it('preserves all JSON metadata and refuses to replace an attached array or primitive',async()=>{
    const content={text:'old',metadata:{identity:'opaque'}},next=withDrawingText(content,'new',true)
    expect(next).toEqual({text:'new',metadata:{identity:'opaque'}});expect(content.text).toBe('old')
    expect(drawingText(next)).toBe('new');expect(withDrawingText(null,'first',true)).toBe('first')
    for(const invalid of [[],1,false])expect(()=>withDrawingText(invalid,'lost',true)).toThrow('原有内容')
    const before=drawing();before.overlay.extendData=['must','retain']
    const history=new DrawingHistory({context:()=>({symbol:{ticker:'A'},period:{multiplier:1,timespan:'minute',text:'1m'}}),apply:(_id,value)=>value})
    history.reconcile('local',[before]);const controller=new DrawingController({history,editable:()=>true,validate:()=>{},create:()=>{},cancel:()=>{},project:()=>{},owner:()=> 'local'})
    expect((await controller.execute({type:'update',ids:['label'],patch:{text:'new'}})).status).toBe('rejected')
    expect(history.getDrawings()).toEqual([before]);expect(history.getState().canUndo).toBe(false)
  })
  it('updates only the body through the command and undoes it in one step without changing anchors',async()=>{
    const before=drawing(),history=new DrawingHistory({context:()=>({symbol:{ticker:'A'},period:{multiplier:1,timespan:'minute',text:'1m'}}),apply:(_id,value)=>value})
    history.reconcile('local',[before]);const controller=new DrawingController({history,editable:()=>true,validate:()=>{},create:()=>{},cancel:()=>{},project:()=>{},owner:()=> 'local'})
    expect((await controller.execute({type:'update',ids:['label'],patch:{text:'new'}})).status).toBe('completed')
    expect(history.getDrawings()[0]).toMatchObject({anchors:before.anchors,parameters:{labelVisible:true},overlay:{extendData:{text:'new',metadata:{source:'host'}}}})
    await controller.travel('undo');expect(history.getDrawings()).toEqual([before])
  })
})
describe('labels use actual reference figures',()=>{
  it('uses all 65 native channel points and clips an initially offscreen path',()=>{
    for(const name of ['parallelStraightLine','priceChannelLine']){
      const d=drawing();d.overlay.name=name;d.overlay.points=[{dataIndex:0,value:10},{dataIndex:100,value:10},{dataIndex:50,value:20}]
      const args={overlay:{points:d.overlay.points},coordinates:[{x:0,y:10},{x:100,y:10},{x:50,y:20}],bounding:{width:640,height:480},xAxis:{convertToPixel:(x:number)=>x,convertFromPixel:(x:number)=>x},yAxis:{name:'normal',convertToPixel:(y:number)=>y},chart:{getDataList:()=>[]}}
      const geometry=valueChannelFigures(args as any,name==='parallelStraightLine'?'parallel':'channel') as OverlayFigure[]
      expect((geometry[0].attrs as any[])[0].coordinates).toHaveLength(65)
      expect((attachedTextFigures(geometry,tool(name),d,args.bounding).at(-1)!.attrs as any).x).toBeCloseTo(320)
      d.parameters={labelVisible:true,labelAlign:'right'};expect((attachedTextFigures(geometry,tool(name),d,args.bounding).at(-1)!.attrs as any).x).toBeCloseTo(640)
      d.parameters={labelVisible:true};args.overlay.points[0].value=-20;args.overlay.points[1].value=80
      const clipped=valueChannelFigures(args as any,name==='parallelStraightLine'?'parallel':'channel') as OverlayFigure[]
      expect((attachedTextFigures(clipped,tool(name),d,args.bounding).at(-1)!.attrs as any).x).toBeCloseTo(260)
    }
  })
  it('clips the first flattened line, aligns multiline text and leaves the original geometry intact',()=>{
    const d=drawing(),figures=[{...line,attrs:[line.attrs,{coordinates:[{x:0,y:80},{x:200,y:80}]}]}] as OverlayFigure[]
    const result=attachedTextFigures(figures,tool('segment'),d,{width:200,height:100})
    expect(result[0]).toBe(figures[0]);expect(result[1]).toMatchObject({type:'rectText',attrs:{x:100,y:42,text:'支撑\n等待',align:'center',baseline:'bottom'},styles:{color:'#123456',size:18}})
    d.parameters={labelVisible:true,labelAlign:'right',labelPosition:'below'}
    expect(attachedTextFigures([line],tool('segment'),d,{width:200,height:100})[1]).toMatchObject({attrs:{x:200,y:58,baseline:'top',align:'right'}})
  })
  it('orders a vertical reference by screen y and uses the rectangle polygon boundary',()=>{
    const d=drawing();d.parameters={labelVisible:true,labelAlign:'left',labelPosition:'on'}
    expect(attachedTextFigures([{type:'line',attrs:{coordinates:[{x:50,y:200},{x:50,y:-100}]}}],tool('segment'),d,{width:200,height:100})[1]).toMatchObject({attrs:{x:50,y:0,baseline:'middle'}})
    const polygon:OverlayFigure={type:'polygon',attrs:{coordinates:[{x:150,y:80},{x:20,y:80},{x:20,y:30},{x:150,y:30}]}}
    expect(attachedTextFigures([polygon],tool('rect'),d,{width:200,height:100})[1]).toMatchObject({attrs:{x:20,y:55}})
  })
  it('does not invent geometry for old, empty, incomplete, hidden or offscreen drawings',()=>{
    const d=drawing();delete d.parameters
    expect(attachedTextFigures([line],tool('segment'),d,{width:200,height:100})).toHaveLength(1)
    d.parameters={labelVisible:true};d.overlay.extendData='';expect(attachedTextFigures([line],tool('segment'),d,{width:200,height:100})).toHaveLength(1)
    d.overlay.extendData='visible';d.overlay.points=[];expect(attachedTextFigures([line],tool('segment'),d,{width:200,height:100})).toHaveLength(1)
    d.overlay.points=[{timestamp:1,value:10},{timestamp:2,value:20}]
    expect(attachedTextFigures([{type:'line',attrs:{coordinates:[{x:0,y:-10},{x:200,y:-10}]}}],tool('segment'),d,{width:200,height:100})).toHaveLength(1)
  })
})
