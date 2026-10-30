import {describe,it,expect} from 'vitest'
import {isWorkspaceDocument,migrateWorkspaceDocument} from '../document'
import {copyStoredWorkspace,prepareWorkspaceWrite} from '../store'
import {replayTimeCandidates} from '../replayTimeInput'
import type {WorkspaceDocument} from '../types'
const identity={source:'source',ticker:'A',market:'test',exchange:'X',currency:'USD',multiplier:1,timespan:'minute',adjustment:'raw',sessionFilter:'all',timezone:'UTC'}
const document=():WorkspaceDocument=>({version:3,layout:1,activeCellId:'primary',sync:{symbol:false,period:false,crosshair:false,viewport:false},columnRatio:50,rowRatio:50,sharedDrawings:[],cells:[{cellId:'primary',context:'scope',symbol:{ticker:'A'},period:{multiplier:1,timespan:'minute',text:'1m'},chart:{version:4,timestamp:1,theme:'dark',locale:'zh-CN',timezone:'UTC',styles:{},indicators:[],panes:[],axes:[],drawings:[],drawingPresentation:{},context:{ticker:'A',period:{multiplier:1,timespan:'minute'}}}}],replaySession:{version:1,mode:'paused',historyKind:'current-history',from:100,to:1000,cursor:500,driverCellId:'primary',speed:4,participants:[{cellId:'primary',identity:{...identity},comparisons:[]}],notes:'当前认识',bookmarks:[{id:'bookmark-1',timestamp:500,title:'同一时刻',note:'备注',cellId:'primary',eventRef:{layerId:'events',eventId:'event-1',timestamp:450}}]}})
describe('workspace replay persistence boundary',()=>{
  it('round trips only detached typed record values through the actual store boundary',()=>{
    const input=document(),write=prepareWorkspaceWrite('scope',{kind:'create',id:'id',name:'记录',document:input}),read=copyStoredWorkspace('scope',{scope:'scope',id:'id',name:'记录',revision:'opaque',updatedAt:1,document:write.document})
    expect(read.document).toEqual(input);input.replaySession!.bookmarks[0].note='later';expect(read.document.replaySession!.bookmarks[0].note).toBe('备注')
    read.document.replaySession!.participants[0].identity.source='new';expect(write.document.replaySession!.participants[0].identity.source).toBe('source')
  })
  it('migrates v1/v2 in memory without creating a replay session or modifying the original',()=>{
    for(const version of [1,2]){
      const {replaySession,...base}=document(),old:any={...base,version};if(version===1){delete old.sharedDrawings;const {drawings,drawingPresentation,...chart}=old.cells[0].chart;old.cells[0].chart={...chart,version:3,overlayData:[]}}
      const before=structuredClone(old),migrated=migrateWorkspaceDocument(old);expect(migrated.version).toBe(3);expect(migrated.replaySession).toBeUndefined();expect(old).toEqual(before)
    }
  })
  it.each(['identity','cell','duplicate-participant','driver','range','cursor','clock','payload','duplicate-bookmark','reference','title','note','session-notes','version','period'])('rejects invalid %s rather than dropping fields or retargeting records',kind=>{
    const d=document(),r:any=d.replaySession
    if(kind==='identity')r.participants[0].identity.source=''
    if(kind==='cell')r.participants[0].identity.ticker='B'
    if(kind==='duplicate-participant')r.participants.push(structuredClone(r.participants[0]))
    if(kind==='driver')r.driverCellId='missing'
    if(kind==='range')r.to=r.from
    if(kind==='cursor')r.cursor=r.to
    if(kind==='clock')r.clocks=[]
    if(kind==='payload')r.bookmarks[0].eventRef.payload={future:'data'}
    if(kind==='duplicate-bookmark')r.bookmarks.push(structuredClone(r.bookmarks[0]))
    if(kind==='reference')r.bookmarks[0].cellId='missing'
    if(kind==='title')r.bookmarks[0].title='a'.repeat(121)
    if(kind==='note')r.bookmarks[0].note='a'.repeat(4001)
    if(kind==='session-notes')r.notes='a'.repeat(20001)
    if(kind==='version')r.version=2
    if(kind==='period')r.participants[0].comparisons=[{symbol:{ticker:'B'},period:{multiplier:1,timespan:'hour',text:'1h'},identity:{...identity,ticker:'B',timespan:'hour'}}]
    expect(isWorkspaceDocument(d)).toBe(false);expect(()=>migrateWorkspaceDocument(d)).toThrow()
  })
  it('preserves 1000 independent same-time bookmarks and inclusive text limits',()=>{
    const d=document(),r=d.replaySession!;r.notes='a'.repeat(20000);r.bookmarks=Array.from({length:1000},(_,i)=>({id:String(i),timestamp:500,title:'a'.repeat(120),note:'a'.repeat(4000)}));expect(isWorkspaceDocument(d)).toBe(true);r.bookmarks.push({id:'extra',timestamp:500,title:'',note:''});expect(isWorkspaceDocument(d)).toBe(false)
  })
})
describe('explicit UTC conversion',()=>{
  it('requires a selected offset for repeated times and rejects gaps or invalid dates',()=>{
    expect(replayTimeCandidates('2026-11-01T01:30','America/New_York')).toEqual(['2026-11-01T05:30:00Z','2026-11-01T06:30:00Z'].map(Date.parse))
    expect(replayTimeCandidates('2026-03-08T02:30','America/New_York')).toEqual([])
    expect(replayTimeCandidates('2026-02-30T12:00','UTC')).toEqual([])
    expect(replayTimeCandidates('2026-10-30T12:00:00.123','Asia/Shanghai')).toEqual([Date.parse('2026-10-30T04:00:00.123Z')])
  })
})
