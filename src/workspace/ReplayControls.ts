import type {ChartWorkspace} from './ChartWorkspace'
import type {ReplaySpeed,WorkspaceReplayState} from '../replay/types'
import {ReplayTimeInput} from './replayTimeInput'

export class ReplayControls {
  readonly element=document.createElement('section')
  private status=document.createElement('div')
  private timeZone=document.createElement('select')
  private from:ReplayTimeInput
  private to:ReplayTimeInput
  private cursor:ReplayTimeInput
  private slider=document.createElement('input')
  private preview=document.createElement('output')
  private driver=document.createElement('select')
  private speed=document.createElement('select')
  private actions=new Map<string,HTMLButtonElement>()
  private initialized=false
  private recordKey=''
  private fromEdited=false
  private cursorEdited=false
  private pointer=false
  constructor(private workspace:ChartWorkspace,private error:(error:unknown)=>void){
    this.element.className='tc-replay-controls';this.element.setAttribute('aria-label','统一复盘控制');this.element.tabIndex=0
    const row=document.createElement('div');row.className='tc-replay-row'
    this.timeZone.setAttribute('aria-label','复盘显示时区')
    const zones=new Set(['UTC',Intl.DateTimeFormat().resolvedOptions().timeZone,...(typeof Intl.supportedValuesOf==='function'?Intl.supportedValuesOf('timeZone'):[])])
    for(const zone of zones)this.timeZone.add(new Option(zone,zone))
    this.timeZone.value='UTC';this.timeZone.onchange=()=>{for(const input of [this.from,this.to,this.cursor])try{const value=input.read();input.set(value)}catch{}this.render(workspace.getReplayState())}
    const zone=()=>this.timeZone.value
    this.from=new ReplayTimeInput('复盘开始',zone,()=>{this.fromEdited=true})
    this.to=new ReplayTimeInput('复盘结束（不含）',zone,()=>{this.fromEdited=true})
    this.cursor=new ReplayTimeInput('定位时刻',zone,()=>{this.cursorEdited=true})
    this.driver.setAttribute('aria-label','复盘驱动图');this.driver.onchange=()=>{if(workspace.getReplayState().mode==='replay')this.run(()=>workspace.setReplayDriver(this.driver.value))}
    this.speed.setAttribute('aria-label','复盘速度');for(const speed of [1,2,4,8,16])this.speed.add(new Option(`${speed} 步/秒`,String(speed)));this.speed.onchange=()=>this.run(()=>workspace.setReplaySpeed(Number(this.speed.value) as ReplaySpeed))
    row.append(this.timeZone,this.from.element,this.to.element,this.driver,this.speed)
    const buttons=document.createElement('div');buttons.className='tc-replay-row'
    const actions:Array<[string,string,()=>void|Promise<void>]>=[
      ['start','开始复盘',()=>workspace.startReplay({from:this.from.read(),to:this.to.read(),driverCellId:this.driver.value})],
      ['resume','继续上次复盘',()=>workspace.resumeReplay()],['play','播放',()=>workspace.playReplay()],['pause','暂停',()=>workspace.pauseReplay()],
      ['back','后退一步',()=>workspace.stepReplay('backward')],['forward','前进一步',()=>workspace.stepReplay('forward')],['stop','返回实时 / 取消',()=>workspace.stopReplay()],
      ['seek','定位',()=>{const timestamp=this.cursor.read();return workspace.seekReplay(timestamp).then(()=>{this.cursorEdited=false})}],
    ]
    for(const [id,label,action]of actions){const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.replayAction=id;button.onclick=()=>this.run(action);this.actions.set(id,button);buttons.append(button)}
    buttons.append(this.cursor.element)
    this.slider.type='range';this.slider.min='0';this.slider.max='1000';this.slider.value='0';this.slider.setAttribute('aria-label','复盘时间进度')
    const target=()=>{const state=workspace.getReplayState();return Math.round(state.from!+(state.to!-1-state.from!)*Number(this.slider.value)/1000)}
    const preview=()=>{this.preview.textContent=`预览 ${new Date(target()).toISOString()}（松开或 Enter 提交）`}
    const commit=()=>this.run(()=>workspace.seekReplay(target()))
    this.slider.onpointerdown=()=>{this.pointer=true};this.slider.oninput=preview;this.slider.onpointerup=()=>{if(this.pointer){this.pointer=false;commit()}};this.slider.onpointercancel=()=>{this.pointer=false;this.render(workspace.getReplayState())}
    this.slider.onkeydown=event=>{if(['ArrowLeft','ArrowRight','Enter','Escape'].includes(event.key)){event.preventDefault();event.stopPropagation();if(event.key==='Enter')commit();else if(event.key==='Escape')this.render(workspace.getReplayState());else{this.slider.value=String(Math.min(1000,Math.max(0,Number(this.slider.value)+(event.key==='ArrowRight'?1:-1))));preview()}}}
    this.element.onkeydown=event=>{if((event.target as HTMLElement).matches('input,select,textarea'))return;if(event.key===' '){event.preventDefault();this.run(()=>workspace.getReplayState().phase==='playing'?workspace.pauseReplay():workspace.playReplay())}else if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();this.run(()=>workspace.stepReplay(event.key==='ArrowLeft'?'backward':'forward'))}else if(event.key==='Escape'){event.preventDefault();this.run(()=>workspace.pauseReplay())}}
    this.status.setAttribute('role','status');this.status.setAttribute('aria-live','polite');this.element.append(row,buttons,this.slider,this.preview,this.status)
  }
  private run(action:()=>unknown){void Promise.resolve().then(action).catch(this.error).finally(()=>this.render(this.workspace.getReplayState()))}
  render(state:WorkspaceReplayState){
    const cells=this.workspace.getCells(),record=this.workspace.getReplayRecord(),locked=state.mode==='replay'||['loading','seeking','resuming','error'].includes(state.phase),busy=['loading','seeking','resuming'].includes(state.phase)
    const selected=state.driverCellId??this.driver.value
    const choices=cells.map(c=>({value:c.cellId,label:`${c.cellId} · ${c.symbol.name??c.symbol.ticker} · ${c.period.text}`}))
    if(this.driver.options.length!==choices.length||choices.some((choice,index)=>this.driver.options[index].value!==choice.value||this.driver.options[index].text!==choice.label))this.driver.replaceChildren(...choices.map(choice=>new Option(choice.label,choice.value)))
    if(cells.some(c=>c.cellId===selected))this.driver.value=selected
    if(!this.initialized&&!this.fromEdited){const data=cells[0]?.chart?.getChart()?.getDataList();if(data?.length){this.from.set(data[0].timestamp);this.to.set(data.at(-1)!.timestamp+1);this.cursor.set(data[0].timestamp);this.initialized=true}}
    const recordKey=record?JSON.stringify([record.from,record.to,record.participants]):''
    if(record&&(locked||recordKey!==this.recordKey)){this.from.set(record.from);this.to.set(record.to);if(recordKey!==this.recordKey)this.cursor.set(record.cursor)}
    this.recordKey=recordKey
    if(state.cursor!==undefined&&!this.cursorEdited)this.cursor.set(state.cursor)
    this.from.disabled(locked);this.to.disabled(locked);this.cursor.disabled(state.mode!=='replay'||busy||state.phase==='error');this.timeZone.disabled=busy
    this.driver.disabled=busy||state.phase==='playing'||state.phase==='error';this.speed.disabled=busy||state.phase==='error';this.speed.value=String(state.speed)
    const paused=state.mode==='replay'&&!busy&&state.phase!=='error'
    for(const [id,button]of this.actions)button.disabled=id==='start'?locked||!cells.every(c=>c.chart):id==='resume'?locked||!record:id==='stop'?state.mode==='live'&&!busy&&state.phase!=='error':id==='pause'?state.phase!=='playing'&&state.phase!=='seeking':!paused
    this.slider.disabled=!paused;if(state.cursor!==undefined&&!this.pointer){this.slider.value=String(Math.round((state.cursor-state.from!)/(state.to!-1-state.from!)*1000));this.preview.textContent=`当前 ${new Date(state.cursor).toISOString()}`}
    const phases={idle:'实时',loading:'正在读取完整历史',paused:'已暂停',playing:'播放中',seeking:'正在同步时刻',resuming:'正在恢复实时',error:'需要恢复'}
    this.status.textContent=`${phases[state.phase]}。当前历史版本，可能含修订或复权；绘图与笔记可能含事后认识。${state.availabilityAssumed?'未提供原始可用时刻，按 K 线完成时刻近似。':''}${state.error?` ${state.error.cellId??''} ${state.error.code}${state.error.status?` HTTP ${state.error.status}`:''}：${state.error.message}。可调整范围重试或返回实时。`:''}`
  }
}
