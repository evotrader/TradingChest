import type {OverlayTemplate,OverlayCreateFiguresCallbackParams,OverlayFigure,Coordinate} from 'klinecharts'
import {drawingAnalyticsRuntimes} from '../drawing/analyticsRuntime'
import {canProjectAxisValue} from './numerics'

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
      if(to>=from){const point=result.point(to);if(point.value!==undefined)figures.push({type:'rectText',attrs:{x:xAxis.convertToPixel(to),y:y(point.value),text:`AVWAP ${format(point.value)} · ${state.summary?.source??'hlc3'} · OHLCV 估算`,baseline:'bottom',align:'right'},styles:{color:overlay.styles?.line?.color??'#1677ff'}})}
    }else if(result.profile){
      const profile=result.profile,anchorX=Math.min(...coordinates.map(p=>p.x)),last=Math.max(...coordinates.map(p=>p.x))
      const width=Math.min(bounding.width,Math.max(24,Math.max(last-anchorX,chart.getBarSpace().bar)*.3)),first=Math.max(0,Math.min(anchorX,bounding.width-width)),maximum=Math.max(...profile.bins.map(bin=>bin.volume))
      for(let i=0;i<profile.bins.length;i++){
        const bin=profile.bins[i],a=y(bin.lower),b=y(bin.upper),top=Math.min(a,b),height=Math.max(2,Math.abs(a-b)),barWidth=bin.volume/maximum*width
        const color=i>=profile.vaFrom&&i<=profile.vaTo?(overlay.styles?.line?.color??'#1677ff'):'#94a3b8'
        if(drawingParametersMode(overlay.extendData)==='up-down'){
          const upWidth=bin.volume?barWidth*bin.up/bin.volume:0
          figures.push({type:'rect',attrs:[{x:first,y:top-(height-Math.abs(a-b))/2,width:upWidth,height}],styles:{style:'fill',color:'#16a34a'}},{type:'rect',attrs:[{x:first+upWidth,y:top-(height-Math.abs(a-b))/2,width:barWidth-upWidth,height}],styles:{style:'fill',color:'#dc2626'}})
        }else figures.push({type:'rect',attrs:{x:first,y:top-(height-Math.abs(a-b))/2,width:barWidth,height},styles:{style:'fill',color}})
      }
      const levels:Array<[string,number]>=profile.vah===profile.val?[['POC / VAH / VAL',profile.poc]]:[['POC',profile.poc],['VAH',profile.vah],['VAL',profile.val]]
      for(const [name,value] of levels){const position=y(value),poc=name.startsWith('POC');figures.push({type:'line',attrs:{coordinates:[{x:first,y:position},{x:first+width,y:position}]},styles:{color:poc?'#f59e0b':'#64748b',style:poc?'solid':'dashed'}},{type:'rectText',attrs:{x:Math.min(bounding.width-4,Math.max(160,first+width)),y:position,text:`${name} ${format(value)}`,align:'right',baseline:'middle'},styles:{color:poc?'#f59e0b':'#64748b'}})}
      figures.push({type:'rectText',ignoreEvent:true,attrs:{x:first,y:Math.max(16,Math.min(...profile.bins.map(bin=>y(bin.upper)))-8),text:`OHLCV 估算 · ${profile.bins.length} 行 · VA ${(profile.valueArea*100).toFixed(1)}%`,baseline:'bottom'},styles:{color:overlay.styles?.text?.color??'#64748b'}})
    }
    if(state.status==='stale'||state.status==='unavailable'||state.replayPartial)figures.push(...message(state.reason??'回放区间尚未完整'))
    return figures
  }catch(error){return message(error instanceof Error?error.message:String(error))}
}
function drawingParametersMode(data:unknown):unknown{return data&&typeof data==='object'&&'drawingParameters' in data?(data.drawingParameters as Record<string,unknown>)?.mode:undefined}
export function volumeDrawingTemplate(name:string,points:number):OverlayTemplate{return {name,totalStep:points+1,needDefaultPointFigure:true,needDefaultXAxisFigure:false,needDefaultYAxisFigure:false,styles:{line:{color:'#1677ff',size:2}},createPointFigures:volumeDrawingFigures}}
