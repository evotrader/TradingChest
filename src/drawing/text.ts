const plain=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value))

/** All editors and figures read the original body, never a second label field. */
export function drawingText(content:unknown):string {
  return typeof content==='string'?content:plain(content)?String(content.text??''):''
}
export function assertAttachedTextContent(content:unknown):void {
  if(content!==undefined&&content!==null&&typeof content!=='string'&&!plain(content))throw Error('附着文字需要字符串或普通对象正文；原有内容已保留')
}
export function withDrawingText(content:unknown,text:string,attached=false):unknown {
  if(attached)assertAttachedTextContent(content)
  if(content&&typeof content==='object')return {...content,text}
  return text
}
