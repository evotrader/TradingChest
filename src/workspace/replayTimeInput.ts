const formatter=(zone:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'})
export function replayLocalTime(timestamp:number,zone:string):string{
  const parts=Object.fromEntries(formatter(zone).formatToParts(timestamp).map(p=>[p.type,p.value]))
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.${String(((timestamp%1000)+1000)%1000).padStart(3,'0')}`
}
/** Enumerate source-independent UTC offsets around the date; reject DST gaps and require an explicit fold choice. */
export function replayTimeCandidates(local:string,zone:string):number[]{
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(local))return []
  const naive=Date.parse(local+'Z');if(!Number.isFinite(naive))return []
  const normalized=new Date(naive).toISOString().slice(0,-1),offsets=new Set<number>()
  const [whole,fraction='']=local.split('.'),canonical=(whole.length===16?whole+':00':whole)+'.'+fraction.padEnd(3,'0')
  if(canonical!==normalized)return []
  for(const hours of [-48,-24,0,24,48]){const probe=naive+hours*3600000;offsets.add(Date.parse(replayLocalTime(probe,zone)+'Z')-probe)}
  return [...offsets].map(offset=>naive-offset).filter(value=>replayLocalTime(value,zone)===normalized).sort((a,b)=>a-b)
}
export class ReplayTimeInput {
  readonly element=document.createElement('label')
  readonly input=document.createElement('input')
  private fold=document.createElement('select')
  private values:number[]=[]
  constructor(label:string,private zone:()=>string,changed:()=>void){
    this.element.append(document.createTextNode(label));this.input.type='datetime-local';this.input.step='0.001';this.input.setAttribute('aria-label',label)
    this.fold.setAttribute('aria-label',`${label} UTC 偏移`);this.fold.hidden=true
    this.input.oninput=()=>{this.reconcile();changed()};this.fold.onchange=changed;this.element.append(this.input,this.fold)
  }
  private reconcile(){
    this.values=replayTimeCandidates(this.input.value,this.zone());this.fold.replaceChildren(new Option('选择重复时刻的 UTC 偏移',''))
    for(const value of this.values){const offset=(Date.parse(this.input.value+'Z')-value)/60000,sign=offset<0?'-':'+';this.fold.add(new Option(`UTC${sign}${String(Math.floor(Math.abs(offset)/60)).padStart(2,'0')}:${String(Math.abs(offset)%60).padStart(2,'0')} · ${new Date(value).toISOString()}`,String(value)))}
    this.fold.hidden=this.values.length<=1
  }
  read():number{
    if(!this.input.value)throw Error('请选择日期和时间')
    if(!this.values.length)throw Error('时间无效或处于夏令时跳过的区间，请调整')
    if(this.values.length>1&&!this.fold.value)throw Error('这个本地时刻出现两次，请选择明确的 UTC 偏移')
    return this.values.length===1?this.values[0]:Number(this.fold.value)
  }
  set(timestamp:number){this.input.value=replayLocalTime(timestamp,this.zone());this.reconcile();if(this.values.length>1)this.fold.value=String(timestamp)}
  disabled(value:boolean){this.input.disabled=value;this.fold.disabled=value}
}
