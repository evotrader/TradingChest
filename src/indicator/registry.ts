import { IndicatorTemplate } from 'klinecharts'

type IndicatorLoader = () => Promise<IndicatorTemplate>
type RegisterFn = (template: IndicatorTemplate) => void

export class IndicatorRegistry {
  private _registered = new Set<string>()
  private _loaders = new Map<string, IndicatorLoader>()
  private _pending = new Map<string, Promise<void>>()
  private _registerFn: RegisterFn = () => {}

  setRegisterFn(fn: RegisterFn): void {
    this._registerFn = fn
  }

  setLoader(name: string, loader: IndicatorLoader): void {
    this._loaders.set(name, loader)
  }

  setLoaders(loaders: Record<string, IndicatorLoader>): void {
    for (const [name, loader] of Object.entries(loaders)) {
      this._loaders.set(name, loader)
    }
  }

  isRegistered(name: string): boolean {
    return this._registered.has(name)
  }

  markRegistered(name: string): void {
    this._registered.add(name)
  }

  async ensureRegistered(name: string): Promise<void> {
    if (this._registered.has(name)) return

    if (this._pending.has(name)) {
      return this._pending.get(name)!
    }

    const loader = this._loaders.get(name)
    if (!loader) {
      this._registered.add(name)
      return
    }

    const promise = (async () => {
      const template = await loader()
      this._registerFn(template)
      this._registered.add(name)
      this._pending.delete(name)
    })()

    this._pending.set(name, promise)
    return promise
  }
}
