export type DrawingCategory='lines'|'channels'|'geometry'|'fibonacci'|'waves'|'measurement'|'annotations'|'positions'
export interface DrawingParameter {key:string;label:string;kind:'number'|'text'|'boolean'|'levels';min?:number;max?:number;choices?:string[];defaultValue:number|string|boolean|number[]}
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
  parameters:DrawingParameter[]
}
const groups:Array<[DrawingCategory,Array<[string,string,string,number,string?]>]>=[
  ['lines',[
    ['horizontalStraightLine','水平线','Horizontal line',1,'Alt+H'],['horizontalRayLine','水平射线','Horizontal ray',2],['horizontalSegment','水平线段','Horizontal segment',2],
    ['verticalStraightLine','垂直线','Vertical line',1,'Alt+V'],['verticalRayLine','垂直射线','Vertical ray',2],['verticalSegment','垂直线段','Vertical segment',2],
    ['straightLine','直线','Extended line',2],['rayLine','射线','Ray',2],['segment','趋势线','Trend line',2,'Alt+T'],['arrow','箭头','Arrow',2],['priceLine','价格线','Price line',1],['crossLine','十字线','Cross line',1,'Alt+C'],['trendAngle','趋势角度','Trend angle',2]]],
  ['channels',[['priceChannelLine','价格通道','Price channel',3],['parallelStraightLine','平行直线','Parallel lines',3],['pitchfork','安德鲁斯叉','Pitchfork',3],['schiffPitchfork','希夫叉','Schiff pitchfork',3],['regressionTrend','回归趋势','Regression trend',2],['regressionChannel','回归通道','Regression channel',2]]],
  ['geometry',[['circle','圆','Circle',2],['rect','矩形','Rectangle',2,'Alt+R'],['parallelogram','平行四边形','Parallelogram',3],['triangle','三角形','Triangle',3],['ellipse','椭圆','Ellipse',2],['rotatedRect','旋转矩形','Rotated rectangle',3]]],
  ['fibonacci',[['fibonacciLine','斐波那契回撤','Fibonacci retracement',2,'Alt+F'],['fibonacciSegment','斐波那契线段','Fibonacci segment',2],['fibonacciCircle','斐波那契圆','Fibonacci circles',2],['fibonacciSpiral','斐波那契螺旋','Fibonacci spiral',2],['fibonacciSpeedResistanceFan','斐波那契阻速扇','Fibonacci speed resistance fan',2],['fibonacciExtension','斐波那契扩展','Fibonacci extension',3],['gannBox','江恩箱','Gann box',2]]],
  ['waves',[['xabcd','XABCD 形态','XABCD pattern',5],['abcd','ABCD 形态','ABCD pattern',4],['threeWaves','三浪','Three waves',4],['fiveWaves','五浪','Five waves',6],['eightWaves','八浪','Eight waves',9],['anyWaves','任意波浪','Any waves',2]]],
  ['measurement',[['priceRange','价格范围','Price range',2],['dateRange','日期范围','Date range',2],['dateAndPriceRange','日期和价格范围','Date and price range',2,'Shift+M']]],
  ['annotations',[['textAnnotation','文字','Text',1],['callout','气泡标注','Callout',2],['note','便签','Note',1],['brush','画笔','Brush',2,'Alt+B'],['highlighter','荧光笔','Highlighter',2],['polyline','折线','Polyline',2],['priceLabel','价格标签','Price label',1],['anchoredText','固定文字','Anchored text',1]]],
  ['positions',[['longPosition','多头仓位','Long position',3],['shortPosition','空头仓位','Short position',3]]]
]
export const builtinDrawingCatalog:DrawingToolDescriptor[]=groups.flatMap(([category,items])=>items.map(([toolId,zh,en,points,shortcut])=>{
  const text=['textAnnotation','callout','note','anchoredText'].includes(toolId),variable=['polyline','anyWaves'].includes(toolId)
  return {toolId,overlayName:toolId,labels:{'zh-CN':zh,'en-US':en},category,icon:toolId,shortcut,
    mode:['brush','highlighter'].includes(toolId)?'continuous':text?'text':variable?'variable':'points',minPoints:points,maxPoints:variable||['brush','highlighter'].includes(toolId)?null:points,
    settings:['style',...(text?['text' as const]:[]),'coordinates','visibility',...(category==='fibonacci'||category==='channels'?['parameters' as const]:[])],
    parameters:toolId==='fibonacciSpiral'?[{key:'segments',label:'弧段数',kind:'number' as const,min:2,max:32,defaultValue:9}]:toolId.startsWith('regression')?[{key:'source',label:'回归价格',kind:'text' as const,choices:['open','high','low','close'],defaultValue:'close'},{key:'extend',label:'向右延伸',kind:'boolean' as const,defaultValue:true},...(toolId==='regressionChannel'?[{key:'deviations',label:'残差标准差倍数',kind:'number' as const,min:0,max:10,defaultValue:2}]:[])]:category==='fibonacci'?[{key:'levels',label:'级别',kind:'levels' as const,defaultValue:toolId==='gannBox'?[0,.25,.5,.75,1]:[0,.236,.382,.5,.618,.786,1]}]:text?[{key:'textAlign',label:'文字对齐',kind:'text' as const,defaultValue:'left',choices:['left','center','right']}]:[]}
}))
export function copyDrawingCatalog(input:DrawingToolDescriptor[]=builtinDrawingCatalog):DrawingToolDescriptor[] {
  const ids=new Set<string>(),names=new Set<string>()
  for(const item of input){
    if(!item.toolId||!item.overlayName||ids.has(item.toolId)||names.has(item.overlayName)||!item.labels?.['zh-CN']||!item.labels?.['en-US']||!Number.isInteger(item.minPoints)||item.minPoints<1||(item.maxPoints!==null&&(!Number.isInteger(item.maxPoints)||item.maxPoints<item.minPoints)))throw Error('绘图目录定义无效或重复')
    ids.add(item.toolId);names.add(item.overlayName)
  }
  return structuredClone(input)
}
export function validateDrawingParameters(tool:DrawingToolDescriptor,parameters:Record<string,unknown>):void {
  for(const [key,value] of Object.entries(parameters)){
    const spec=tool.parameters.find(p=>p.key===key)
    if(!spec)throw Error(`工具 ${tool.toolId} 不支持参数 ${key}`)
    if(spec.kind==='number'&&(typeof value!=='number'||!Number.isFinite(value)||(spec.min!==undefined&&value<spec.min)||(spec.max!==undefined&&value>spec.max)))throw Error(`参数 ${spec.label} 无效`)
    if(spec.kind==='levels'&&(!Array.isArray(value)||!value.length||value.length>64||value.some(v=>typeof v!=='number'||!Number.isFinite(v))))throw Error(`参数 ${spec.label} 无效`)
    if(key==='segments'&&!Number.isInteger(value))throw Error('弧段数必须是整数')
    if(spec.kind==='text'&&typeof value!=='string'||spec.kind==='boolean'&&typeof value!=='boolean')throw Error(`参数 ${spec.label} 无效`)
    if(spec.choices&&!spec.choices.includes(String(value)))throw Error(`参数 ${spec.label} 不在允许选项内`)
  }
}
