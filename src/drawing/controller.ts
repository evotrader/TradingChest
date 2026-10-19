import {copyDrawingCatalog,validateDrawingParameters,type DrawingToolDescriptor} from './catalog'
import type {DrawingHistory} from './history'
import type {DrawingCoordinator} from './coordinator'
import type {DrawingPreferencesManager,DrawingStylePreset,DrawingTemplate} from './preferences'
import type {DrawingCommand,DrawingCommandResult,DrawingSnapshot,DrawingState,DrawingPresentation,DrawingCommitResult,DrawingHistoryState} from './types'

interface Options {
  history:DrawingHistory
  coordinator?:DrawingCoordinator
  preferences?:DrawingPreferencesManager
  catalog?:DrawingToolDescriptor[]
  editable:(snapshot:DrawingSnapshot)=>boolean
  validate:(snapshot:DrawingSnapshot)=>void
  create:(tool:DrawingToolDescriptor)=>void
  cancel:()=>void
  finish?:()=>Promise<DrawingCommandResult>
  translate?:(snapshot:DrawingSnapshot,dx:number,dy:number)=>DrawingSnapshot
  translatePoint?:(snapshot:DrawingSnapshot,index:number,dx:number,dy:number)=>DrawingSnapshot
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
type DrawingIntent=DrawingCommand|{type:'move-point';ids:string[];index:number;dx:number;dy:number}
/** A command coordinator; DrawingHistory remains the sole content writer. */
export class DrawingController {
  readonly catalog:DrawingToolDescriptor[]
  private toolId:string|null=null
  private step=0
  private continuous=false
  private selectedIds:string[]=[]
  private magnet:import('./snap').DrawingMagnetMode='normal'
  private hidden=false
  private preventDragging=false
  private clipboard:DrawingSnapshot[]=[]
  private lastResult:DrawingCommandResult|undefined
  private disposed=false
  private tail:Promise<unknown>=Promise.resolve()
  constructor(private options:Options){this.catalog=copyDrawingCatalog(options.catalog)}
  private executionIds:string[]|undefined
  private previewBases:DrawingSnapshot[]|undefined
  private travelTarget?:{history:DrawingHistory;generation:number}
  private rememberedHistory():DrawingHistory|undefined{
    const target=this.travelTarget
    return target&&target.history.isAvailable(target.generation)&&(!this.options.coordinator||this.options.coordinator.scopeOf(target.history)!==undefined)?target.history:undefined
  }
  private history(write=false):DrawingHistory{return this.options.coordinator?.history(this.executionIds??this.selectedIds,write)??this.options.history}
  private drawings():DrawingSnapshot[]{return this.options.coordinator?.getDrawings()??this.options.history.getDrawings()}
  getState():DrawingState {
    const objects=this.drawings(),groups=new Map<string,{id:string;name:string;paneId:string}>()
    for(const object of objects)if(object.presentation?.groupId)groups.set(object.presentation.groupId,{id:object.presentation.groupId,name:object.presentation.groupName??object.presentation.groupId,paneId:object.overlay.paneId??'candle_pane'})
    const remembered=this.rememberedHistory(),history=this.getHistoryState()
    return {origin:this.options.coordinator?.getOrigin()??'user',toolId:this.toolId,step:this.step,continuous:this.continuous,selectedIds:[...this.selectedIds],scope:this.options.coordinator?.getScope()??'chart',historyScope:remembered?this.options.coordinator?.scopeOf(remembered)??'chart':this.selectedIds.length?(objects.find(d=>d.logicalId===this.selectedIds[0])?.presentation?.scope??'chart'):this.options.coordinator?.getScope()??'chart',sharing:this.options.coordinator?.getSharing(),objects,groups:[...groups.values()],magnet:this.magnet,hidden:this.hidden,preventDragging:this.preventDragging,history,preferences:this.options.preferences?.getState(),lastResult:this.lastResult?copy(this.lastResult):undefined}
  }
  getSelectedIds():string[]{return [...this.selectedIds]}
  getHistoryState():DrawingHistoryState{
    const remembered=this.rememberedHistory(),aggregate=this.options.coordinator?.state(this.selectedIds)??this.options.history.getState()
    if(!remembered)return aggregate
    const state=remembered.getState();return {...aggregate,error:state.error,canUndo:state.canUndo,canRedo:state.canRedo}
  }
  getViewState():{hidden:boolean;preventDragging:boolean;magnet:import('./snap').DrawingMagnetMode}{return {magnet:this.magnet,hidden:this.hidden,preventDragging:this.preventDragging}}
  refresh():void {
    if(this.disposed)return
    const ids=new Set(this.drawings().map(d=>d.logicalId))
    const selected=this.selectedIds.filter(id=>ids.has(id))
    if(selected.length!==this.selectedIds.length){this.selectedIds=selected;this.options.selected?.([...selected])}
    this.options.changed?.(this.getState())
  }
  setStep(step:number):void{if(this.step===step)return;this.step=step;this.refresh()}
  rememberConfirmed(value:DrawingSnapshot):void{
    const preferences=this.options.preferences,tool=this.catalog.find(tool=>tool.overlayName===value.overlay.name);if(!preferences||!tool)return
    const previous=preferences.getState().value,preset={styles:copy(value.overlay.styles??{}),parameters:copy(value.parameters??{})};if(JSON.stringify(previous.lastStyles?.[tool.toolId])!==JSON.stringify(preset))preferences.update({lastStyles:{...previous.lastStyles,[tool.toolId]:preset}})
  }
  completed(expectedToolId?:string):void {
    if(expectedToolId&&expectedToolId!==this.toolId)return
    const tool=this.catalog.find(t=>t.toolId===this.toolId)
    this.step=0
    if(this.continuous&&tool)this.options.create(tool)
    else this.toolId=null
    this.refresh()
  }
  private targets(ids:string[],write=false,allowLocked=false,allowMigration=false):DrawingSnapshot[]{
    if(new Set(ids).size!==ids.length)throw Error('绘图选择包含重复对象')
    return ids.map(id=>{
      const object=this.options.coordinator?.getDrawing(id)??this.options.history.getDrawing(id)
      if(!object)throw Error(`绘图 ${id} 不存在，请刷新对象列表`)
      if(!this.options.editable(object))throw Error(`绘图 ${id} 由宿主管理，不能编辑`)
      if(write&&object.migration&&!allowMigration)throw Error('绘图转移结果待核对，请先刷新共享文档并完成原目标转移')
      if(write&&object.overlay.lock&&!allowLocked)throw Error(`绘图 ${object.presentation?.name??id} 已锁定，请先解锁`)
      if(write&&this.history().getState().uncertainLogicalIds.includes(id))throw Error(`绘图 ${id} 的提交结果待确认，请刷新`)
      return object
    })
  }
  private async batch(build:()=>Array<{before?:DrawingSnapshot;after:DrawingSnapshot|null}>):Promise<DrawingCommandResult>{
    const history=this.history(true);this.rememberHistory(history)
    return history.submitBatch(()=>{
      for(const before of this.previewBases??[])if(JSON.stringify(this.options.coordinator?.getDrawing(before.logicalId)??this.options.history.getDrawing(before.logicalId))!==JSON.stringify(before))throw Error('绘图已被更新，本次手势已取消，请重新操作')
      const values=build().map(value=>({...value,after:value.after?this.options.coordinator?.prepare(value.after)??value.after:null}))
      for(const value of values)if(value.after)this.options.validate(value.after)
      return values.map(v=>({kind:v.before?v.after?'update' as const:'delete' as const:'create' as const,logicalId:(v.before??v.after)!.logicalId,after:v.after}))
    },'programmatic')
  }
  execute(command:DrawingCommand):Promise<DrawingCommandResult>{
    return this.enqueue(command)
  }
  /** Legacy methods and visible commands share the same serial history routing. */
  travel(direction:'undo'|'redo'):Promise<DrawingCommitResult|undefined>{
    const assertContext=this.captureTravelContext(),run=this.tail.catch(()=>{}).then(()=>{assertContext();return this.travelNow(direction)});this.tail=run;return run
  }
  rememberHistory(history:DrawingHistory):void{this.travelTarget={history,generation:history.getDocumentGeneration()}}
  private captureTravelContext():()=>void{
    const generation=this.options.history.getDocumentGeneration(),epoch=this.options.coordinator?.getBindingEpoch()
    return ()=>{if(this.disposed||this.options.history.getDocumentGeneration()!==generation||this.options.coordinator?.getBindingEpoch()!==epoch)throw new DOMException('排队期间绘图上下文已改变，已取消旧撤销或重做','AbortError')}
  }
  private async travelNow(direction:'undo'|'redo'):Promise<DrawingCommitResult|undefined>{
    if(this.disposed)throw Error('绘图工作台已释放')
    this.refresh()
    const history=this.rememberedHistory()??this.history(true)
    this.options.coordinator?.assertWritable(history)
    this.rememberHistory(history)
    try{return await history[direction]()}finally{this.refresh()}
  }
  commitPreview(command:DrawingCommand,before:DrawingSnapshot[]):Promise<DrawingCommandResult>{return this.enqueue(command,before)}
  nudgePoint(id:string,index:number,dx:number,dy:number):Promise<DrawingCommandResult>{return this.enqueue({type:'move-point',ids:[id],index,dx,dy})}
  private enqueue(command:DrawingIntent,before?:DrawingSnapshot[]):Promise<DrawingCommandResult>{
    const intent=copy(command),bases=before&&copy(before),assertContext=command.type==='undo'||command.type==='redo'?this.captureTravelContext():undefined,run=this.tail.catch(()=>{}).then(()=>this.run(intent,bases,assertContext))
    this.tail=run;return run
  }
  private async run(command:DrawingIntent,before?:DrawingSnapshot[],assertContext?:()=>void):Promise<DrawingCommandResult>{
    if(this.disposed)return {status:'rejected',items:[],message:'绘图工作台已释放'}
    let result=complete()
    this.executionIds='ids' in command?command.ids:undefined
    this.previewBases=before
    if(!['undo','redo','view','copy','preferences','preferences-retry','template'].includes(command.type))this.travelTarget=undefined
    try{
      assertContext?.()
      if(command.type==='scope'){
        if(!this.options.coordinator&&command.scope!=='chart')throw Error('宿主未启用共享绘图')
        this.options.coordinator?.setScope(command.scope);this.selectedIds=[];this.options.selected?.([])
      }else if(command.type==='transfer'){
        if(!this.options.coordinator)throw Error('共享绘图尚未启用')
        this.targets(command.ids,true,false,true);await this.options.coordinator.transfer(command.ids,command.scope)
      }else if(command.type==='recover-transfer'){
        if(!this.options.coordinator)throw Error('共享恢复尚未启用');await this.options.coordinator.recover(command.id,command.scope)
      }else if(command.type==='shared'){
        const session=this.options.coordinator?.getSession(command.scope);if(!session)throw Error('共享绘图尚未启用')
        if(command.action==='save-as')await this.options.coordinator!.saveAs();else if(command.action==='save')await session.save();else await session.refresh({discardLocal:command.action==='discard-refresh'})
      }else if(command.type==='tool'){
        this.options.cancel();this.toolId=command.toolId;this.continuous=command.continuous??this.options.preferences?.getState().value.ui.continuous??false;this.step=0
        if(command.toolId){const tool=this.catalog.find(t=>t.toolId===command.toolId);if(!tool)throw Error('工具不在本图绘图目录中');this.options.create(tool)}
        if(command.toolId&&this.options.preferences){const value=this.options.preferences.getState().value;this.options.preferences.update({recent:[command.toolId,...value.recent.filter(id=>id!==command.toolId)].slice(0,12)})}
      }else if(command.type==='finish'){
        if(!this.options.finish)throw Error('当前图表没有可完成的绘制');result=await this.options.finish()
      }else if(command.type==='cancel'){
        this.options.cancel();this.toolId=null;this.step=0;result={status:'cancelled',items:[]}
      }else if(command.type==='select'){
        this.targets(command.ids)
        this.selectedIds=command.additive?[...new Set([...this.selectedIds,...command.ids])]:[...command.ids]
        this.options.selected?.([...this.selectedIds])
      }else if(command.type==='view'){
        if(command.magnet!==undefined){if(!['normal','weak_magnet','strong_magnet'].includes(command.magnet))throw Error('吸附模式无效');this.magnet=command.magnet}
        if(command.hidden!==undefined)this.hidden=command.hidden
        if(command.preventDragging!==undefined)this.preventDragging=command.preventDragging
        this.options.project()
      }else if(command.type==='preferences'){
        if(!this.options.preferences)throw Error('绘图偏好尚未就绪')
        this.options.preferences.update(command.patch)
      }else if(command.type==='preferences-retry'){
        await this.options.preferences?.retry()
      }else if(command.type==='template'){
        const preferences=this.options.preferences;if(!preferences)throw Error('绘图偏好尚未就绪')
        const value=preferences.getState().value,template=value.templates.find(t=>t.id===command.templateId)
        if(['rename','delete','overwrite','apply'].includes(command.action)&&!template)throw Error('模板不存在，请刷新列表')
        if(command.action==='delete')preferences.update({templates:value.templates.filter(t=>t.id!==command.templateId)})
        else if(command.action==='rename'){
          if(!command.name?.trim())throw Error('请输入模板名称')
          preferences.update({templates:value.templates.map(t=>t.id===command.templateId?{...t,name:command.name!.trim()}:t)})
        }else if(command.action==='apply'){
          result=await this.batch(()=>this.targets(command.ids??this.selectedIds,true).map(before=>{
            const tool=this.catalog.find(t=>t.overlayName===before.overlay.name)!
            if(tool.toolId!==template!.toolId&&!command.styleOnly)throw Error('不同工具只能显式应用共同样式')
            const after=copy(before);after.overlay.styles=mergeDrawingStyles(after.overlay.styles,template!.styles)
            if(!command.styleOnly){after.parameters=copy(template!.parameters??{});validateDrawingParameters(tool,after.parameters)}
            return {before,after}
          }))
        }else{
          const selected=this.targets(command.ids??this.selectedIds)
          if(selected.length!==1)throw Error('请选择一个绘图作为样式来源')
          const source=selected[0],tool=this.catalog.find(t=>t.overlayName===source.overlay.name)!
          const preset:DrawingStylePreset={styles:copy(source.overlay.styles??{}),parameters:copy(source.parameters??{})}
          if(command.action==='default')preferences.update({defaults:{...value.defaults,[tool.toolId]:preset},lastStyles:{...value.lastStyles,[tool.toolId]:preset}})
          else{
            if(!command.name?.trim()&&command.action!=='overwrite')throw Error('请输入模板名称')
            if(template&&template.toolId!==tool.toolId)throw Error('不能用不同工具覆盖此模板')
            const next:DrawingTemplate={...preset,id:template?.id??crypto.randomUUID(),name:command.name?.trim()??template!.name,toolId:tool.toolId}
            preferences.update({templates:[...value.templates.filter(t=>t.id!==next.id),next]})
          }
        }
      }else if(command.type==='undo'||command.type==='redo'){
        await this.travelNow(command.type);result=(this.rememberedHistory()??this.history()).getLastResult()
      }else if(command.type==='copy'){
        this.clipboard=copy(this.targets(command.ids))
      }else if(command.type==='paste'||command.type==='duplicate'){
        if(command.type==='paste')this.executionIds=[]
        result=await this.batch(()=>{
        const source=command.type==='paste'?this.clipboard:this.targets(command.ids)
        if(!source.length)throw Error('没有可粘贴的绘图，请先复制对象')
        const values=source.map(snapshot=>{
          const id=`drawing-${crypto.randomUUID()}`,after=copy(snapshot)
          after.logicalId=id;delete after.backendId;after.overlay.id=id;after.overlay.lock=false
          after.presentation={...after.presentation,groupId:undefined,groupName:undefined,scope:this.options.coordinator?.getScope()??'chart'}
          if(command.type==='paste'&&command.paneId)after.overlay.paneId=command.paneId
          after.owner=this.options.owner(after);return {after}
        })
        return values
        })
        this.selectedIds=result.items.filter(i=>i.status==='confirmed').map(i=>i.logicalId);this.options.selected?.([...this.selectedIds])
      }else{
        result=await this.batch(()=>{
        const presentation=['presentation','group','ungroup','reorder'].includes(command.type)
        const unlock=command.type==='update'&&Object.keys(command.patch).length===1&&command.patch.overlay&&Object.keys(command.patch.overlay).every(k=>k==='lock'||k==='visible')
        const objects=this.targets(command.ids,true,!!unlock||presentation)
        if(command.type==='move'&&new Set(objects.map(o=>o.overlay.paneId??'candle_pane')).size>1)throw Error('不能整体移动不同窗格中的绘图')
        if(command.type==='group'&&(new Set(objects.map(o=>o.overlay.paneId??'candle_pane')).size>1||new Set(objects.map(o=>o.presentation?.scope??'chart')).size>1))throw Error('只能对同一会话和窗格中的绘图分组')
        const groupId=command.type==='group'?`group-${crypto.randomUUID()}`:undefined
        const all=this.history().getDrawings().sort((a,b)=>(a.presentation?.order??0)-(b.presentation?.order??0))
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
          if(command.type==='move-point'){
            if(!this.options.translatePoint)throw Error('控制点坐标尚未就绪');after=this.options.translatePoint(before,command.index,command.dx,command.dy)
          }else if(command.type==='move'){
            if(!this.options.translate)throw Error('绘图坐标尚未就绪');after=this.options.translate(before,command.dx,command.dy)
            if(command.clone){const id=`drawing-${crypto.randomUUID()}`;after.logicalId=id;after.overlay.id=id;delete after.backendId;delete after.migration;after.presentation={...after.presentation,groupId:undefined,groupName:undefined};after.owner=this.options.owner(after);return {after}}
          }
          else if(command.type==='update'){
            const {overlay,text,...patch}=command.patch
            if(before.presentation?.scope&&before.presentation.scope!=='chart'&&patch.yAxisId!==undefined)throw Error('共享绘图使用各图主价格轴；请先移至本图再指定独立轴')
            Object.assign(after,patch)
            if(patch.parameters)after.parameters={...before.parameters,...patch.parameters}
            if(patch.presentation)after.presentation={...before.presentation,...patch.presentation}
            if(patch.presentation?.scope&&patch.presentation.scope!==(before.presentation?.scope??'chart'))throw Error('共享作用域需通过作用域转移命令修改')
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
            if(patch.scope&&patch.scope!==(before.presentation?.scope??'chart'))throw Error('共享作用域需要已确认的共享会话')
            after.presentation={...after.presentation,...patch}
          }
          return {before,after}
        })
        })
      }
    }catch(error){result={status:'rejected',items:[],message:error instanceof Error?error.message:String(error)}}
    this.executionIds=undefined;this.previewBases=undefined;this.lastResult=result;this.refresh();return copy(result)
  }
  dispose():void{this.disposed=true;this.clipboard=[];this.selectedIds=[];this.travelTarget=undefined}
}
