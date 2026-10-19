import {copyDrawingCatalog,validateDrawingParameters,type DrawingToolDescriptor} from './catalog'
import type {DrawingHistory} from './history'
import type {DrawingCommand,DrawingCommandResult,DrawingSnapshot,DrawingState,DrawingPresentation} from './types'

interface Options {
  history:DrawingHistory
  catalog?:DrawingToolDescriptor[]
  editable:(snapshot:DrawingSnapshot)=>boolean
  validate:(snapshot:DrawingSnapshot)=>void
  create:(tool:DrawingToolDescriptor)=>void
  cancel:()=>void
  project:()=>void
  owner:(snapshot:DrawingSnapshot)=>DrawingSnapshot['owner']
  coordinates?:(snapshot:DrawingSnapshot,patch:Extract<DrawingCommand,{type:'update'}>['patch'])=>DrawingSnapshot
  changed?:(state:DrawingState)=>void
  selected?:(ids:string[])=>void
}
const copy=<T>(value:T):T=>structuredClone(value)
export function mergeDrawingStyles(before:DrawingSnapshot['overlay']['styles'],patch:NonNullable<DrawingSnapshot['overlay']['styles']>):NonNullable<DrawingSnapshot['overlay']['styles']>{
  const result:any=copy(before??{})
  for(const [key,value] of Object.entries(patch))result[key]=value&&typeof value==='object'&&!Array.isArray(value)?{...result[key],...copy(value)}:copy(value)
  return result
}
const complete=():DrawingCommandResult=>({status:'completed',items:[]})
/** A command coordinator; DrawingHistory remains the sole content writer. */
export class DrawingController {
  readonly catalog:DrawingToolDescriptor[]
  private toolId:string|null=null
  private step=0
  private continuous=false
  private selectedIds:string[]=[]
  private hidden=false
  private preventDragging=false
  private clipboard:DrawingSnapshot[]=[]
  private lastResult:DrawingCommandResult|undefined
  private disposed=false
  private tail:Promise<unknown>=Promise.resolve()
  constructor(private options:Options){this.catalog=copyDrawingCatalog(options.catalog)}
  getState():DrawingState {
    const objects=this.options.history.getDrawings(),groups=new Map<string,{id:string;name:string;paneId:string}>()
    for(const object of objects)if(object.presentation?.groupId)groups.set(object.presentation.groupId,{id:object.presentation.groupId,name:object.presentation.groupName??object.presentation.groupId,paneId:object.overlay.paneId??'candle_pane'})
    return copy({toolId:this.toolId,step:this.step,continuous:this.continuous,selectedIds:this.selectedIds,scope:'chart',objects,groups:[...groups.values()],hidden:this.hidden,preventDragging:this.preventDragging,history:this.options.history.getState(),lastResult:this.lastResult})
  }
  refresh():void {
    if(this.disposed)return
    const ids=new Set(this.options.history.getDrawings().map(d=>d.logicalId))
    const selected=this.selectedIds.filter(id=>ids.has(id))
    if(selected.length!==this.selectedIds.length){this.selectedIds=selected;this.options.selected?.([...selected])}
    this.options.changed?.(this.getState())
  }
  setStep(step:number):void{this.step=step;this.refresh()}
  completed():void {
    const tool=this.catalog.find(t=>t.toolId===this.toolId)
    this.step=0
    if(this.continuous&&tool)this.options.create(tool)
    else this.toolId=null
    this.refresh()
  }
  private targets(ids:string[],write=false,allowLocked=false):DrawingSnapshot[]{
    if(new Set(ids).size!==ids.length)throw Error('绘图选择包含重复对象')
    const objects=this.options.history.getDrawings()
    return ids.map(id=>{
      const object=objects.find(o=>o.logicalId===id)
      if(!object)throw Error(`绘图 ${id} 不存在，请刷新对象列表`)
      if(!this.options.editable(object))throw Error(`绘图 ${id} 由宿主管理，不能编辑`)
      if(write&&object.overlay.lock&&!allowLocked)throw Error(`绘图 ${object.presentation?.name??id} 已锁定，请先解锁`)
      if(write&&this.options.history.getState().uncertainLogicalIds.includes(id))throw Error(`绘图 ${id} 的提交结果待确认，请刷新`)
      return object
    })
  }
  private async batch(build:()=>Array<{before?:DrawingSnapshot;after:DrawingSnapshot|null}>):Promise<DrawingCommandResult>{
    return this.options.history.submitBatch(()=>{
      const values=build()
      for(const value of values)if(value.after)this.options.validate(value.after)
      return values.map(v=>({kind:v.before?v.after?'update' as const:'delete' as const:'create' as const,logicalId:(v.before??v.after)!.logicalId,after:v.after}))
    },'programmatic')
  }
  execute(command:DrawingCommand):Promise<DrawingCommandResult>{
    const intent=copy(command),run=this.tail.catch(()=>{}).then(()=>this.run(intent))
    this.tail=run;return run
  }
  private async run(command:DrawingCommand):Promise<DrawingCommandResult>{
    if(this.disposed)return {status:'rejected',items:[],message:'绘图工作台已释放'}
    let result=complete()
    try{
      if(command.type==='tool'){
        this.options.cancel();this.toolId=command.toolId;this.continuous=command.continuous??false;this.step=0
        if(command.toolId){const tool=this.catalog.find(t=>t.toolId===command.toolId);if(!tool)throw Error('工具不在本图绘图目录中');this.options.create(tool)}
      }else if(command.type==='cancel'){
        this.options.cancel();this.toolId=null;this.step=0;result={status:'cancelled',items:[]}
      }else if(command.type==='select'){
        this.targets(command.ids)
        this.selectedIds=command.additive?[...new Set([...this.selectedIds,...command.ids])]:[...command.ids]
        this.options.selected?.([...this.selectedIds])
      }else if(command.type==='view'){
        if(command.hidden!==undefined)this.hidden=command.hidden
        if(command.preventDragging!==undefined)this.preventDragging=command.preventDragging
        this.options.project()
      }else if(command.type==='undo'||command.type==='redo'){
        await this.options.history[command.type]();result=this.options.history.getLastResult()
      }else if(command.type==='copy'){
        this.clipboard=copy(this.targets(command.ids))
      }else if(command.type==='paste'||command.type==='duplicate'){
        result=await this.batch(()=>{
        const source=command.type==='paste'?this.clipboard:this.targets(command.ids)
        if(!source.length)throw Error('没有可粘贴的绘图，请先复制对象')
        const values=source.map(snapshot=>{
          const id=`drawing-${crypto.randomUUID()}`,after=copy(snapshot)
          after.logicalId=id;delete after.backendId;after.overlay.id=id;after.overlay.lock=false
          after.presentation={...after.presentation,groupId:undefined,groupName:undefined,scope:'chart'}
          if(command.type==='paste'&&command.paneId)after.overlay.paneId=command.paneId
          after.owner=this.options.owner(after);return {after}
        })
        return values
        })
        this.selectedIds=result.items.filter(i=>i.status==='confirmed').map(i=>i.logicalId);this.options.selected?.([...this.selectedIds])
      }else{
        result=await this.batch(()=>{
        const presentation=['presentation','group','ungroup','reorder'].includes(command.type)
        const unlock=command.type==='update'&&Object.keys(command.patch).length===1&&command.patch.overlay&&Object.keys(command.patch.overlay).every(k=>k==='lock')
        const objects=this.targets(command.ids,true,!!unlock||presentation)
        if(command.type==='group'&&(new Set(objects.map(o=>o.overlay.paneId??'candle_pane')).size>1||new Set(objects.map(o=>o.presentation?.scope??'chart')).size>1))throw Error('只能对同一会话和窗格中的绘图分组')
        const groupId=command.type==='group'?`group-${crypto.randomUUID()}`:undefined
        const all=this.options.history.getDrawings().sort((a,b)=>(a.presentation?.order??0)-(b.presentation?.order??0))
        const reordered=all.map(o=>o.logicalId)
        if(command.type==='reorder'){
          const chosen=new Set(command.ids),selected=reordered.filter(id=>chosen.has(id)),rest=reordered.filter(id=>!chosen.has(id))
          if(command.direction==='front')reordered.splice(0,reordered.length,...rest,...selected)
          else if(command.direction==='back')reordered.splice(0,reordered.length,...selected,...rest)
          else if(command.direction==='up'){for(let i=reordered.length-2;i>=0;i--)if(chosen.has(reordered[i])&&!chosen.has(reordered[i+1]))[reordered[i],reordered[i+1]]=[reordered[i+1],reordered[i]]}
          else for(let i=1;i<reordered.length;i++)if(chosen.has(reordered[i])&&!chosen.has(reordered[i-1]))[reordered[i],reordered[i-1]]=[reordered[i-1],reordered[i]]
        }
        const affected=command.type==='reorder'?all:objects
        return affected.map(before=>{
          if(command.type==='delete')return {before,after:null}
          let after=copy(before)
          if(command.type==='update'){
            const {overlay,text,...patch}=command.patch
            Object.assign(after,patch)
            if(overlay){
              const styles=overlay.styles?mergeDrawingStyles(after.overlay.styles,overlay.styles):overlay.styles
              after.overlay={...after.overlay,...copy(overlay),...(overlay.styles?{styles}:{}),id:after.logicalId,name:after.overlay.name}
            }
            if(text!==undefined){const data=after.overlay.extendData;after.overlay.extendData=data&&typeof data==='object'?{...data,text}:text}
            if(command.patch.anchors&&command.patch.overlay?.points)throw Error('一次坐标修改只能指定锚点或点，不能同时提供两种权威坐标')
            if(command.patch.anchors||command.patch.overlay?.points){if(!this.options.coordinates)throw Error('坐标转换尚未就绪');after=this.options.coordinates(after,command.patch)}
            const tool=this.catalog.find(t=>t.overlayName===after.overlay.name)
            if(!tool)throw Error('工具未注册在本图目录')
            if(after.parameters)validateDrawingParameters(tool,after.parameters)
          }else{
            let patch:Partial<DrawingPresentation>={}
            if(command.type==='presentation')patch=command.patch
            if(command.type==='group'){if(!command.name.trim())throw Error('请输入组名');patch={groupId,groupName:command.name.trim()}}
            if(command.type==='ungroup')patch={groupId:undefined,groupName:undefined}
            if(command.type==='reorder')patch={order:reordered.indexOf(before.logicalId)}
            if(patch.scope&&patch.scope!=='chart')throw Error('共享作用域需要已确认的共享会话')
            after.presentation={...after.presentation,...patch}
          }
          return {before,after}
        })
        })
      }
    }catch(error){result={status:'rejected',items:[],message:error instanceof Error?error.message:String(error)}}
    this.lastResult=result;this.refresh();return copy(result)
  }
  dispose():void{this.disposed=true;this.clipboard=[];this.selectedIds=[]}
}
