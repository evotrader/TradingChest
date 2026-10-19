import {drawingShareKey,isSharedDrawingDocument,type SharedDrawingDocument} from './document'
import {createDrawingDatabase} from './indexedDB'
export type DrawingStoreErrorCode='DRAWING_CONFLICT'|'DRAWING_INVALID_DOCUMENT'|'DRAWING_STORE_UNAVAILABLE'
export class DrawingStoreError extends Error {constructor(readonly code:DrawingStoreErrorCode,message:string){super(message)}}
export interface StoredDrawingDocument {documentId:string;revision:string;document:SharedDrawingDocument}
export interface DrawingDocumentWrite {documentId:string;expectedRevision:string|null;document:SharedDrawingDocument}
/** A null expected revision means create only; never an unconditional overwrite. */
export interface DrawingDocumentStore {
  read(namespace:string,documentId:string,signal:AbortSignal):Promise<StoredDrawingDocument|null>
  write(namespace:string,input:DrawingDocumentWrite,signal:AbortSignal):Promise<StoredDrawingDocument>
}
export function copyStoredDrawing(namespace:string,id:string,value:unknown):StoredDrawingDocument {
  const v=value as StoredDrawingDocument
  if(!v||v.documentId!==id||!v.revision||typeof v.revision!=='string'||!isSharedDrawingDocument(v.document)||v.document.identity.namespace!==namespace)throw new DrawingStoreError('DRAWING_INVALID_DOCUMENT','共享绘图存储返回的文档无效，当前草稿已保留')
  return structuredClone(v)
}
export function createIndexedDBDrawingDocumentStore(options:{databaseName?:string}={}):DrawingDocumentStore&{dispose():void}{
  const db=createDrawingDatabase(options.databaseName)
  const key=(scope:string,id:string)=>{if(!scope||!id)throw new DrawingStoreError('DRAWING_INVALID_DOCUMENT','共享绘图需要 namespace 和固定 documentId')}
  return {
    async read(scope,id,signal){key(scope,id);return db.transact('documents','readonly',signal,(store,done,fail)=>{const request=store.get([scope,id]);request.onerror=()=>fail(request.error);request.onsuccess=()=>{try{done(request.result===undefined?null:copyStoredDrawing(scope,id,request.result))}catch(error){fail(error)}}})},
    async write(scope,input,signal){
      key(scope,input.documentId)
      if(!isSharedDrawingDocument(input.document)||input.document.identity.namespace!==scope||input.expectedRevision!==null&&(!input.expectedRevision||typeof input.expectedRevision!=='string'))throw new DrawingStoreError('DRAWING_INVALID_DOCUMENT','共享绘图或预期 revision 无效')
      const captured=structuredClone(input);drawingShareKey(captured.document.identity)
      return db.transact('documents','readwrite',signal,(store,done,fail)=>{
        const read=store.get([scope,captured.documentId]);read.onerror=()=>fail(read.error);read.onsuccess=()=>{
          try{
            const old=read.result===undefined?null:copyStoredDrawing(scope,captured.documentId,read.result)
            if((old?.revision??null)!==captured.expectedRevision)throw new DrawingStoreError('DRAWING_CONFLICT','共享绘图已被另一实例修改，请刷新或另存；本地草稿已保留')
            const next:StoredDrawingDocument={documentId:captured.documentId,revision:crypto.randomUUID(),document:captured.document},write=store.put({scope,id:captured.documentId,...next})
            write.onerror=()=>fail(write.error);write.onsuccess=()=>done(structuredClone(next))
          }catch(error){fail(error)}
        }
      })
    },dispose:()=>db.dispose()
  }
}
