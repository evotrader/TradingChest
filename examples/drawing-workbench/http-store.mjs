/** Plain HTTP/JSON transport; browser consumers inject their public SDK error type. */
export function createHTTPDrawingStore(baseURL,{errorFactory=(code,message)=>Object.assign(new Error(message),{code}),headers=()=>({})}={}) {
 const request=async(namespace,id,signal,input)=>{
  const url=new URL(baseURL,globalThis.location?.href);url.searchParams.set('namespace',namespace);url.searchParams.set('documentId',id)
  const response=await fetch(url,{signal,method:input?'PUT':'GET',headers:input?{'Content-Type':'application/json',...headers()}:undefined,body:input?JSON.stringify(input):undefined})
  if(!response.ok){const body=await response.json().catch(()=>({}));throw errorFactory(response.status===409?'DRAWING_CONFLICT':response.status===400?'DRAWING_INVALID_DOCUMENT':'DRAWING_STORE_UNAVAILABLE',body.message??`绘图存储 HTTP ${response.status}`)}
  return response.json()
 }
 return {read:(namespace,id,signal)=>request(namespace,id,signal),write:(namespace,input,signal)=>request(namespace,input.documentId,signal,input)}
}
