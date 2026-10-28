import type {DrawingParameter} from './catalog'
import type {FibonacciKind} from './fibonacciMath'
import {defaultDrawingLevelValues} from './levels'

const defineParameters=(extension:boolean):DrawingParameter[]=>[
  {key:'levels',label:'级别',kind:'level-set',defaultValue:[...defaultDrawingLevelValues]},
  {key:'calculationMode',label:'计算方式',kind:'text',choices:['linear','log'],defaultValue:'linear'},
  {key:'reverse',label:'反向计算',kind:'boolean',defaultValue:false},
  {key:'extendLeft',label:'向左延长',kind:'boolean',defaultValue:!extension},
  {key:'extendRight',label:'向右延长',kind:'boolean',defaultValue:!extension},
  {key:'backgroundVisible',label:'填充级别背景',kind:'boolean',defaultValue:false},
  {key:'backgroundOpacity',label:'背景透明度',kind:'number',min:0,max:1,choices:['0','0.05','0.12','0.2','0.3','0.5','1'],defaultValue:.12},
  {key:'showLevelPrices',label:'显示级别价格',kind:'boolean',defaultValue:true},
  {key:'showLevelValues',label:'显示级别比例',kind:'boolean',defaultValue:true},
  {key:'showLevelText',label:'显示级别正文',kind:'boolean',defaultValue:true},
  {key:'levelValueFormat',label:'级别比例格式',kind:'text',choices:['value','percent'],defaultValue:'percent'},
  {key:'levelLabelAlign',label:'级别标签对齐',kind:'text',choices:['left','center','right'],defaultValue:'left'},
  {key:'levelLabelPosition',label:'级别标签位置',kind:'text',choices:['above','on','below'],defaultValue:'above'},
]

const definitions={fibonacciLine:defineParameters(false),fibonacciExtension:defineParameters(true)}

export function fibonacciLevelParameters(extension:boolean):DrawingParameter[] {
 return structuredClone(definitions[extension?'fibonacciExtension':'fibonacciLine'])
}

export function resolveFibonacciParameters(kind:FibonacciKind,parameters:Record<string,unknown>,declared:readonly DrawingParameter[]=[]):Record<string,unknown> {
 return Object.fromEntries(definitions[kind].map(parameter=>[parameter.key,parameters[parameter.key]!==undefined?parameters[parameter.key]:declared.find(spec=>spec.key===parameter.key)?.defaultValue??parameter.defaultValue]))
}
