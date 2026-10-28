import type {LineStyle,OverlayCreateFiguresCallbackParams,OverlayFigure} from 'klinecharts'
import {builtinDrawingCatalog,validateDrawingParameters,drawingToolDefinition,type DrawingToolDescriptor} from '../drawing/catalog'
import {resolveDrawingLevels,type DrawingLevel,type DrawingLevelInput,type DrawingLevelPresetInput,type DrawingLevelSet} from '../drawing/levels'
import {drawingStyleAuxiliary,drawingStyleInput,type DrawingStyleFigure} from '../drawing/styleControls'
import {canProjectAxisValue,toolParameters} from './numerics'

import {fibonacciLevelPrice,type FibonacciKind as Kind} from '../drawing/fibonacciMath'
export {fibonacciLevelPrice} from '../drawing/fibonacciMath'

type Figure=OverlayFigure&DrawingStyleFigure
/** Both tools share the value-domain formula, pane clipping and native figure/hit path. */
export function fibonacciLevelFigures(args:OverlayCreateFiguresCallbackParams<unknown>,kind:Kind):OverlayFigure[] {
 const {chart,overlay,coordinates,bounding,yAxis}=args,builtin=builtinDrawingCatalog.find(tool=>tool.toolId===kind)!,tool=(args as typeof args&{[drawingToolDefinition]?:DrawingToolDescriptor})[drawingToolDefinition]??builtin,parameters=toolParameters(overlay),en=chart.getLocale()==='en-US'
 const warning=(text:string):Figure=>({key:'fibonacci-warning',type:'rectText',ignoreEvent:true,attrs:{x:8,y:20,text,baseline:'top'},styles:{color:'#ef5350'},[drawingStyleAuxiliary]:true})
 try{
  validateDrawingParameters(tool,parameters)
  const resolved=Object.fromEntries(builtin.parameters.map(parameter=>[parameter.key,parameters[parameter.key]??tool.parameters.find(spec=>spec.key===parameter.key)?.defaultValue??parameter.defaultValue]))
  const defaults=(tool.parameters.find(parameter=>parameter.key==='levels')??builtin.parameters.find(parameter=>parameter.key==='levels'))!.defaultValue as Exclude<DrawingLevelPresetInput,undefined>
  const raw=parameters.levels as DrawingLevelInput
  const levels=raw===undefined||Array.isArray(raw)?resolveDrawingLevels(raw,defaults):raw as DrawingLevelSet
  validateDrawingParameters(builtin,{...resolved,levels})
  const option=<T,>(key:string):T=>resolved[key] as T
  const enabled=levels.items.filter(level=>level.visible)
  if(!enabled.length)return []
  const count=kind==='fibonacciLine'?2:3,global=chart.getStyles().overlay,line:LineStyle={...global.line,...overlay.styles?.line}
  const guide:Figure[]=kind==='fibonacciExtension'&&coordinates.length>0?[{key:'fibonacci-guide',type:'line',attrs:{coordinates},styles:{style:'dashed'},[drawingStyleAuxiliary]:true}]:[]
  if(coordinates.length<count||!yAxis)return guide
  const endpoints=kind==='fibonacciLine'?[coordinates[0],coordinates[1]]:[coordinates[1],coordinates[2]]
  const left=Math.max(0,option<boolean>('extendLeft')?0:Math.min(...endpoints.map(point=>point.x))),right=Math.min(bounding.width,option<boolean>('extendRight')?bounding.width:Math.max(...endpoints.map(point=>point.x)))
  const values=overlay.points.slice(0,count).map(point=>point.value!),mode=option<'linear'|'log'>('calculationMode'),reverse=option<boolean>('reverse')
  const rows:Array<{level:DrawingLevel;price:number;y:number;styles:LineStyle}>=[],unavailable:string[]=[]
  for(const level of enabled){
   try{
    const price=fibonacciLevelPrice(kind,values,level.value,mode,reverse)
    if(!canProjectAxisValue(yAxis,price))throw Error('当前价格轴不能投影此级别')
    const styles={...line,...(level.color===undefined?{}:{color:level.color}),...(level.width===undefined?{}:{size:level.width}),...(level.style===undefined?{}:level.style==='solid'?{style:'solid' as const}:{style:'dashed' as const,dashedValue:level.style==='dotted'?[1,3]:[6,4]})}
    rows.push({level,price,y:yAxis.convertToPixel(price),styles})
   }catch(error){unavailable.push(`${level.value}: ${error instanceof Error?error.message:String(error)}`)}
  }
  const figures:Figure[]=[]
  if(right>=left){
   const opacity=option<number>('backgroundOpacity')
   if(option<boolean>('backgroundVisible')&&opacity>0){
    const sorted=[...rows].sort((a,b)=>a.price-b.price)
    for(let index=1;index<sorted.length;index++){
     const lower=sorted[index-1],upper=sorted[index],top=Math.max(0,Math.min(lower.y,upper.y)),bottom=Math.min(bounding.height,Math.max(lower.y,upper.y))
     if(upper.price===lower.price||bottom<=top||right===left)continue
     const fill=overlay.styles?.polygon?.color??upper.styles.color
     if(typeof fill!=='string'){unavailable.push(en?'Background requires a solid color':'透明背景需要纯色，请选择填充颜色');break}
     const color=/^#[a-f0-9]{6}$/i.test(fill)?`${fill}${Math.round(opacity*255).toString(16).padStart(2,'0')}`:`color-mix(in srgb, ${fill} ${opacity*100}%, transparent)`
     figures.push({key:`fibonacci-band-${index}`,type:'polygon',ignoreEvent:true,attrs:{coordinates:[{x:left,y:top},{x:right,y:top},{x:right,y:bottom},{x:left,y:bottom}]},styles:{style:'fill',color},[drawingStyleInput]:{fill:{group:'polygon',fields:{color:fill}}}})
    }
   }
   figures.push(...guide)
   const precision=chart.getSymbol()?.pricePrecision??2,align=option<'left'|'center'|'right'>('levelLabelAlign'),position=option<'above'|'on'|'below'>('levelLabelPosition'),format=option<'value'|'percent'>('levelValueFormat')
   for(const {level,price,y,styles}of rows){
    if(y<0||y>bounding.height)continue
    figures.push({key:`fibonacci-level:${level.id}`,type:'line',attrs:{coordinates:[{x:left,y},{x:right,y}]},styles})
    const parts:string[]=[]
    if(option<boolean>('showLevelPrices'))parts.push(price.toFixed(precision))
    if(option<boolean>('showLevelValues')){const percent=level.value*100,value=format==='percent'?`${Number.isFinite(percent)?percent.toFixed(1):level.value.toExponential().replace(/e([+-]?\d+)$/,(_match,exponent)=>`e${Number(exponent)+2}`)}%`:String(level.value);parts.push(parts.length?`(${value})`:value)}
    if(option<boolean>('showLevelText')&&level.text)parts.push(level.text)
    if(parts.length)figures.push({key:`fibonacci-label:${level.id}`,type:'text',ignoreEvent:true,attrs:{x:align==='left'?left:align==='right'?right:(left+right)/2,y,text:parts.join(' '),...(right>left?{width:right-left}:{}),align,baseline:position==='above'?'bottom':position==='on'?'middle':'top'}})
   }
  }else figures.push(...guide)
  if(unavailable.length)figures.push(warning(en?`Some levels cannot be displayed; check the calculation, levels or price axis. ${unavailable.join('; ')}`:`部分级别不可显示，请检查计算方式、级别或价格轴。${unavailable.join('；')}`))
  return figures
 }catch(error){return [warning(error instanceof Error?error.message:String(error))]}
}
