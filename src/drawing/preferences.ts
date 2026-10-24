import type {DrawingSnapshot} from './types'
import type {DrawingToolDescriptor} from './catalog'
import {validateDrawingParameters} from './catalog'
import {jsonSafe} from '../persistence/v2'
import {createDrawingDatabase} from './indexedDB'
import {shortcutCombo} from '../shortcut/combo'

export interface DrawingStylePreset {styles:NonNullable<DrawingSnapshot['overlay']['styles']>;parameters?:DrawingSnapshot['parameters']}
export interface DrawingTemplate extends DrawingStylePreset {id:string;name:string;toolId:string}
export interface DrawingPreferences {
  version:1
  favorites:string[]
  recent:string[]
  defaults:Record<string,DrawingStylePreset>
  lastStyles?:Record<string,DrawingStylePreset>
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
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b)
function mergeInitialEdit(stored:DrawingPreferences,before:DrawingPreferences,patch:Partial<DrawingPreferences>):DrawingPreferences {
  const result=clone(stored)
  for(const [field,value] of Object.entries(patch)){
    if(field==='templates'){
      const next=value as DrawingTemplate[],previous=new Map(before.templates.map(t=>[t.id,t])),map=new Map(result.templates.map(t=>[t.id,t]))
      for(const id of previous.keys())if(!next.some(t=>t.id===id))map.delete(id)
      for(const template of next)if(!equal(template,previous.get(template.id)))map.set(template.id,clone(template))
      result.templates=[...map.values()]
    }else if(field==='defaults'||field==='lastStyles'||field==='shortcuts'||field==='ui'){
      const previous=(before[field]??{}) as any,next=value as any,target=((result as any)[field]??={}) as any
      for(const key of Object.keys(previous))if(!(key in next))delete target[key]
      for(const [key,entry] of Object.entries(next))if(!equal(previous[key],entry))target[key]=clone(entry)
    }else if(field==='recent')result.recent=[...new Set([...(value as string[]),...result.recent])].slice(0,12)
    else (result as any)[field]=clone(value)
  }
  return result
}
export function validateDrawingPreferences(value:DrawingPreferences,catalog?:DrawingToolDescriptor[]):void {
  if(!value||!jsonSafe(value)||value.version!==1||!Array.isArray(value.favorites)||!Array.isArray(value.recent)||!value.defaults||typeof value.defaults!=='object'||Array.isArray(value.defaults)||!Array.isArray(value.templates)||!value.shortcuts||typeof value.shortcuts!=='object'||!value.ui||typeof value.ui.continuous!=='boolean'||!value.ui.favoritesPosition||Object.values(value.ui.favoritesPosition).some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0))throw Error('绘图偏好格式无效')
  for(const values of [value.favorites,value.recent])if(new Set(values).size!==values.length||values.some(id=>typeof id!=='string'||!id||catalog&&!catalog.some(t=>t.toolId===id)))throw Error('绘图偏好包含未知或重复工具')
  const preset=(p:DrawingStylePreset,toolId:string)=>{
    if(!p||Object.keys(p).some(k=>!['styles','parameters'].includes(k))||!p.styles||typeof p.styles!=='object'||Array.isArray(p.styles))throw Error('样式模板不能包含坐标、正文或身份')
    const tool=catalog?.find(t=>t.toolId===toolId);if(catalog&&!tool)throw Error('模板工具不在当前目录');if(tool)validateDrawingParameters(tool,p.parameters??{})
  }
  for(const [id,p] of Object.entries(value.defaults))preset(p,id)
  for(const [id,p] of Object.entries(value.lastStyles??{}))preset(p,id)
  const ids=new Set<string>()
  for(const template of value.templates){
    if(!template||typeof template.id!=='string'||!template.id||ids.has(template.id)||typeof template.name!=='string'||!template.name.trim()||template.name.length>80||typeof template.toolId!=='string')throw Error('绘图模板名称或 ID 无效')
    const {id,name,toolId,...p}=template;preset(p,toolId);ids.add(id)
  }
  const combos=new Set<string>()
  for(const [toolId,combo] of Object.entries(value.shortcuts)){
    if(catalog&&!catalog.some(t=>t.toolId===toolId)||typeof combo!=='string'||!/^(?:(?:ctrl|alt|shift)\+)*[a-z0-9]$/.test(combo)||['ctrl+l','ctrl+w','ctrl+t','ctrl+n','ctrl+r','ctrl+z','ctrl+shift+z','ctrl+y','ctrl+c','ctrl+v','alt+f4'].includes(combo)||combos.has(combo))throw Error('快捷键无效、重复或被浏览器保留')
    const canonical=combo.split('+'),key=canonical.pop();if(shortcutCombo({ctrl:canonical.includes('ctrl'),alt:canonical.includes('alt'),shift:canonical.includes('shift')},key!)!==combo)throw Error('快捷键修饰键顺序无效或重复')
    combos.add(combo)
  }
  const effective=new Set<string>();for(const tool of catalog??[]){const combo=value.shortcuts[tool.toolId]??tool.shortcut?.toLowerCase();if(combo){if(effective.has(combo))throw Error('快捷键与其它工具的实际快捷键冲突');effective.add(combo)}}
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
  private initialized=false
  private initialRead?:Promise<void>
  private initialEdits:Array<{before:DrawingPreferences;patch:Partial<DrawingPreferences>}>=[]
  private scheduledRevision=-1
  constructor(private options:{catalog:DrawingToolDescriptor[];initial?:DrawingPreferences;scope?:string;store?:DrawingPreferencesStore;changed?:(state:DrawingPreferencesState)=>void}){
    const initial=clone(options.initial??defaultDrawingPreferences())
    if(!options.initial){initial.favorites=initial.favorites.filter(id=>options.catalog.some(t=>t.toolId===id))}
    validateDrawingPreferences(initial,options.catalog)
    if(options.store&&typeof options.scope!=='string')throw Error('启用偏好存储时必须明确提供 drawingPreferencesScope')
    this.state={value:initial,status:options.store?'loading':'session-only'}
    this.initialized=!options.store
    if(options.store)this.initialRead=this.load()
  }
  getState():DrawingPreferencesState{return clone(this.state)}
  /** Compare the canonical preset before copying the complete preferences document. */
  rememberStyle(toolId:string,preset:DrawingStylePreset):void {
    if(!equal(this.state.value.lastStyles?.[toolId],preset))this.update({lastStyles:{...this.state.value.lastStyles,[toolId]:preset}})
  }
  private emit(){if(!this.disposed)this.options.changed?.(this.getState())}
  private async load(){
    try{
      const value=await this.options.store!.read(this.options.scope!,this.controller.signal);if(this.disposed)return
      let merged=clone(value??this.options.initial??defaultDrawingPreferences())
      if(!value&&!this.options.initial)merged.favorites=merged.favorites.filter(id=>this.options.catalog.some(t=>t.toolId===id))
      validateDrawingPreferences(merged,this.options.catalog)
      for(const edit of this.initialEdits)merged=mergeInitialEdit(merged,edit.before,edit.patch)
      validateDrawingPreferences(merged,this.options.catalog);this.state.value=merged;this.initialized=true;this.initialEdits=[]
      this.state.status=this.revision?'saving':'saved';this.state.error=undefined
    }
    catch(error){if(this.disposed)return;this.initialized=false;this.state.status='error';this.state.error=`偏好读取失败，原件不会被覆盖，本次会话仍可编辑：${error instanceof Error?error.message:String(error)}`}
    this.emit()
  }
  update(patch:Partial<DrawingPreferences>):void {
    const next={...this.state.value,...clone(patch)};validateDrawingPreferences(next,this.options.catalog)
    if(!this.initialized)this.initialEdits.push({before:clone(this.state.value),patch:clone(patch)})
    this.state.value=next;this.revision++;this.emit();void this.save()
  }
  async save():Promise<void>{
    if(!this.options.store){this.state.status='session-only';this.emit();return}
    if(!this.initialized){await this.initialRead;if(!this.initialized||this.disposed)return}
    if(this.scheduledRevision===this.revision){await this.tail.catch(()=>{});return}
    const value=clone(this.state.value),revision=this.revision
    this.scheduledRevision=revision
    this.state.status='saving';this.state.error=undefined;this.emit()
    const run=this.tail.catch(()=>{}).then(()=>this.options.store!.write(this.options.scope!,value,this.controller.signal))
    this.tail=run
    try{await run;if(!this.disposed&&revision===this.revision)this.state.status='saved'}catch(error){if(!this.disposed&&revision===this.revision){this.scheduledRevision=-1;this.state.status='error';this.state.error=`偏好尚未保存，本次会话有效：${error instanceof Error?error.message:String(error)}`}}
    this.emit()
  }
  async retry():Promise<void>{if(!this.initialized){this.initialRead=this.load();await this.initialRead;if(!this.initialized)return}await this.save()}
  dispose():void{this.disposed=true;this.controller.abort()}
}
