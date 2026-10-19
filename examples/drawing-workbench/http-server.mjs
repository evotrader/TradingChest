import {randomUUID} from 'node:crypto'

/** Isolated loopback example: records last for this process only. No production fallback. */
export function drawingStoreMiddleware(state={records:new Map(),fault:null,writes:0}) {
 const handle=async(req,res)=>{
  res.setHeader('Content-Type','application/json')
  const reply=(status,body)=>{res.statusCode=status;res.end(JSON.stringify(body))}
  try{
   const url=new URL(req.url,'http://127.0.0.1'),namespace=url.searchParams.get('namespace'),id=url.searchParams.get('documentId')
   if(!namespace||!id)return reply(400,{message:'namespace 和 documentId 必填'})
   const key=JSON.stringify([namespace,id])
   if(req.method==='GET')return reply(200,state.records.get(key)??null)
   if(req.method!=='PUT')return reply(405,{message:'仅支持 GET / PUT'})
   let text='';for await(const chunk of req)text+=chunk
   let input
   try{input=JSON.parse(text);if(input.documentId!==id||input.document?.identity?.namespace!==namespace||input.expectedRevision!==null&&typeof input.expectedRevision!=='string')throw Error('文档身份或 revision 无效');if(input.document.version!==1||!Array.isArray(input.document.drawings)||typeof input.document.key!=='string')throw Error('共享文档格式无效')}catch(error){return reply(400,{message:error.message})}
   const requested=req.headers['x-isolated-fault'];if(['reject','response-lost'].includes(requested))state.fault=requested
   if(state.fault==='reject'){state.fault=null;return reply(400,{message:'隔离示例明确拒绝写入'})}
   const old=state.records.get(key)
   if((old?.revision??null)!==input.expectedRevision)return reply(409,{message:'revision 冲突；原件保留，请显式刷新'})
   const value={documentId:id,revision:randomUUID(),document:input.document};state.records.set(key,value);state.writes++
   if(state.fault==='response-lost'){state.fault=null;res.writeHead(200);res.write('{\"documentId\":',()=>res.destroy());return}
   reply(200,value)
  }catch(error){if(!res.destroyed)reply(503,{message:error.message})}
 }
 return {state,handle}
}
