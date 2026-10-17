import {describe,it,expect} from 'vitest'
import {builtinIndicatorCatalog,copyIndicatorCatalog,validateIndicatorParams,type IndicatorDescriptor} from '../catalog'
import {IndicatorRegistry} from '../registry'
const descriptor:IndicatorDescriptor={name:'example:combo',label:'组合',category:'custom',placements:['sub'],parameters:{items:[{type:'number',label:'周期',min:1,step:1},{type:'select',label:'来源',options:[{label:'收盘',value:'close'},{label:'开盘',value:'open'}]},{type:'boolean',label:'平滑'},{type:'number',label:'倍率',min:0,optional:true}]}}
describe('catalog authority and parameter shapes',()=>{
 it('copies a valid catalog and rejects malformed schemas',()=>{
  const copy=copyIndicatorCatalog([descriptor]);copy[0].label='changed';expect(descriptor.label).toBe('组合')
  expect(()=>copyIndicatorCatalog([descriptor,descriptor])).toThrow('重复')
  expect(()=>copyIndicatorCatalog([{...descriptor,parameters:{items:[{type:'number',label:'a',optional:true},{type:'boolean',label:'b'}]}}])).toThrow('尾部')
  expect(()=>copyIndicatorCatalog([{...descriptor,parameters:{items:[{type:'number',label:'a',step:0}]}}])).toThrow('约束')
 })
 it('accepts fixed, optional and enum/boolean values without coercion',()=>{
  validateIndicatorParams(descriptor,[4,'close',false]);validateIndicatorParams(descriptor,[4,'open',true,0.4])
  for(const value of [[0,'close',false],[4,'bad',false],[4,'close',0],[4.1,'close',false],[4,'close',false,NaN],[4,'close'],[4,'close',false,0,1]])expect(()=>validateIndicatorParams(descriptor,value)).toThrow()
 })
 it('preserves real variable parameter lengths, including MA four and RSI three',()=>{
  for(const name of ['MA','EMA','VOL','RSI','BIAS','WR']){const d=builtinIndicatorCatalog.find(d=>d.name===name)!;for(const params of [[5],[5,10,30],[5,10,30,60],[5,10,30,60,90,120]])validateIndicatorParams(d,params);expect(()=>validateIndicatorParams(d,[])).toThrow()}
 })
 it('rejects conflicting definitions and wrong-name lazy results',async()=>{
  const registry=new IndicatorRegistry(),registered:string[]=[];registry.setRegisterFn(t=>registered.push(t.name));registry.setSupportedProvider(()=>registered)
  const template={name:'example:one',calc:()=>[]};registry.registerDefinition(template.name,template);registry.registerDefinition(template.name,template)
  expect(()=>registry.registerDefinition(template.name,{...template})).toThrow('已有定义')
  expect(()=>registry.registerDefinition('MA',{...template,name:'MA'})).toThrow('命名空间')
  registry.registerDefinition('example:late',async()=>template);await expect(registry.ensureRegistered('example:late')).rejects.toThrow('不同名称');expect(registered).toEqual(['example:one'])
 })
})
