import {vwapBandOptions} from './vwapBands'
export type DrawingCategory='lines'|'channels'|'geometry'|'fibonacci'|'waves'|'measurement'|'annotations'|'positions'|'volume'
export interface DrawingParameter {key:string;label:string;kind:'number'|'text'|'boolean'|'levels'|'color';min?:number;max?:number;choices?:string[];defaultValue:number|string|boolean|number[]}
export type DrawingStyleControl='stroke'|'fill'|'lineWidth'|'lineStyle'|'textColor'|'fontSize'
export interface DrawingToolDescriptor {
  toolId:string
  overlayName:string
  labels:{'zh-CN':string;'en-US':string}
  category:DrawingCategory
  icon:string
  shortcut?:string
  mode:'points'|'continuous'|'text'|'variable'
  minPoints:number
  maxPoints:number|null
  settings:Array<'style'|'text'|'coordinates'|'visibility'|'parameters'>
  styleControls?:DrawingStyleControl[]
  parameters:DrawingParameter[]
}
const groups:Array<[DrawingCategory,Array<[string,string,string,number,string?]>]>=[
  ['lines',[
    ['horizontalStraightLine','水平线','Horizontal line',1,'Alt+H'],['horizontalRayLine','水平射线','Horizontal ray',2],['horizontalSegment','水平线段','Horizontal segment',2],
    ['verticalStraightLine','垂直线','Vertical line',1,'Alt+V'],['verticalRayLine','垂直射线','Vertical ray',2],['verticalSegment','垂直线段','Vertical segment',2],
    ['straightLine','直线','Extended line',2],['rayLine','射线','Ray',2],['segment','趋势线','Trend line',2,'Alt+T'],['arrow','箭头','Arrow',2],['priceLine','价格线','Price line',1],['crossLine','十字线','Cross line',1,'Alt+C'],['trendAngle','趋势角度','Trend angle',2]]],
  ['channels',[['priceChannelLine','价格通道','Price channel',3],['parallelStraightLine','平行直线','Parallel lines',3],['pitchfork','安德鲁斯叉','Pitchfork',3],['schiffPitchfork','希夫叉','Schiff pitchfork',3],['regressionTrend','回归趋势','Regression trend',2],['regressionChannel','回归通道','Regression channel',2]]],
  ['geometry',[['circle','圆','Circle',2],['rect','矩形','Rectangle',2,'Alt+R'],['parallelogram','平行四边形','Parallelogram',3],['triangle','三角形','Triangle',3],['ellipse','椭圆','Ellipse',2],['rotatedRect','旋转矩形','Rotated rectangle',3],['curve','曲线','Curve',3],['doubleCurve','双控制点曲线','Double curve',4],['arc','圆弧','Arc',3]]],
  ['fibonacci',[['fibonacciLine','斐波那契回撤','Fibonacci retracement',2,'Alt+F'],['fibonacciSegment','斐波那契线段','Fibonacci segment',2],['fibonacciCircle','斐波那契圆','Fibonacci circles',2],['fibonacciSpiral','斐波那契螺旋','Fibonacci spiral',2],['fibonacciSpeedResistanceFan','斐波那契阻速扇','Fibonacci speed resistance fan',2],['fibonacciExtension','斐波那契扩展','Fibonacci extension',3],['gannBox','江恩箱','Gann box',2]]],
  ['waves',[['xabcd','XABCD 形态','XABCD pattern',5],['abcd','ABCD 形态','ABCD pattern',4],['threeWaves','三浪','Three waves',4],['fiveWaves','五浪','Five waves',6],['eightWaves','八浪','Eight waves',9],['anyWaves','任意波浪','Any waves',2]]],
  ['measurement',[['priceRange','价格范围','Price range',2],['dateRange','日期范围','Date range',2],['dateAndPriceRange','日期和价格范围','Date and price range',2,'Shift+M']]],
  ['annotations',[['textAnnotation','文字','Text',1],['callout','气泡标注','Callout',2],['note','便签','Note',1],['brush','画笔','Brush',2,'Alt+B'],['highlighter','荧光笔','Highlighter',2],['polyline','折线','Polyline',2],['priceLabel','价格标签','Price label',1],['anchoredText','固定文字','Anchored text',1]]],
  ['positions',[['longPosition','多头仓位','Long position',3],['shortPosition','空头仓位','Short position',3]]],
  ['volume',[['anchoredVwap','锚定 VWAP','Anchored VWAP',1],['fixedRangeVolumeProfile','固定区间成交量分布','Fixed range volume profile',2]]]
]
// Capabilities follow the actual figures, including fixed-color measurement figures.
const builtinStyleControls=(id:string):DrawingStyleControl[]=>{
  if(['textAnnotation','note','anchoredText','priceLabel'].includes(id))return ['fill','textColor','fontSize']
  if(id==='fixedRangeVolumeProfile')return ['stroke','textColor']
  if(id==='dateRange')return ['lineWidth']
  if(['priceRange','dateAndPriceRange'].includes(id))return ['lineWidth','lineStyle']
  const controls:DrawingStyleControl[]=['stroke','lineWidth','lineStyle']
  if(['rect','circle','triangle','parallelogram','ellipse','rotatedRect','gannBox','xabcd','regressionChannel','callout','curve','doubleCurve','arc'].includes(id))controls.push('fill')
  if(['callout','trendAngle','fibonacciLine','fibonacciSegment','fibonacciCircle','fibonacciExtension','fibonacciSpeedResistanceFan','xabcd','abcd','threeWaves','fiveWaves','eightWaves','anyWaves','longPosition','shortPosition'].includes(id))controls.push('textColor','fontSize')
  return controls
}
export const builtinDrawingCatalog:DrawingToolDescriptor[]=groups.flatMap(([category,items])=>items.map(([toolId,zh,en,points,shortcut])=>{
  const text=['textAnnotation','callout','note','anchoredText'].includes(toolId),variable=['polyline','anyWaves'].includes(toolId)
  const curve=['curve','doubleCurve','arc'].includes(toolId)
  if(category==='volume')return {toolId,overlayName:toolId,styleControls:builtinStyleControls(toolId),labels:{'zh-CN':zh,'en-US':en},category,icon:toolId,shortcut,mode:'points',minPoints:points,maxPoints:points,settings:['style','coordinates','visibility','parameters'],parameters:toolId==='anchoredVwap'?[
    {key:'source',label:'价格源',kind:'text',choices:['close','hl2','hlc3','ohlc4'],defaultValue:'hlc3'},
    {key:'algorithm',label:'估算算法',kind:'text',choices:['bar-price-volume-v1'],defaultValue:'bar-price-volume-v1'},
    {key:'bandMode',label:'VWAP 带模式',kind:'text',choices:['none','standard-deviation','percentage'],defaultValue:'none'},
    {key:'bandMultipliers',label:'VWAP 带倍数',kind:'levels',defaultValue:[1,2,3]},
    {key:'bandFill',label:'填充 VWAP 带',kind:'boolean',defaultValue:true},
    {key:'bandOpacity',label:'VWAP 带透明度',kind:'number',min:0,max:1,choices:['0','0.05','0.12','0.2','0.3','0.5','1'],defaultValue:.12},
    {key:'bandAlgorithm',label:'带算法',kind:'text',choices:['ohlcv-vwap-bands-v1'],defaultValue:'ohlcv-vwap-bands-v1'}
  ]:[{key:'rows',label:'分箱行数',kind:'number',min:1,max:256,choices:['24','48','96','192'],defaultValue:48},{key:'valueArea',label:'价值区比例',kind:'number',min:Number.MIN_VALUE,max:1,choices:['0.5','0.6','0.68','0.7','0.8','0.9','0.95'],defaultValue:.7},{key:'mode',label:'成交量显示',kind:'text',choices:['total','up-down'],defaultValue:'total'},{key:'algorithm',label:'估算算法',kind:'text',choices:['bar-range-uniform-v1'],defaultValue:'bar-range-uniform-v1'},
    {key:'profileSide',label:'分布位置',kind:'text',choices:['left','right'],defaultValue:'left'},
    {key:'profileWidth',label:'分布宽度',kind:'number',min:Number.MIN_VALUE,max:1,choices:['0.05','0.1','0.2','0.3','0.5','1'],defaultValue:.3},
    {key:'levelExtent',label:'价位线延长',kind:'text',choices:['profile','range','pane-right'],defaultValue:'profile'},
    ...(['Poc','Vah','Val'] as const).flatMap(level=>[
      {key:`show${level}`,label:`显示 ${level.toUpperCase()}`,kind:'boolean',defaultValue:true},
      {key:`${level.toLowerCase()}Color`,label:`${level.toUpperCase()} 颜色`,kind:'color',defaultValue:level==='Poc'?'#f59e0b':'#64748b'},
      {key:`${level.toLowerCase()}Width`,label:`${level.toUpperCase()} 线宽`,kind:'number',min:1,max:4,choices:['1','2','3','4'],defaultValue:1},
      {key:`${level.toLowerCase()}Style`,label:`${level.toUpperCase()} 线型`,kind:'text',choices:['solid','dashed','dotted'],defaultValue:level==='Poc'?'solid':'dashed'}
    ])]} as DrawingToolDescriptor
  return {toolId,overlayName:toolId,styleControls:builtinStyleControls(toolId),labels:{'zh-CN':zh,'en-US':en},category,icon:toolId,shortcut,
    mode:['brush','highlighter'].includes(toolId)?'continuous':text?'text':variable?'variable':'points',minPoints:points,maxPoints:variable||['brush','highlighter'].includes(toolId)?null:points,
    settings:['style',...(text?['text' as const]:[]),'coordinates','visibility',...(curve||category==='fibonacci'||category==='channels'?['parameters' as const]:[])],
    parameters:curve?[
      {key:'startMarker',label:'起点标记',kind:'text',choices:['none','arrow','circle'],defaultValue:'none'},
      {key:'endMarker',label:'终点标记',kind:'text',choices:['none','arrow','circle'],defaultValue:'none'},
      {key:'background',label:'填充曲线背景',kind:'boolean',defaultValue:false},
      {key:'backgroundOpacity',label:'背景透明度',kind:'number',min:0,max:1,choices:['0','0.05','0.12','0.2','0.3','0.5','1'],defaultValue:.12}
    ]:toolId==='fibonacciSpiral'?[{key:'segments',label:'弧段数',kind:'number' as const,min:2,max:32,defaultValue:9}]:toolId.startsWith('regression')?[{key:'source',label:'回归价格',kind:'text' as const,choices:['open','high','low','close'],defaultValue:'close'},{key:'extend',label:'向右延伸',kind:'boolean' as const,defaultValue:true},...(toolId==='regressionChannel'?[{key:'deviations',label:'残差标准差倍数',kind:'number' as const,min:0,max:10,defaultValue:2}]:[])]:category==='fibonacci'?[{key:'levels',label:'级别',kind:'levels' as const,defaultValue:toolId==='gannBox'?[0,.25,.5,.75,1]:[0,.236,.382,.5,.618,.786,1]}]:text?[{key:'textAlign',label:'文字对齐',kind:'text' as const,defaultValue:'left',choices:['left','center','right']}]:[]}
}))
export function copyDrawingCatalog(input:DrawingToolDescriptor[]=builtinDrawingCatalog):DrawingToolDescriptor[] {
  const ids=new Set<string>(),names=new Set<string>()
  for(const item of input){
    if(!item.toolId||!item.overlayName||ids.has(item.toolId)||names.has(item.overlayName)||!item.labels?.['zh-CN']||!item.labels?.['en-US']||!Number.isInteger(item.minPoints)||item.minPoints<1||(item.maxPoints!==null&&(!Number.isInteger(item.maxPoints)||item.maxPoints<item.minPoints)))throw Error('绘图目录定义无效或重复')
    if(item.styleControls&&(!Array.isArray(item.styleControls)||new Set(item.styleControls).size!==item.styleControls.length||item.styleControls.some(control=>!['stroke','fill','lineWidth','lineStyle','textColor','fontSize'].includes(control))))throw Error('绘图样式能力定义无效或重复')
    ids.add(item.toolId);names.add(item.overlayName)
  }
  return structuredClone(input)
}
export function validateDrawingParameters(tool:DrawingToolDescriptor,parameters:Record<string,unknown>):void {
  if(tool.overlayName==='anchoredVwap')vwapBandOptions(parameters)
  for(const [key,value] of Object.entries(parameters)){
    const spec=tool.parameters.find(p=>p.key===key)
    if(!spec)throw Error(`工具 ${tool.toolId} 不支持参数 ${key}`)
    if(spec.kind==='number'&&(typeof value!=='number'||!Number.isFinite(value)||(spec.min!==undefined&&value<spec.min)||(spec.max!==undefined&&value>spec.max)))throw Error(`参数 ${spec.label} 无效`)
    if(spec.kind==='levels'&&(!Array.isArray(value)||!value.length||value.length>64||value.some(v=>typeof v!=='number'||!Number.isFinite(v))))throw Error(`参数 ${spec.label} 无效`)
    if((key==='segments'||tool.toolId==='fixedRangeVolumeProfile'&&key==='rows')&&!Number.isInteger(value))throw Error('行数或弧段数必须是整数')
    if(spec.kind==='color'&&(typeof value!=='string'||!/^#[a-f0-9]{6}(?:[a-f0-9]{2})?$|^transparent$/i.test(value)))throw Error(`参数 ${spec.label} 颜色无效`)
    if(spec.kind==='text'&&typeof value!=='string'||spec.kind==='boolean'&&typeof value!=='boolean')throw Error(`参数 ${spec.label} 无效`)
    if(spec.kind==='text'&&spec.choices&&!spec.choices.includes(String(value)))throw Error(`参数 ${spec.label} 不在允许选项内`)
  }
}
