import type {OverlayTemplate,OverlayCreateFiguresCallbackParams,OverlayFigure,Coordinate} from 'klinecharts'
import {drawingAnalyticsRuntimes} from '../drawing/analyticsRuntime'
import {canProjectAxisValue} from './numerics'
import {vwapBandOptions} from '../drawing/vwapBands'
import {drawingParameters} from '../drawing/content'

export function volumeDrawingFigures(args:OverlayCreateFiguresCallbackParams<unknown>):OverlayFigure[]{
  const {chart,overlay,coordinates,bounding,xAxis,yAxis}=args
  if(!coordinates.length)return []
  const runtime=drawingAnalyticsRuntimes.get(chart)
  const message=(text:string):OverlayFigure[]=>[{type:'rectText',ignoreEvent:true,attrs:{x:Math.max(4,coordinates[0].x),y:Math.max(20,Math.min(bounding.height-20,coordinates[0].y)),text,baseline:'bottom'},styles:{color:'#d97706'}}]
  if(!runtime||!xAxis||!yAxis)return message('行情尚未确认')
  const result=runtime.forOverlay(overlay),state=result.state,figures:OverlayFigure[]=[]
  if(state.status==='calculating')return message(state.reason??'正在计算')
  if(!state.summary&&!result.point)return message(state.reason??'当前无法计算')
  const y=(value:number)=>{if(!canProjectAxisValue(yAxis,value))throw Error('当前价格轴无法显示此结果，请切换线性轴或使用正值区间');return yAxis.convertToPixel(value)}
  const format=(value:number)=>value.toFixed(chart.getSymbol()?.pricePrecision??2)
  try{
    if(overlay.name==='anchoredVwap'&&result.point){
      const range=chart.getVisibleRange(),from=Math.max(result.from,Math.floor(range.from)-1),to=Math.min(result.to,Math.ceil(range.to)+1)
      let line:Coordinate[]=[]
      const flush=()=>{if(line.length>1)figures.push({type:'line',attrs:{coordinates:line}});else if(line.length===1)figures.push({type:'circle',attrs:{...line[0],r:3}});line=[]}
      for(let i=from;i<=to;i++){const point=result.point(i);if(point.value===undefined){flush();continue}line.push({x:xAxis.convertToPixel(i),y:y(point.value)})}
      flush()
      if(to>=from){const point=result.point(to);if(point.value!==undefined)figures.push({type:'rectText',attrs:{x:xAxis.convertToPixel(to),y:y(point.value),text:`AVWAP ${format(point.value)} · ${drawingParameters(overlay.extendData)?.source??'hlc3'} · OHLCV 估算`,baseline:'bottom',align:'right'},styles:{color:overlay.styles?.line?.color??'#1677ff'}})}
      if(result.band){
        const options=vwapBandOptions(drawingParameters(overlay.extendData)??{}),bands:OverlayFigure[]=[],warnings=new Set<string>(),samples=[]
        for(let i=from;i<=to;i++){
          const point=result.point(i),band=result.band(i),project=(value:number|undefined)=>{
            if(value===undefined)return undefined
            try{return y(value)}catch{warnings.add('部分 VWAP 带边界不适用于当前价格轴，请切换线性轴或调整倍数');return undefined}
          }
          if(band?.reason)warnings.add(band.reason)
          samples.push({x:xAxis.convertToPixel(i),center:project(point.value),values:band?.values.map(value=>({...value,lower:project(value.lower),upper:project(value.upper)}))??[]})
        }
        const multiples=[...options.multipliers].sort((a,b)=>a-b),color=overlay.styles?.line?.color??'#1677ff'
        const fillColor=/^#[a-f0-9]{6}$/i.test(color)?`${color}${Math.round(options.opacity*255).toString(16).padStart(2,'0')}`:`color-mix(in srgb, ${color} ${options.opacity*100}%, transparent)`
        for(let group=0;group<multiples.length;group++){
          for(const side of ['upper','lower'] as const){
            let line:Coordinate[]=[],outer:Coordinate[]=[],inner:Coordinate[]=[]
            const flushLine=()=>{if(line.length>1)bands.push({type:'line',attrs:{coordinates:line}});line=[]}
            const flushFill=()=>{if(outer.length>1)bands.push({type:'polygon',ignoreEvent:true,attrs:{coordinates:[...outer,...inner.reverse()]},styles:{style:'fill',color:fillColor}});outer=[];inner=[]}
            for(const sample of samples){
              const value=sample.values.find(value=>value.multiplier===multiples[group])?.[side],previous=group?sample.values.find(value=>value.multiplier===multiples[group-1])?.[side]:sample.center
              if(value===undefined)flushLine();else line.push({x:sample.x,y:value})
              if(!options.fill||options.opacity===0||value===undefined||previous===undefined)flushFill();else{outer.push({x:sample.x,y:value});inner.push({x:sample.x,y:previous})}
            }
            flushLine();flushFill()
          }
        }
        figures.unshift(...bands.filter(figure=>figure.type==='polygon'));figures.push(...bands.filter(figure=>figure.type!=='polygon'))
        if(warnings.size)figures.push(...message([...warnings].join('；')))
      }
    }else if(result.profile){
      const profile=result.profile,parameters=drawingParameters(overlay.extendData)??{},anchorX=Math.min(...coordinates.map(p=>p.x)),last=Math.max(...coordinates.map(p=>p.x)),side=parameters.profileSide??'left',fraction=Number(parameters.profileWidth??.3),extent=parameters.levelExtent??'profile'
      if(!['left','right'].includes(String(side))||!Number.isFinite(fraction)||fraction<=0||fraction>1||!['profile','range','pane-right'].includes(String(extent)))throw Error('成交量分布显示参数无效')
      const width=Math.min(bounding.width,Math.max(24,Math.max(last-anchorX,chart.getBarSpace().bar)*fraction)),first=Math.max(0,Math.min(side==='right'?last-width:anchorX,bounding.width-width)),maximum=Math.max(...profile.bins.map(bin=>bin.volume))
      for(let i=0;i<profile.bins.length;i++){
        const bin=profile.bins[i],a=y(bin.lower),b=y(bin.upper),top=Math.min(a,b),height=Math.max(2,Math.abs(a-b)),barWidth=bin.volume/maximum*width,left=side==='right'?first+width-barWidth:first
        const color=i>=profile.vaFrom&&i<=profile.vaTo?(overlay.styles?.line?.color??'#1677ff'):'#94a3b8'
        if(drawingParametersMode(overlay.extendData)==='up-down'){
          const upWidth=bin.volume?barWidth*bin.up/bin.volume:0
          figures.push({type:'rect',attrs:[{x:left,y:top-(height-Math.abs(a-b))/2,width:upWidth,height}],styles:{style:'fill',color:'#16a34a'}},{type:'rect',attrs:[{x:left+upWidth,y:top-(height-Math.abs(a-b))/2,width:barWidth-upWidth,height}],styles:{style:'fill',color:'#dc2626'}})
        }else figures.push({type:'rect',attrs:{x:left,y:top-(height-Math.abs(a-b))/2,width:barWidth,height},styles:{style:'fill',color}})
      }
      const lineFrom=extent==='range'?Math.max(0,Math.min(bounding.width,anchorX)):first,lineTo=extent==='profile'?first+width:extent==='range'?Math.max(0,Math.min(bounding.width,last)):bounding.width
      const labels=new Map<number,{names:string[];color:string}>()
      for(const [name,value] of [['poc',profile.poc],['vah',profile.vah],['val',profile.val]] as const){
        const title=name[0].toUpperCase()+name.slice(1);if(parameters[`show${title}`]===false)continue
        const position=y(value),color=String(parameters[`${name}Color`]??(name==='poc'?'#f59e0b':'#64748b')),size=Number(parameters[`${name}Width`]??1),style=String(parameters[`${name}Style`]??(name==='poc'?'solid':'dashed'))
        if(!/^#[a-f0-9]{6}(?:[a-f0-9]{2})?$|^transparent$/i.test(color)||!Number.isFinite(size)||size<1||size>4||!['solid','dashed','dotted'].includes(style))throw Error('成交量分布价位线样式无效')
        figures.push({type:'line',attrs:{coordinates:[{x:lineFrom,y:position},{x:lineTo,y:position}]},styles:{color,size,style:style==='solid'?'solid':'dashed',dashedValue:style==='dotted'?[1,3]:[6,4]}})
        const group=labels.get(value);if(group)group.names.push(name.toUpperCase());else labels.set(value,{names:[name.toUpperCase()],color})
      }
      const text=[...labels].map(([value,label])=>({value,...label,y:y(value)})).sort((a,b)=>a.y-b.y)
      for(let i=0;i<text.length;i++)text[i].y=Math.max(8,Math.min(bounding.height-8,text[i].y),i?text[i-1].y+16:8)
      for(let i=text.length-1;i>=0;i--)text[i].y=Math.min(text[i].y,i===text.length-1?bounding.height-8:text[i+1].y-16)
      for(const label of text)figures.push({type:'rectText',attrs:{x:Math.min(bounding.width-4,Math.max(4,lineTo)),y:label.y,text:`${label.names.join(' / ')} ${format(label.value)}`,align:'right',baseline:'middle'},styles:{color:label.color,...overlay.styles?.text}})
      figures.push({type:'rectText',ignoreEvent:true,attrs:{x:first,y:Math.max(16,Math.min(...profile.bins.map(bin=>y(bin.upper)))-8),text:`OHLCV 估算 · ${profile.bins.length} 行 · VA ${(profile.valueArea*100).toFixed(1)}%`,baseline:'bottom'},styles:{color:overlay.styles?.text?.color??'#64748b'}})
    }
    if(state.status==='stale'||state.status==='unavailable'||state.replayPartial)figures.push(...message(state.reason??'回放区间尚未完整'))
    return figures
  }catch(error){return message(error instanceof Error?error.message:String(error))}
}
function drawingParametersMode(data:unknown):unknown{return data&&typeof data==='object'&&'drawingParameters' in data?(data.drawingParameters as Record<string,unknown>)?.mode:undefined}
export function volumeDrawingTemplate(name:string,points:number):OverlayTemplate{return {name,totalStep:points+1,needDefaultPointFigure:true,needDefaultXAxisFigure:false,needDefaultYAxisFigure:false,styles:{line:{color:'#1677ff',size:2}},createPointFigures:volumeDrawingFigures}}
