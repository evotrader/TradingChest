import type {DrawingSnapshot} from './types'
import type {DrawingStylePreset,DrawingPresetParameters} from './preferences'
import {validateDrawingParameters,type DrawingToolDescriptor,type DrawingParameter} from './catalog'
import {applyDrawingLevelPreset,extractDrawingLevelPreset,instantiateDrawingLevelPreset,isDrawingLevelValues,validateDrawingLevelPresetSet,type DrawingLevelInput,type DrawingLevelPresetInput} from './levels'

const clone=<T>(value:T):T=>structuredClone(value)
const defaults=(parameter:DrawingParameter)=>parameter.defaultValue as Exclude<DrawingLevelPresetInput,undefined>

/** Also used without a catalog at the storage boundary, where content must still be rejected. */
export function validateDrawingPresetParameters(parameters:unknown,tool?:DrawingToolDescriptor):asserts parameters is DrawingPresetParameters {
 if(!parameters||typeof parameters!=='object'||Array.isArray(parameters))throw Error('绘图预设参数格式无效')
 const ordinary:Record<string,unknown>={}
 for(const [key,value] of Object.entries(parameters)){
  const parameter=tool?.parameters.find(parameter=>parameter.key===key)
  if(tool&&!parameter)throw Error(`工具 ${tool.toolId} 不支持参数 ${key}`)
  if(parameter?.kind==='level-set'||!tool&&value!==null&&typeof value==='object'&&!Array.isArray(value)){
   if(!isDrawingLevelValues(value))validateDrawingLevelPresetSet(value)
  }else{
   if(!(typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value)||Array.isArray(value)&&value.every(item=>typeof item==='number'&&Number.isFinite(item))))throw Error('绘图预设只能包含外观参数，不能包含级别 ID 或正文')
   ordinary[key]=value
  }
 }
 if(tool)validateDrawingParameters(tool,ordinary)
}

export function extractDrawingStylePreset(value:DrawingSnapshot,tool:DrawingToolDescriptor):DrawingStylePreset {
 validateDrawingParameters(tool,value.parameters??{})
 const parameters:DrawingPresetParameters={}
 for(const [key,parameter] of Object.entries(value.parameters??{})){
  const spec=tool.parameters.find(spec=>spec.key===key)!
  parameters[key]=spec.kind==='level-set'?extractDrawingLevelPreset(parameter as DrawingLevelInput,defaults(spec)):clone(parameter) as DrawingPresetParameters[string]
 }
 return {styles:clone(value.overlay.styles??{}),parameters}
}

/** Fresh runtime IDs are allocated exactly once for each new preview. */
export function instantiateDrawingPresetParameters(parameters:DrawingPresetParameters|undefined,tool:DrawingToolDescriptor):DrawingSnapshot['parameters'] {
 validateDrawingPresetParameters(parameters??{},tool)
 const result:NonNullable<DrawingSnapshot['parameters']>={}
 for(const [key,value] of Object.entries(parameters??{}))if(tool.parameters.find(parameter=>parameter.key===key)?.kind!=='level-set')result[key]=clone(value) as typeof result[string]
 for(const parameter of tool.parameters)if(parameter.kind==='level-set')result[parameter.key]=instantiateDrawingLevelPreset(parameters?.[parameter.key] as DrawingLevelPresetInput,defaults(parameter))
 return result
}

/** Complete-template application is preflighted for every object before the first write. */
export function applyDrawingPresetParameters(value:DrawingSnapshot,parameters:DrawingPresetParameters|undefined,tool:DrawingToolDescriptor):NonNullable<DrawingSnapshot['parameters']> {
 validateDrawingPresetParameters(parameters??{},tool)
 const result:NonNullable<DrawingSnapshot['parameters']>={}
 for(const [key,parameter] of Object.entries(parameters??{}))if(tool.parameters.find(spec=>spec.key===key)?.kind!=='level-set')result[key]=clone(parameter) as typeof result[string]
 for(const parameter of tool.parameters)if(parameter.kind==='level-set'){
  try{result[parameter.key]=applyDrawingLevelPreset(value.parameters?.[parameter.key] as DrawingLevelInput,parameters?.[parameter.key] as DrawingLevelPresetInput,defaults(parameter))}
  catch(error){throw Error(`绘图 ${value.presentation?.name??value.logicalId}：${error instanceof Error?error.message:String(error)}`)}
 }
 validateDrawingParameters(tool,result)
 return result
}
