/** Clone only values already normalized through a JSON boundary. */
export function copyCanonical<T>(value:T):T {
  if(value===null||typeof value!=='object')return value
  if(Array.isArray(value))return value.map(copyCanonical) as T
  const result:Record<string,unknown>={}
  for(const key of Object.keys(value)){
    const next=copyCanonical((value as Record<string,unknown>)[key])
    if(key==='__proto__')Object.defineProperty(result,key,{value:next,enumerable:true,writable:true,configurable:true})
    else result[key]=next
  }
  return result as T
}
