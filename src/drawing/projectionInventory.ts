import type {Chart,Overlay} from 'klinecharts'

/** An index of engine identities, invalidated by public membership changes and native removals. */
export class DrawingProjectionInventory {
  private objects=new Map<string,Overlay>()
  private originalCreate:Chart['createOverlay']
  private originalRemove:Chart['removeOverlay']
  private create:Chart['createOverlay']
  private remove:Chart['removeOverlay']
  constructor(private chart:Chart){
    this.originalCreate=chart.createOverlay;this.originalRemove=chart.removeOverlay
    const inventory=this
    this.create=function(this:Chart,...args:Parameters<Chart['createOverlay']>){try{return inventory.originalCreate.apply(this,args)}finally{inventory.invalidate()}}
    this.remove=function(this:Chart,...args:Parameters<Chart['removeOverlay']>){try{return inventory.originalRemove.apply(this,args)}finally{inventory.invalidate()}}
    chart.createOverlay=this.create;chart.removeOverlay=this.remove
  }
  invalidate():void{this.objects.clear()}
  get(id:string):Overlay|undefined{
    // A host may decorate methods itself; its policy remains authoritative.
    if(this.chart.createOverlay!==this.create||this.chart.removeOverlay!==this.remove)return this.chart.getOverlays({id})[0]
    // Lazily cache only the requested identity. Rebuilding all n entries after each
    // creation copies n(n+1)/2 tuples during a large document restore.
    if(!this.objects.has(id)){const value=this.chart.getOverlays({id})[0];if(value)this.objects.set(id,value)}
    return this.objects.get(id)
  }
  dispose():void{
    if(this.chart.createOverlay===this.create)this.chart.createOverlay=this.originalCreate
    if(this.chart.removeOverlay===this.remove)this.chart.removeOverlay=this.originalRemove
    this.objects.clear()
  }
}
