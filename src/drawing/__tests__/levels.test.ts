import {expect,it} from 'vitest'
import {resolveDrawingLevels,validateDrawingLevelSet,validateDrawingLevelPresetSet,extractDrawingLevelPreset,instantiateDrawingLevelPreset,applyDrawingLevelPreset,type DrawingLevelSet} from '../levels'

it('reads negative, extended and repeated legacy ratios with stable IDs and detached values',()=>{
 const original=[-1,.5,.5,2],before=[...original],a=resolveDrawingLevels(original),b=resolveDrawingLevels(original)
 expect(a).toEqual(b);expect(new Set(a.items.map(item=>item.id)).size).toBe(4);expect(a.items.map(item=>item.value)).toEqual(original);expect(a.items.every(item=>item.visible&&item.text===undefined&&item.color===undefined)).toBe(true)
 a.items[0].value=100;expect(original).toEqual(before);expect(resolveDrawingLevels(undefined,original)).toEqual(b)
 const copy=resolveDrawingLevels(b);copy.items[0].text='独立正文';expect(b.items[0].text).toBeUndefined()
})
it('validates a closed runtime shape and a separate appearance-only preset shape',()=>{
 const good:DrawingLevelSet={version:1,items:[{id:' opaque ',value:-.5,visible:false,color:'#A1B2C380',width:2.5,style:'dotted',text:'正文 <b>按原样显示</b>'}]}
 expect(()=>validateDrawingLevelSet(good)).not.toThrow();expect(()=>validateDrawingLevelPresetSet(extractDrawingLevelPreset(good))).not.toThrow()
 const invalid=[{...good,version:2},{...good,extra:true},{...good,items:[]},{...good,items:Array.from({length:65},(_,i)=>({...good.items[0],id:String(i)}))},{...good,items:[good.items[0],good.items[0]]}]
 for(const patch of [{id:''},{value:Infinity},{value:'1'},{visible:1},{color:'red'},{width:0},{width:4.1},{style:'unknown'},{text:'两行\n正文'},{text:'x'.repeat(501)},{extra:true},{text:undefined}])invalid.push({...good,items:[{...good.items[0],...patch}]} as any)
 for(const value of invalid)expect(()=>validateDrawingLevelSet(value)).toThrow()
 expect(()=>validateDrawingLevelPresetSet(good)).toThrow();expect(()=>validateDrawingLevelPresetSet({version:1,items:[{value:1,visible:true,text:'正文'}]})).toThrow()
 for(const value of [[],[NaN],Array(65).fill(1)])expect(()=>resolveDrawingLevels(value)).toThrow()
 const sixtyFour=resolveDrawingLevels(Array(64).fill(1));expect(()=>validateDrawingLevelSet(sixtyFour)).not.toThrow()
})
it('strips all level content from presets and gives each new object fresh IDs with no body',()=>{
 const runtime=resolveDrawingLevels([.5,1]);runtime.items[0].text='不能进入模板';runtime.items[0].color='#123456'
 const preset=extractDrawingLevelPreset(runtime),a=instantiateDrawingLevelPreset(preset),b=instantiateDrawingLevelPreset(preset)
 expect(preset.items).toEqual([{value:.5,visible:true,color:'#123456'},{value:1,visible:true}]);expect(a.items.map(item=>item.id)).not.toEqual(b.items.map(item=>item.id));expect(a.items.every(item=>item.text===undefined)).toBe(true)
 a.items[0].color='#ffffff';expect(preset.items[0].color).toBe('#123456');expect(runtime.items[0].text).toBe('不能进入模板')
})
it('applies equal ratios by occurrence, preserves matched IDs and bodies, and refuses implicit body loss',()=>{
 const source=resolveDrawingLevels([.5,.5,1]);source.items[0].text='第一个';source.items[1].text='第二个'
 const before=structuredClone(source),preset=extractDrawingLevelPreset(resolveDrawingLevels([.5,2,.5])),result=applyDrawingLevelPreset(source,preset)
 expect(result.items.map(item=>item.text)).toEqual(['第一个',undefined,'第二个']);expect(result.items[0].id).toBe(source.items[0].id);expect(result.items[2].id).toBe(source.items[1].id);expect(source).toEqual(before)
 expect(()=>applyDrawingLevelPreset(source,[.5,1])).toThrow('带正文');expect(source).toEqual(before)
 expect(applyDrawingLevelPreset(source,[.5,.5]).items).toHaveLength(2)
})
