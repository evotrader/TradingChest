import type {DrawingSnapshot} from './types'
import type {DrawingToolDescriptor} from './catalog'
import {validateDrawingParameters} from './catalog'
import {jsonSafe} from '../persistence/v2'
import {createDrawingDatabase} from './indexedDB'

export interface DrawingStylePreset {styles:NonNullable<DrawingSnapshot['overlay']['styles']>;parameters?:DrawingSnapshot['parameters']}
export interface DrawingTemplate extends DrawingStylePreset {id:string;name:string;toolId:string}
export interface DrawingPreferences {
  version:1
  favorites:string[]
  recent:string[]
  defaults:Record<string,DrawingStylePreset>
  templates:DrawingTemplate[]
  shortcuts:Record<string,string>
  ui:{continuous:boolean;favoritesPosition:{x:number;y:number}}
}
export interface DrawingPreferencesStore {
  read(scope:string,signal:AbortSignal):Promise<DrawingPreferences|null>
  write(scope:string,value:DrawingPreferences,signal:AbortSignal):Promise<void>
}
export interface DrawingPreferencesState {value:DrawingPreferences;status:'session-only'|'loading'|'saving'|'saved'|'error';error?:string}
export const defaultDrawingPreferences=():DrawingPreferences=>({version:1,favorites:['horizontalStraightLine','segment','rect','textAnnotation','brush'],recent:[],defaults:{},templates:[],shortcuts:{},ui:{continuous:false,favoritesPosition:{x:72,y:10}}})
const clone=<T>(value:T):T=>structuredClone(value)
export function validateDrawingPreferences(value:DrawingPreferences,catalog?:DrawingToolDescriptor[]):void {
  if(!value||!jsonSafe(value)||value.version!==1||!Array.isArray(value.favorites)||!Array.isArray(value.recent)||!value.defaults||typeof value.defaults!=='object'||Array.isArray(value.defaults)||!Array.isArray(value.templates)||!value.shortcuts||typeof value.shortcuts!=='object'||!value.ui||typeof value.ui.continuous!=='boolean'||!value.ui.favoritesPosition||Object.values(value.ui.favoritesPosition).some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0))throw Error('绘图偏好格式无效')
  for(const values of [value.favorites,value.recent])if(new Set(values).size!==values.length||values.some(id=>typeof id!=='string'||!id||catalog&&!catalog.some(t=>t.toolId===id)))throw Error('绘图偏好包含未知或重复工具')
  const preset=(p:DrawingStylePreset,toolId:string)=>{
    if(!p||Object.keys(p).some(k=>!['styles','parameters'].includes(k))||!p.styles||typeof p.styles!=='object'||Array.isArray(p.styles))throw Error('样式模板不能包含坐标、正文或身份')
    const tool=catalog?.find(t=>t.toolId===toolId);if(catalog&&!tool)throw Error('模板工具不在当前目录');if(tool)validateDrawingParameters(tool,p.parameters??{})
  }
  for(const [id,p] of Object.entries(value.defaults))preset(p,id)
  const ids=new Set<string>()
  for(const template of value.templates){
    if(!template||typeof template.id!=='string'||!template.id||ids.has(template.id)||typeof template.name!=='string'||!template.name.trim()||template.name.length>80||typeof template.toolId!=='string')throw Error('绘图模板名称或 ID 无效')
    const {id,name,toolId,...p}=template;preset(p,toolId);ids.add(id)
  }
  const combos=new Set<string>()
  for(const [toolId,combo] of Object.entries(value.shortcuts)){
    if(catalog&&!catalog.some(t=>t.toolId===toolId)||typeof combo!=='string'||!/^(?:(?:ctrl|alt|shift)\+)*[a-z0-9]$/.test(combo)||['ctrl+l','ctrl+w','ctrl+t','ctrl+n','ctrl+r','alt+f4'].includes(combo)||combos.has(combo))throw Error('快捷键无效、重复或被浏览器保留')
    combos.add(combo)
  }
}
export function createIndexedDBDrawingPreferencesStore(options:{databaseName?:string}={}):DrawingPreferencesStore&{dispose():void}{
  const db=createDrawingDatabase(options.databaseName)
  return {
    async read(scope,signal){if(typeof scope!=='string')throw Error('偏好 scope 必须是字符串');return db.transact('preferences','readonly',signal,(store,done,fail)=>{const request=store.get([scope,'preferences']);request.onsuccess=()=>{try{const value=request.result?.value;if(value)validateDrawingPreferences(value);done(value?clone(value):null)}catch(error){fail(error)}}})},
    async write(scope,value,signal){if(typeof scope!=='string')throw Error('偏好 scope 必须是字符串');validateDrawingPreferences(value);const captured=clone(value);return db.transact('preferences','readwrite',signal,(store,done)=>{store.put({scope,id:'preferences',value:captured}).onsuccess=()=>done(undefined)})},
    dispose:()=>db.dispose()
  }
}
export class DrawingPreferencesManager {
  private state:DrawingPreferencesState
  private controller=new AbortController()
  private tail:Promise<unknown>=Promise.resolve()
  private revision=0
  private disposed=false
  constructor(private options:{catalog:DrawingToolDescriptor[];initial?:DrawingPreferences;scope?:string;store?:DrawingPreferencesStore;changed?:(state:DrawingPreferencesState)=>void}){
    const initial=clone(options.initial??defaultDrawingPreferences())
    if(!options.initial){initial.favorites=initial.favorites.filter(id=>options.catalog.some(t=>t.toolId===id))}
    validateDrawingPreferences(initial,options.catalog)
    if(options.store&&typeof options.scope!=='string')throw Error('启用偏好存储时必须明确提供 drawingPreferencesScope')
    this.state={value:initial,status:options.store?'loading':'session-only'}
    if(options.store)void this.load()
  }
  getState():DrawingPreferencesState{return clone(this.state)}
  private emit(){if(!this.disposed)this.options.changed?.(this.getState())}
  private async load(){
    const revision=this.revision
    try{const value=await this.options.store!.read(this.options.scope!,this.controller.signal);if(this.disposed||revision!==this.revision)return;if(value){validateDrawingPreferences(value,this.options.catalog);this.state.value=clone(value)}this.state.status='saved';this.state.error=undefined}
    catch(error){if(this.disposed||revision!==this.revision)return;this.state.status='error';this.state.error=`偏好读取失败，本次会话仍可编辑：${error instanceof Error?error.message:String(error)}`}
    this.emit()
  }
  update(patch:Partial<DrawingPreferences>):void {
    const next={...this.state.value,...clone(patch)};validateDrawingPreferences(next,this.options.catalog)
    this.state.value=next;this.revision++;this.emit();void this.save()
  }
  async save():Promise<void>{
    if(!this.options.store){this.state.status='session-only';this.emit();return}
    const value=clone(this.state.value),revision=this.revision
    this.state.status='saving';this.state.error=undefined;this.emit()
    const run=this.tail.catch(()=>{}).then(()=>this.options.store!.write(this.options.scope!,value,this.controller.signal))
    this.tail=run
    try{await run;if(!this.disposed&&revision===this.revision)this.state.status='saved'}catch(error){if(!this.disposed&&revision===this.revision){this.state.status='error';this.state.error=`偏好尚未保存，本次会话有效：${error instanceof Error?error.message:String(error)}`}}
    this.emit()
  }
  retry():Promise<void>{return this.revision===0?this.load():this.save()}
  dispose():void{this.disposed=true;this.controller.abort()}
}
