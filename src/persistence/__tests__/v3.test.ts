import {describe,it,expect,beforeEach} from 'vitest'
import {isChartLayoutV3,migrateLayoutToV3,saveLayoutV3,loadLayoutV3,listLayoutsV3,deleteLayoutV3} from '../v3'
const values=new Map<string,string>()
const storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k),key:(i:number)=>[...values.keys()][i]??null,get length(){return values.size}} as Storage
const old={version:2,timestamp:1,theme:'dark',locale:'zh-CN',timezone:'UTC',styles:{yAxis:{type:'log',reverse:true},indicator:{tooltip:{icons:[{id:'settings',icon:'s',fontFamily:'icons',position:'middle'}]}}},indicators:[],panes:[],overlayData:[]}
beforeEach(()=>values.clear())
describe('v3 layouts and read-only migration',()=>{
 it('maps the independent axis and tooltip features without changing the old record',()=>{
  const before=JSON.stringify(old),result=migrateLayoutToV3(old)
  expect(result.status).toBe('ok');if(result.status!=='ok')throw Error('migration failed')
  expect(result.value.axes[0]).toMatchObject({name:'logarithm',reverse:true})
  expect((result.value.styles?.indicator as any).tooltip.features[0]).toMatchObject({type:'icon_font',content:{code:'s',family:'icons'}})
  expect(JSON.stringify(old)).toBe(before);expect(isChartLayoutV3(result.value)).toBe(true)
 })
 it('round-trips under a new key and keeps old keys through delete',()=>{
  storage.setItem('trading-chest-layout-v2-default',JSON.stringify(old))
  const migrated=loadLayoutV3('default',storage);expect(values.size).toBe(1)
  if(migrated.status!=='ok')throw Error('migration failed')
  expect(saveLayoutV3('default',migrated.value,storage).status).toBe('ok')
  expect(values.size).toBe(2);expect(listLayoutsV3(storage)).toMatchObject({status:'ok',value:[{key:'default'}]})
  expect(deleteLayoutV3('default',storage).status).toBe('ok');expect(values.size).toBe(1)
 })
 it('does not mask a corrupt newer record with the old one',()=>{
  storage.setItem('trading-chest-layout-v2-default',JSON.stringify(old));storage.setItem('trading-chest-layout-v3-default','{}')
  expect(loadLayoutV3('default',storage)).toMatchObject({status:'error',code:'corrupt'});expect(values.size).toBe(2)
 })
 it('distinguishes absent, unsupported migration, denied reads and failed writes',()=>{
  expect(loadLayoutV3('absent',storage)).toEqual({status:'missing'})
  expect(migrateLayoutToV3({...old,styles:{yAxis:{type:'custom'}}})).toMatchObject({status:'error',code:'migration'})
  expect(loadLayoutV3('a',{getItem:()=>{throw Error('denied')}} as any)).toMatchObject({status:'error',code:'read'})
  const result=migrateLayoutToV3(old);if(result.status!=='ok')throw Error('migration failed')
  expect(saveLayoutV3('a',result.value,{setItem:()=>{throw Error('quota')}} as any)).toMatchObject({status:'error',code:'write'})
 })
})
