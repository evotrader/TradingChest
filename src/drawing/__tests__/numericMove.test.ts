import {describe,it,expect,vi} from 'vitest'
import Decimal from 'decimal.js'
import {numericMoveDrawings,numericMoveIsZero} from '../numericMove'
import {builtinDrawingCatalog} from '../catalog'
import {DrawingController} from '../controller'
import {DrawingHistory} from '../history'
import type {DrawingAnchor,DrawingSnapshot,DrawingCommand,DrawingCommitResult} from '../types'
const times=[Date.UTC(2026,9,23,3,29),Date.UTC(2026,9,23,3,30),Date.UTC(2026,9,23,5),Date.UTC(2026,9,23,7),Date.UTC(2026,9,26,1,30)]
const bars=times.map(timestamp=>({timestamp,open:10,high:12,low:9,close:11})),period={multiplier:1,timespan:'minute',text:'1m'}
const context={bars,period,tickSize:.1,defaultAxisId:'main',tool:(name:string)=>builtinDrawingCatalog.find(tool=>tool.overlayName===name)}
const value=(id='a',name='segment'):DrawingSnapshot=>({logicalId:id,owner:'local',anchors:[{kind:'market',timestamp:times[1],value:.1},{kind:'market',timestamp:times[2],value:.2}],overlay:{id,name,paneId:'candle_pane',groupId:'drawing_tools',points:[{timestamp:times[1],value:.1},{timestamp:times[2],value:.2}],lock:false,visible:true,styles:null,extendData:{text:'retained'}}})
type Command=Extract<DrawingCommand,{type:'translate'}>
describe('precise market bars and decimal price translation',()=>{
  it('crosses lunch and weekend gaps by actual bars, with decimal tick arithmetic',()=>{
    const input=value(),original=structuredClone(input),[after]=numericMoveDrawings([input],{type:'translate',ids:['a'],bars:1,price:{unit:'tick',amount:2}},context)
    expect(after.anchors).toEqual([{kind:'market',timestamp:times[2],value:.3},{kind:'market',timestamp:times[3],value:.4}]);expect(input).toEqual(original)
    const [weekend]=numericMoveDrawings([after],{type:'translate',ids:['a'],bars:1},context)
    expect(weekend.anchors!.map(anchor=>'timestamp' in anchor?anchor.timestamp:undefined)).toEqual([times[3],times[4]])
    const [back]=numericMoveDrawings([after],{type:'translate',ids:['a'],bars:-1,price:{unit:'tick',amount:-2}},context)
    expect(back.anchors).toEqual(original.anchors)
  })
  it('retains bar fractions and preserves exact canonical time fields on price-only requests',()=>{
    const input=value();input.anchors![0]={kind:'market',timestamp:times[1],value:10,interpolation:{nextTimestamp:times[2],fraction:.25}}
    const [after]=numericMoveDrawings([input],{type:'translate',ids:['a'],bars:1},context),anchor=after.anchors![0] as Extract<DrawingAnchor,{kind:'market'}>
    expect(anchor.timestamp).toBe(times[2]);expect(anchor.interpolation?.nextTimestamp).toBe(times[3]);expect(anchor.interpolation?.fraction).toBeCloseTo(.25,9)
    const [price]=numericMoveDrawings([input],{type:'translate',ids:['a'],price:{unit:'price',amount:.25}},context)
    expect(price.anchors![0]).toEqual({...input.anchors![0],value:10.25})
  })
  it('does not depend on or change the host decimal configuration',()=>{
    const saved={precision:Decimal.precision,rounding:Decimal.rounding}
    try{Decimal.set({precision:2,rounding:Decimal.ROUND_DOWN});const input=value();(input.anchors![0] as any).value=.12345
      expect((numericMoveDrawings([input],{type:'translate',ids:['a'],price:{unit:'price',amount:.00001}},context)[0].anchors![0] as any).value).toBe(.12346)
      expect(Decimal.precision).toBe(2);expect(Decimal.rounding).toBe(Decimal.ROUND_DOWN)
    }finally{Decimal.set(saved)}
  })
  it('rejects an entire out-of-history or mixed-axis/pane/scope batch without mutating inputs',()=>{
    const a=value(),b=value('b');b.anchors![1]={kind:'market',timestamp:times[4],value:2}
    const original=structuredClone([a,b]);expect(()=>numericMoveDrawings([a,b],{type:'translate',ids:['a','b'],bars:1},context)).toThrow('已加载');expect([a,b]).toEqual(original)
    for(const patch of [{yAxisId:'other'},{overlay:{...b.overlay,paneId:'other'}},{presentation:{scope:'host' as const}}])expect(()=>numericMoveDrawings([a,{...value('b'),...patch}],{type:'translate',ids:['a','b'],price:{unit:'price',amount:1}},context)).toThrow('同一')
    expect(numericMoveDrawings([a,{...value('b'),yAxisId:'main'}],{type:'translate',ids:['a','b'],price:{unit:'price',amount:1}},context)).toHaveLength(2)
  })
  it('enforces the four time-only tools and explicit third-party capabilities',()=>{
    for(const name of ['anchoredVwap','fixedRangeVolumeProfile','regressionTrend','regressionChannel']){
      const input=value('a',name)
      input.anchors=input.anchors!.slice(0,context.tool(name)!.minPoints);input.overlay.points=input.overlay.points.slice(0,input.anchors.length)
      expect(numericMoveDrawings([input],{type:'translate',ids:['a'],bars:1},context)[0].anchors![0]).toMatchObject({timestamp:times[2],value:.1})
      expect(()=>numericMoveDrawings([input],{type:'translate',ids:['a'],price:{unit:'price',amount:1}},context)).toThrow('不支持')
    }
    expect(()=>numericMoveDrawings([value('a','anchoredText')],{type:'translate',ids:['a'],bars:1},context)).toThrow('不支持')
    const custom={...context.tool('segment')!,overlayName:'HostVolume',category:'volume' as const,numericMove:undefined}
    expect(()=>numericMoveDrawings([value('a','HostVolume')],{type:'translate',ids:['a'],bars:1},{...context,tool:()=>custom})).toThrow('不支持')
    expect(numericMoveDrawings([value('a','HostVolume')],{type:'translate',ids:['a'],price:{unit:'price',amount:1}},{...context,tool:()=>({...custom,numericMove:{bars:true,price:true}})})[0].anchors![0]).toMatchObject({value:1.1})
  })
  it('refuses unsupported anchors, missing references, invalid units, unsafe counts and unknown ticks',()=>{
    for(const anchor of [{kind:'viewport',x:.5,y:.5},{kind:'logical',referenceTimestamp:times[1],offsetBars:0,period,value:1}]){
      const input=value();input.anchors=[anchor as DrawingAnchor];expect(()=>numericMoveDrawings([input],{type:'translate',ids:['a'],bars:1},context)).toThrow('市场时间')
    }
    for(const patch of [{bars:.5},{bars:Infinity},{bars:Number.MAX_SAFE_INTEGER+1},{price:{unit:'tick',amount:.5}},{price:{unit:'price',amount:NaN}},{price:{unit:'unknown',amount:1}},{price:null},{}])expect(()=>numericMoveIsZero({type:'translate',ids:['a'],...patch} as any)).toThrow()
    for(const tickSize of [undefined,0,-.1,Infinity])expect(()=>numericMoveDrawings([value()],{type:'translate',ids:['a'],price:{unit:'tick',amount:1}},{...context,tickSize})).toThrow('tickSize')
    const input=value();input.anchors![0]={kind:'market',timestamp:times[0]-1,value:1};expect(()=>numericMoveDrawings([input],{type:'translate',ids:['a'],bars:1},context)).toThrow('历史')
    expect(()=>numericMoveDrawings([input],{type:'translate',ids:['a'],price:{unit:'price',amount:1}},context)).toThrow('历史')
  })
})
function setup(owner:'local'|'backend'='backend'){
  let revision=1,commitHook:(()=>void)|undefined,resultMode:'confirmed'|'uncertain'='confirmed'
  const commits=vi.fn(async(change:any):Promise<DrawingCommitResult>=>{commitHook?.();return resultMode==='uncertain'?{status:'uncertain',message:'unknown'}:{status:'confirmed',snapshot:change.after}})
  const history=new DrawingHistory({context:()=>({symbol:{ticker:'A'},period}),apply:(_id,value)=>value,commit:commits})
  const inputs=['a','b','c'].map(id=>({...value(id),owner,...(owner==='backend'?{backendId:`backend-${id}`}:{})}));history.reconcile(owner,inputs)
  const controller=new DrawingController({history,editable:d=>!d.overlay.lock,validate:d=>{if(d.anchors?.some(anchor=>'value' in anchor&&anchor.value<=0))throw Error('log axis')},create:()=>{},cancel:()=>{},project:()=>{},owner:()=>owner,captureTranslation:()=>{const captured=revision;return ()=>{if(captured!==revision)throw Error('alignment changed')}},translateNumeric:(objects,command)=>numericMoveDrawings(objects,command,context)})
  return {history,controller,commits,inputs,revise:()=>revision++,hook:(callback:()=>void)=>{commitHook=callback},uncertain:()=>{resultMode='uncertain'}}
}
describe('numeric translation uses the original complete preflight and serial writer',()=>{
  it('cancels a queued translation when alignment changes before it starts',async()=>{
    const s=setup();let release!:()=>void
    const gate=new Promise<void>(resolve=>{release=resolve})
    s.commits.mockImplementationOnce(async change=>{await gate;return {status:'confirmed',snapshot:change.after}})
    const first=s.controller.execute({type:'update',ids:['a'],patch:{text:'blocking write'}})
    await vi.waitFor(()=>expect(s.commits).toHaveBeenCalledTimes(1))
    const queued=s.controller.execute({type:'translate',ids:['a'],bars:1});s.revise();release();await first
    expect(await queued).toMatchObject({status:'rejected',message:'alignment changed'});expect(s.commits).toHaveBeenCalledTimes(1)
    expect(s.history.getDrawing('a')!.anchors).toEqual(s.inputs[0].anchors)
    await s.controller.travel('undo');expect(s.history.getState().canUndo).toBe(false)
  })
  it('retains a valid prepared batch through an ordinary tail append with unchanged alignment',async()=>{
    const s=setup();let appended=false
    s.hook(()=>{if(!appended){appended=true;bars.push({...bars.at(-1)!,timestamp:times.at(-1)!+60000})}})
    try{expect((await s.controller.execute({type:'translate',ids:['a','b','c'],bars:1})).status).toBe('completed');expect(s.commits).toHaveBeenCalledTimes(3)}finally{if(appended)bars.pop()}
  })
  it('commits all objects as one undo and makes an explicit zero request a true no-op',async()=>{
    const s=setup();expect((await s.controller.execute({type:'translate',ids:['a','b','c'],bars:0,price:{unit:'price',amount:0}})).status).toBe('completed');expect(s.commits).not.toHaveBeenCalled();expect(s.history.getState().canUndo).toBe(false)
    expect((await s.controller.execute({type:'translate',ids:['a','b','c'],bars:1,price:{unit:'price',amount:1}})).status).toBe('completed');expect(s.commits).toHaveBeenCalledTimes(3)
    await s.controller.travel('undo');expect(s.history.getDrawings()).toEqual(s.inputs);expect(s.history.getState().canUndo).toBe(false)
  })
  it('rejects an invalid later object or nonpositive log price before any external write',async()=>{
    const s=setup(),second=s.history.getDrawing('b')!;second.overlay.name='regressionChannel';s.history.reconcile('backend',[s.inputs[0],second,s.inputs[2]])
    expect((await s.controller.execute({type:'translate',ids:['a','b','c'],price:{unit:'price',amount:1}})).status).toBe('rejected');expect(s.commits).not.toHaveBeenCalled();expect(s.history.getState().canUndo).toBe(false)
    expect((await s.controller.execute({type:'translate',ids:['a'],price:{unit:'price',amount:-10}})).status).toBe('rejected');expect(s.commits).not.toHaveBeenCalled()
  })
  it('preserves the confirmed prefix and unattempted suffix when alignment changes after a confirmation',async()=>{
    const s=setup();s.hook(()=>s.revise())
    const result=await s.controller.execute({type:'translate',ids:['a','b','c'],bars:1})
    expect(result.status).toBe('partial');expect(result.items.map(item=>item.status)).toEqual(['confirmed','rejected','not-attempted']);expect(s.commits).toHaveBeenCalledTimes(1)
    expect(s.history.getDrawing('a')!.anchors![0]).toMatchObject({timestamp:times[2]});expect(s.history.getDrawing('b')).toEqual(s.inputs[1])
  })
  it('does not retry unknown confirmations or attempt the remainder',async()=>{
    const s=setup();s.uncertain();const result=await s.controller.execute({type:'translate',ids:['a','b'],bars:1})
    expect(result.status).toBe('uncertain');expect(result.items.map(item=>item.status)).toEqual(['uncertain','not-attempted']);expect(s.commits).toHaveBeenCalledTimes(1);expect(s.history.getDrawings()).toEqual(s.inputs)
  })
})
