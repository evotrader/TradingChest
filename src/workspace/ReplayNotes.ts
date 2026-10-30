import type {ChartWorkspace} from './ChartWorkspace'
import type {ReplayBookmark,WorkspaceReplayState} from '../replay/types'
import type {WorkspaceReplayController} from './replayController'

type Events=ReturnType<WorkspaceReplayController['events']>
export class ReplayNotes {
  readonly element=document.createElement('aside')
  private drawer=document.createElement('details')
  private panel=document.createElement('div')
  private tab:'events'|'notes'='events'
  private tabs:HTMLButtonElement[]=[]
  private cells=document.createElement('select')
  private layers=document.createElement('select')
  private search=document.createElement('input')
  private list=document.createElement('ul')
  private detail=document.createElement('div')
  private notes=document.createElement('textarea')
  private notesDraft=false
  private form=document.createElement('form')
  private title=document.createElement('input')
  private note=document.createElement('textarea')
  private editor?:ReplayBookmark
  private newBookmark=false
  private bookmarkDraft=false
  private notice=document.createElement('div')
  private editing=document.createElement('div')
  private version=''
  private rendered:Events=[]
  private selectedEvent?:{cellId:string;layerId:string;eventId:string}
  private draftDialog?:{element:HTMLElement;cancel:()=>void}
  constructor(private workspace:ChartWorkspace,private events:()=>Events,private locations:()=>ReturnType<WorkspaceReplayController['getLocations']>,private report:(error:unknown)=>void,private dirty:()=>boolean){
    this.element.className='tc-replay-notes';const summary=document.createElement('summary');summary.textContent='事件 / 书签与备注';this.drawer.append(summary,this.panel);this.element.append(this.drawer)
    this.drawer.ontoggle=()=>{this.element.dataset.open=String(this.drawer.open);if(this.drawer.open)this.render(workspace.getReplayState());else if(this.hasDraft()){this.drawer.open=true;void this.guardDraft().then(()=>{this.drawer.open=false}).catch(report)}}
    this.panel.setAttribute('aria-label','复盘研究记录');const tabs=document.createElement('div');tabs.setAttribute('role','tablist')
    for(const [name,label]of [['events','事件'],['notes','书签与备注']]as const){const button=document.createElement('button');button.type='button';button.textContent=label;button.setAttribute('role','tab');button.onclick=()=>{this.tab=name;this.version='';this.render(workspace.getReplayState())};tabs.append(button);this.tabs.push(button)}
    this.cells.setAttribute('aria-label','筛选窗格');this.layers.setAttribute('aria-label','筛选事件层');this.search.type='search';this.search.setAttribute('aria-label','筛选事件或书签关键词');this.search.placeholder='按标题筛选'
    for(const control of [this.cells,this.layers,this.search])control.oninput=()=>{this.version='';this.render(workspace.getReplayState())}
    this.list.onclick=event=>{const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button[data-row]');if(!button)return;const row=Number(button.dataset.row);if(this.tab==='events')this.selectEvent(row);else this.editBookmark(row)}
    this.notes.setAttribute('aria-label','复盘会话备注');this.notes.maxLength=20000;this.notes.rows=5;this.notes.oninput=()=>{this.notesDraft=true;this.notice.textContent='备注草稿尚未应用'}
    const apply=this.button('应用会话备注',()=>{workspace.updateReplayNotes(this.notes.value);this.notesDraft=false;this.notice.textContent='备注已应用，保存工作台后写入存储'})
    const add=this.button('在当前时刻添加书签',()=>{const state=workspace.getReplayState(),record=workspace.getReplayRecord();if(!record)throw Error('请先开始一次复盘');this.openBookmark({id:'',timestamp:state.cursor??record.cursor,title:'',note:''},true)})
    const explanation=document.createElement('p');explanation.textContent='笔记是当前研究材料，可能包含事后认识。应用后还需保存工作台；不会存储事件 payload。'
    this.editing.append(explanation,this.notes,apply,add,this.form)
    this.title.setAttribute('aria-label','书签标题');this.title.maxLength=120;this.note.setAttribute('aria-label','书签备注');this.note.maxLength=4000;this.note.rows=4
    this.title.oninput=this.note.oninput=()=>{this.bookmarkDraft=true}
    const save=document.createElement('button');save.type='submit';save.textContent='应用书签'
    this.form.onsubmit=event=>{event.preventDefault();this.run(()=>this.applyBookmark())}
    this.form.append(this.title,this.note,save,this.button('跳转书签',async()=>{if(!this.editor)return;await workspace.seekReplay(this.editor.timestamp)}),this.button('删除书签',()=>{if(!this.editor)return;if(!this.newBookmark)workspace.removeReplayBookmark(this.editor.id);this.closeEditor()}),this.button('关闭书签编辑',async()=>{await this.guardDraft();this.closeEditor()}));this.form.hidden=true
    this.detail.setAttribute('role','status');this.notice.setAttribute('role','status');this.panel.append(tabs,this.cells,this.layers,this.search,this.list,this.detail,this.editing,this.notice)
    this.panel.onkeydown=event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();this.run(async()=>{await this.guardDraft();this.closeEditor();this.drawer.open=false;summary.focus()})}}
  }
  private run(action:()=>unknown){void Promise.resolve().then(action).catch(this.report).finally(()=>this.render(this.workspace.getReplayState()))}
  private button(label:string,action:()=>unknown){const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=()=>this.run(action);return button}
  private hasDraft(){return this.notesDraft||this.bookmarkDraft}
  private closeEditor(){this.editor=undefined;this.bookmarkDraft=false;this.form.hidden=true}
  private openBookmark(value:ReplayBookmark,isNew=false){
    if(this.bookmarkDraft){this.run(async()=>{await this.guardDraft();this.openBookmark(value,isNew)});return}
    this.editor=structuredClone(value);this.newBookmark=isNew;this.title.value=value.title;this.note.value=value.note;this.form.hidden=false;this.bookmarkDraft=isNew;this.title.focus()
  }
  private applyBookmark(){if(!this.editor)return;const {id,...input}=this.editor,value={...input,title:this.title.value,note:this.note.value};const actual=this.newBookmark?this.workspace.addReplayBookmark(value):(this.workspace.updateReplayBookmark(id,value),id);this.editor={...value,id:actual};this.newBookmark=false;this.bookmarkDraft=false;this.notice.textContent='书签已应用，保存工作台后写入存储'}
  private editBookmark(index:number){const bookmark=this.bookmarks()[index];if(bookmark)this.run(async()=>{await this.guardDraft();this.openBookmark(bookmark)})}
  private bookmarks(){return (this.workspace.getReplayRecord()?.bookmarks??[]).filter(b=>(!this.cells.value||b.cellId===this.cells.value)&&b.title.toLocaleLowerCase().includes(this.search.value.toLocaleLowerCase()))}
  private eventRows(){return this.rendered.flatMap(layer=>layer.events.map(event=>({layer,event}))).filter(({layer,event})=>(!this.cells.value||layer.cellId===this.cells.value)&&(!this.layers.value||`${layer.cellId}:${layer.layerId}`===this.layers.value)&&event.label.toLocaleLowerCase().includes(this.search.value.toLocaleLowerCase()))}
  private selectEvent(index:number){
    const selected=this.eventRows()[index];if(!selected)return
    const {layer,event}=selected,ref={cellId:layer.cellId,layerId:layer.layerId,eventId:event.id}
    this.run(async()=>{
      await this.workspace.navigateReplayEvent(ref)
      this.selectedEvent=ref
      const locations=this.locations().map(v=>`${v.cellId}：${v.status==='exact-timestamp'?'精确 K 线时标':v.status==='reference-window'?`相邻实际时标 ${new Date(v.bracketStart!).toISOString()} 至 ${new Date(v.bracketEnd!).toISOString()}`:'没有可定位的 K 线'}（原始目标 ${new Date(v.requestedTimestamp).toISOString()}）`).join('；')
      this.detail.replaceChildren(document.createTextNode(`事件发生于 ${new Date(event.timestamp).toISOString()}，${new Date(event.availableAt!).toISOString()} 后可见。${locations}。`),this.button('为此事件添加书签',async()=>{await this.guardDraft();this.tab='notes';this.openBookmark({id:'',timestamp:Math.max(event.timestamp,event.availableAt!),title:event.label,note:'',cellId:layer.cellId,eventRef:{layerId:layer.layerId,eventId:event.id,timestamp:event.timestamp}},true)}))
    })
  }
  async guardDraft(signal?:AbortSignal):Promise<void>{
    signal?.throwIfAborted()
    if(!this.hasDraft())return
    if(this.draftDialog)throw Error('请先处理备注草稿')
    return new Promise((resolve,reject)=>{
      const element=document.createElement('div');element.setAttribute('role','alertdialog');element.setAttribute('aria-label','处理备注草稿');element.append(document.createTextNode('有尚未应用的草稿。'))
      const abort=()=>finish(true)
      const finish=(cancel=false)=>{signal?.removeEventListener('abort',abort);element.remove();this.draftDialog=undefined;cancel?reject(new DOMException('保留当前草稿','AbortError')):resolve()}
      element.append(this.button('保留并应用草稿',()=>{if(this.notesDraft){this.workspace.updateReplayNotes(this.notes.value);this.notesDraft=false}if(this.bookmarkDraft)this.applyBookmark();finish()}),this.button('放弃草稿',()=>{this.notesDraft=false;this.bookmarkDraft=false;this.notes.value=this.workspace.getReplayRecord()?.notes??'';this.closeEditor();finish()}),this.button('取消',()=>finish(true)))
      this.panel.append(element);this.draftDialog={element,cancel:()=>finish(true)};signal?.addEventListener('abort',abort,{once:true});element.querySelector('button')?.focus()
    })
  }
  render(state:WorkspaceReplayState){
    if(!this.drawer.open)return
    const record=this.workspace.getReplayRecord(),busy=['loading','seeking','resuming','error'].includes(state.phase)
    this.tabs.forEach((button,i)=>button.setAttribute('aria-selected',String((i===0)===(this.tab==='events'))))
    this.editing.hidden=this.tab!=='notes';this.layers.hidden=this.tab!=='events';this.notes.disabled=!record
    for(const button of this.editing.querySelectorAll<HTMLButtonElement>('button'))button.disabled=!record||busy
    if(!this.notesDraft)this.notes.value=record?.notes??''
    const currentCell=this.cells.value,cellValues=this.workspace.getCells();if([...this.cells.options].map(o=>o.value).join()!==['',...cellValues.map(c=>c.cellId)].join()){this.cells.replaceChildren(new Option('全部窗格',''),...cellValues.map(c=>new Option(`${c.cellId} · ${c.symbol.ticker}`,c.cellId)));this.cells.value=currentCell}
    this.rendered=state.mode==='replay'?this.events():[]
    if(this.selectedEvent&&!this.rendered.some(layer=>layer.cellId===this.selectedEvent!.cellId&&layer.layerId===this.selectedEvent!.layerId&&layer.events.some(event=>event.id===this.selectedEvent!.eventId))){this.selectedEvent=undefined;this.detail.textContent='所选事件在当前时刻不可见；已有书签仍保留。'}
    const layerValue=this.layers.value;this.layers.replaceChildren(new Option('全部事件层',''),...this.rendered.map(l=>new Option(`${l.cellId} · ${l.label}`,`${l.cellId}:${l.layerId}`)));this.layers.value=[...this.layers.options].some(o=>o.value===layerValue)?layerValue:''
    const rows=this.tab==='events'?this.eventRows().map(({layer,event})=>({id:`${layer.cellId}:${layer.layerId}:${event.id}`,label:`${event.label} · ${new Date(event.timestamp).toISOString()}`})):this.bookmarks().map(b=>({id:b.id,label:`${b.title||'未命名书签'} · ${new Date(b.timestamp).toISOString()}${b.eventRef&&!this.rendered.some(l=>l.cellId===b.cellId&&l.layerId===b.eventRef!.layerId&&l.events.some(e=>e.id===b.eventRef!.eventId))?' · 事件引用当前不可用':''}`}))
    const version=JSON.stringify([this.tab,rows]);if(version!==this.version){this.version=version;const fragment=document.createDocumentFragment();rows.forEach((row,index)=>{const item=document.createElement('li'),button=document.createElement('button');button.type='button';button.dataset.row=String(index);button.textContent=row.label;item.append(button);fragment.append(item)});this.list.replaceChildren(fragment)}
    if(!rows.length)this.detail.textContent=this.rendered.some(l=>l.error)?this.rendered.filter(l=>l.error).map(l=>`${l.label}：${l.error}`).join('；'):this.tab==='events'?(state.mode==='replay'?'当前可见范围没有匹配事件；缺少可用时刻的事件不展示':'开始或继续复盘后显示已可见事件'):'尚无匹配书签'
    if(!this.hasDraft())this.notice.textContent=this.dirty()?'记录有未保存变更':'记录随工作台显式保存'
  }
  dispose(){this.draftDialog?.cancel();this.element.remove()}
}
