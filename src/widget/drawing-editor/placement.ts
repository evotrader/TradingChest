/** Keep a translated layer's local coordinates stable while retaining every point. */
export function translatedPlacement<T extends {x:number;y:number}>(key:(value:T)=>string){
 let origin:{id:string;x:number;y:number}|undefined
 return (values:readonly T[])=>{
  let reference=origin&&values.find(value=>key(value)===origin!.id)
  if(!reference){reference=values[0];origin=reference?{id:key(reference),x:reference.x,y:reference.y}:undefined}
  const dx=reference&&origin?reference.x-origin.x:0,dy=reference&&origin?reference.y-origin.y:0
  return {dx,dy,objects:new Map(values.map(value=>[key(value),{value,x:value.x-dx,y:value.y-dy}]))}
 }
}
