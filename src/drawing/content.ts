import type {DrawingSnapshot} from './types'

export function drawingParameters(data:unknown):DrawingSnapshot['parameters'] {
  if(!data||typeof data!=='object'||!('drawingParameters' in data))return undefined
  const value=data.drawingParameters
  return value&&typeof value==='object'&&!Array.isArray(value)?structuredClone(value) as DrawingSnapshot['parameters']:undefined
}
/** The engine carries derived parameters only for template rendering, never as another document authority. */
export function drawingContent(data:unknown):unknown {
  if(!data||typeof data!=='object'||Array.isArray(data)||!('drawingParameters' in data))return data
  const {drawingParameters:parameters,...content}=data
  return Object.keys(content).length?content:undefined
}
export function engineDrawingData(content:unknown,parameters:DrawingSnapshot['parameters']):unknown {
  if(!parameters)return content
  const data=content&&typeof content==='object'&&!Array.isArray(content)?content:{text:typeof content==='string'?content:''}
  return {...data,drawingParameters:structuredClone(parameters)}
}
