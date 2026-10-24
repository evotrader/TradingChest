import type {Chart,Coordinate,OverlayTemplate,OverlayCreateFiguresCallbackParams,OverlayFigure} from 'klinecharts'
import {drawingParameters} from '../drawing/content'
import {drawingStyleAuxiliary,drawingStyleInput,type DrawingStyleFigure} from '../drawing/styleControls'

export const curveSelection=Symbol('drawing-curve-selection')
export const isCurveDrawing=(name:string)=>['curve','doubleCurve','arc'].includes(name)
const tolerance=.5,maximumSegments=2048
const finite=(point:Coordinate)=>!!point&&Number.isFinite(point.x)&&Number.isFinite(point.y)
const midpoint=(a:Coordinate,b:Coordinate):Coordinate=>({x:a.x/2+b.x/2,y:a.y/2+b.y/2})
const distanceToSegment=(point:Coordinate,a:Coordinate,b:Coordinate)=>{
 const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)
 if(!Number.isFinite(length))throw Error('曲线坐标超出可表示范围')
 if(!length)return Math.hypot(point.x-a.x,point.y-a.y)
 const t=Math.max(0,Math.min(1,(point.x-a.x)/length*(dx/length)+(point.y-a.y)/length*(dy/length)))
 return Math.hypot(point.x-(a.x+dx*t),point.y-(a.y+dy*t))
}
/** Convex-hull flatness bounds the screen-space error to the same hit-tested line. */
export function bezierCoordinates(points:Coordinate[]):Coordinate[]{
 if(![3,4].includes(points.length)||points.some(point=>!finite(point)))throw Error('曲线需要有限的完整控制点')
 const stack=[{points,depth:0}],line:Coordinate[]=[points[0]]
 while(stack.length){
  const current=stack.pop()!,p=current.points,last=p.at(-1)!,error=Math.max(...p.slice(1,-1).map(point=>distanceToSegment(point,p[0],last)))
  if(!Number.isFinite(error))throw Error('曲线坐标无法投影')
  if(error<=tolerance){line.push(last);if(line.length-1>maximumSegments)throw Error('曲线超过2048段，无法满足0.5px精度，请缩小范围');continue}
  if(current.depth>=40||line.length+stack.length>=maximumSegments+1)throw Error('曲线超过2048段或数值精度不足，请调整控制点')
  const levels=[p];while(levels.at(-1)!.length>1){const level=levels.at(-1)!;levels.push(level.slice(1).map((point,index)=>midpoint(level[index],point)))}
  const left=levels.map(level=>level[0]),right=levels.map(level=>level.at(-1)!).reverse()
  stack.push({points:right,depth:current.depth+1},{points:left,depth:current.depth+1})
 }
 return line
}
const tau=Math.PI*2,angle=(value:number)=>(value%tau+tau)%tau
/** Three projected points define a circle; the path always passes through the third. */
export function arcCoordinates([a,b,c]:Coordinate[]):Coordinate[]{
 if(!a||!b||!c||![a,b,c].every(finite))throw Error('圆弧需要三个有限控制点')
 const scale=Math.max(Math.abs(b.x-a.x),Math.abs(b.y-a.y),Math.abs(c.x-a.x),Math.abs(c.y-a.y))
 if(!scale||!Number.isFinite(scale))throw Error('圆弧控制点重合或超出可表示范围')
 const ux=(b.x-a.x)/scale,uy=(b.y-a.y)/scale,vx=(c.x-a.x)/scale,vy=(c.y-a.y)/scale,det=2*(ux*vy-uy*vx)
 if(Math.abs(det)<=Number.EPSILON*32)throw Error('圆弧控制点共线或过于接近，请移动第三点')
 const u2=ux*ux+uy*uy,v2=vx*vx+vy*vy,cx=a.x+scale*(vy*u2-uy*v2)/det,cy=a.y+scale*(ux*v2-vx*u2)/det,radius=Math.hypot(a.x-cx,a.y-cy)
 if(![cx,cy,radius].every(Number.isFinite)||Number.EPSILON*(Math.abs(cx)+Math.abs(cy)+radius)>.05)throw Error('圆弧数值精度不足，请调整控制点')
 const start=Math.atan2(a.y-cy,a.x-cx),end=angle(Math.atan2(b.y-cy,b.x-cx)-start),through=angle(Math.atan2(c.y-cy,c.x-cx)-start),sweep=through<=end?end:end-tau,middle=sweep>0?through:through-tau
 const maxAngle=4*Math.asin(Math.sqrt(Math.min(1,tolerance/radius/2))),counts=[Math.max(1,Math.ceil(Math.abs(middle)/maxAngle)),Math.max(1,Math.ceil(Math.abs(sweep-middle)/maxAngle))]
 if(!counts.every(Number.isFinite)||counts[0]+counts[1]>maximumSegments)throw Error('圆弧超过2048段，无法满足0.5px精度，请缩小范围')
 const line:Coordinate[]=[a]
 for(const [from,to,steps,last] of [[0,middle,counts[0],c],[middle,sweep,counts[1],b]] as Array<[number,number,number,Coordinate]>){
  for(let i=1;i<=steps;i++){const theta=start+from+(to-from)*i/steps,point=i===steps?last:{x:cx+radius*Math.cos(theta),y:cy+radius*Math.sin(theta)};if(!finite(point))throw Error('圆弧坐标无法投影');line.push(point)}
 }
 return line
}
interface Geometry {coordinates?:Coordinate[];reason?:string}
const cache=new WeakMap<Chart,Map<string,{key:string;geometry:Geometry}>>()
/** Internal lifecycle probe; not exported by the public package entries. */
export const hasCurveGeometry=(chart:Chart):boolean=>cache.has(chart)
export function clearCurveGeometry(chart:Chart,id?:string):void{if(id===undefined)cache.delete(chart);else cache.get(chart)?.delete(id)}
export function curveGeometry(args:OverlayCreateFiguresCallbackParams<unknown>):Geometry{
 const {chart,overlay,coordinates,bounding,xAxis,yAxis}=args
 let entries=cache.get(chart);if(!entries){entries=new Map();cache.set(chart,entries)}
 const key=JSON.stringify([overlay.name,coordinates,bounding.width,bounding.height,xAxis?.getRange(),yAxis?.name,yAxis?.getRange(),typeof window==='undefined'?1:window.devicePixelRatio]),previous=entries.get(overlay.id)
 if(previous?.key===key)return previous.geometry
 let geometry:Geometry
 try{geometry={coordinates:overlay.name==='arc'?arcCoordinates(coordinates):bezierCoordinates(overlay.name==='curve'?[coordinates[0],coordinates[2],coordinates[1]]:[coordinates[0],coordinates[2],coordinates[3],coordinates[1]])}}
 catch(error){geometry={reason:error instanceof Error?error.message:String(error)}}
 if(entries.size>=2048)entries.delete(entries.keys().next().value!)
 entries.set(overlay.id,{key,geometry});return geometry
}
/** Decorations reuse the exact bounded curve, without changing its subdivision cache. */
export function curveDecorations(args:OverlayCreateFiguresCallbackParams<unknown>,line:Coordinate[]):{background:OverlayFigure[];markers:OverlayFigure[]}{
 const parameters=drawingParameters(args.overlay.extendData)??{},background:Array<OverlayFigure&DrawingStyleFigure>=[],markers:Array<OverlayFigure&DrawingStyleFigure>=[]
 const defaults=args.chart.getStyles?.().overlay.line,own=args.overlay.styles?.line,color=own?.color??defaults?.color??'#1677ff',width=own?.size??defaults?.size??2,size=Math.max(6,Math.min(18,3*width))
 const opacity=parameters.backgroundOpacity??.12
 if(parameters.background===true&&typeof opacity==='number'&&Number.isFinite(opacity)&&opacity>0&&opacity<=1&&line.length>2){
  const fill=args.overlay.styles?.polygon?.color??color
  if(typeof fill==='string'){
   const paint=/^#[a-f0-9]{6}$/i.test(fill)?`${fill}${Math.round(opacity*255).toString(16).padStart(2,'0')}`:`color-mix(in srgb, ${fill} ${opacity*100}%, transparent)`
   background.push({type:'polygon',ignoreEvent:true,attrs:{coordinates:line},styles:{style:'fill',color:paint},[drawingStyleInput]:{fill:{group:'polygon',fields:{color:fill}}}})
  }else background.push({type:'rectText',ignoreEvent:true,attrs:{x:8,y:20,text:'曲线透明背景需要纯色，请选择填充颜色',baseline:'top'},styles:{color:'#ef5350'}})
 }
 for(const [side,kind] of [['start',parameters.startMarker],['end',parameters.endMarker]] as const){
  if(kind!=='arrow'&&kind!=='circle')continue
  const tip=side==='start'?line[0]:line.at(-1),neighbors=side==='start'?line.slice(1):line.slice(0,-1).reverse(),neighbor=tip&&neighbors.find(point=>point.x!==tip.x||point.y!==tip.y)
  if(!tip||!neighbor||!Number.isFinite(size))continue
  if(kind==='circle')markers.push({type:'circle',attrs:{x:tip.x,y:tip.y,r:size/2},styles:{style:'fill',color},[drawingStyleAuxiliary]:true})
  else{
   const distance=Math.hypot(tip.x-neighbor.x,tip.y-neighbor.y),dx=(tip.x-neighbor.x)/distance,dy=(tip.y-neighbor.y)/distance
   const left={x:tip.x-dx*size-dy*size*.45,y:tip.y-dy*size+dx*size*.45},right={x:tip.x-dx*size+dy*size*.45,y:tip.y-dy*size-dx*size*.45}
   if([tip,left,right].every(finite))markers.push({type:'polygon',attrs:{coordinates:[tip,left,right]},styles:{style:'fill',color},[drawingStyleAuxiliary]:true})
  }
 }
 return {background,markers}
}
function curveTemplate(name:string,points:number):OverlayTemplate{return {name,totalStep:points+1,needDefaultPointFigure:true,needDefaultXAxisFigure:true,needDefaultYAxisFigure:true,styles:{line:{size:2}},createPointFigures:args=>{
 const {overlay,coordinates}=args,selected=(args as typeof args&{[curveSelection]?:boolean})[curveSelection]??overlay.currentStep>0,figures:OverlayFigure[]=[]
 if(coordinates.length<points)return coordinates.length>1?[{type:'line',ignoreEvent:true,attrs:{coordinates},styles:{style:'dashed'}}]:[]
 const geometry=curveGeometry(args)
 if(geometry.coordinates){const decorations=curveDecorations(args,geometry.coordinates);figures.push(...decorations.background,{type:'line',attrs:{coordinates:geometry.coordinates}},...decorations.markers)}
 else figures.push({type:'rectText',ignoreEvent:true,attrs:{x:8,y:20,text:geometry.reason??'曲线无法投影',baseline:'top'},styles:{color:'#ef5350'}})
 if(selected&&name!=='arc')figures.push({type:'line',ignoreEvent:true,attrs:{coordinates:name==='curve'?[coordinates[0],coordinates[2],coordinates[1]]:[coordinates[0],coordinates[2],coordinates[3],coordinates[1]]},styles:{style:'dashed',size:1,color:'#94a3b8'}})
 return figures
}}}
export default [curveTemplate('curve',3),curveTemplate('doubleCurve',4),curveTemplate('arc',3)]
