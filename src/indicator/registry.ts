import type { IndicatorTemplate } from 'klinecharts'

export type IndicatorLoader = () => Promise<IndicatorTemplate>
type RegisterFn = (template: IndicatorTemplate) => void

/** Definitions are global; chart parameters and results never live here. */
export class IndicatorRegistry {
  private _registered = new Set<string>()
  private _loaders = new Map<string, IndicatorLoader>()
  private _templates = new Map<string, IndicatorTemplate>()
  private _pending = new Map<string, Promise<void>>()
  private _registerFn: RegisterFn = () => {throw Error('指标注册函数尚未配置')}
  private _supported: () => string[] = () => []
  setRegisterFn(fn:RegisterFn):void {this._registerFn=fn}
  setSupportedProvider(fn:()=>string[]):void {this._supported=fn}
  setLoader(name:string,loader:IndicatorLoader):void {
    if(this._loaders.get(name)===loader)return
    if(this._loaders.has(name)||this._registered.has(name)||this._supported().includes(name))throw Error(`指标 ${name} 已有定义`)
    this._loaders.set(name,loader)
  }
  setLoaders(loaders:Record<string,IndicatorLoader>):void {for(const [name,loader] of Object.entries(loaders))this.setLoader(name,loader)}
  registerDefinition(name:string,definition:IndicatorTemplate|IndicatorLoader):void {
    if(!/^[a-zA-Z][\w-]*[:./][\w./:-]+$/.test(name))throw Error('外部指标必须使用稳定命名空间')
    if(typeof definition==='function'){this.setLoader(name,definition);return}
    if(definition.name!==name)throw Error('指标定义名称与登记名称不同')
    if(this._templates.get(name)===definition)return
    if(this._loaders.has(name)||this.isRegistered(name))throw Error(`指标 ${name} 已有定义`)
    this._registerFn(definition);this._templates.set(name,definition);this.markRegistered(name)
  }
  isRegistered(name:string):boolean{return this._registered.has(name)||this._supported().includes(name)}
  markRegistered(name:string):void {this._registered.add(name)}
  async ensureRegistered(name:string):Promise<void>{
    if(this.isRegistered(name))return
    const pending=this._pending.get(name);if(pending)return pending
    const loader=this._loaders.get(name)
    if(!loader)throw Error(`指标 ${name} 没有已注册定义或加载器`)
    const promise=Promise.resolve().then(loader).then(template=>{
      if(template.name!==name)throw Error(`指标 ${name} 加载了不同名称的定义`)
      this._registerFn(template);this._templates.set(name,template);this.markRegistered(name)
    }).finally(()=>this._pending.delete(name))
    this._pending.set(name,promise);return promise
  }
}
