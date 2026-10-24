import type {Chart,Overlay} from 'klinecharts'

/** An index of engine identities, invalidated by public membership changes and native removals. */
export class DrawingProjectionInventory {
  private objects=new Map<string,Overlay>()
  private originalCreate:Chart['createOverlay']
  private originalRemove:Chart['removeOverlay']
  private originalGet:Chart['getOverlays']
  private stableReads=0
  private create:Chart['createOverlay']
  private remove:Chart['removeOverlay']
  constructor(private chart:Chart){
    this.originalCreate=chart.createOverlay;this.originalRemove=chart.removeOverlay;this.originalGet=chart.getOverlays
    const inventory=this
    this.create=function(this:Chart,...args:Parameters<Chart['createOverlay']>){try{return inventory.originalCreate.apply(this,args)}finally{inventory.invalidate()}}
    this.remove=function(this:Chart,...args:Parameters<Chart['removeOverlay']>){try{return inventory.originalRemove.apply(this,args)}finally{inventory.invalidate()}}
    chart.createOverlay=this.create;chart.removeOverlay=this.remove
  }
  invalidate():void{this.objects.clear();this.stableReads=0}
  get(id:string):Overlay|undefined{
    // A host may decorate methods itself; its policy remains authoritative.
    if(this.chart.createOverlay!==this.create||this.chart.removeOverlay!==this.remove||this.chart.getOverlays!==this.originalGet)return this.chart.getOverlays({id})[0]
    // Lazily cache only the requested identity. Rebuilding all n entries after each
    // creation copies n(n+1)/2 tuples during a large document restore.
    if(!this.objects.has(id)){
      const value=this.chart.getOverlays({id})[0]
      if(value){
        this.objects.set(id,value)
        // Creation probes a missing ID and one newly created object between
        // invalidations. A second existing identity proves a stable read batch:
        // index it once rather than filtering all n overlays for every target.
        if(++this.stableReads===2)for(const object of this.chart.getOverlays())this.objects.set(object.id,object)
      }
    }
    return this.objects.get(id)
  }
  dispose():void{
    if(this.chart.createOverlay===this.create)this.chart.createOverlay=this.originalCreate
    if(this.chart.removeOverlay===this.remove)this.chart.removeOverlay=this.originalRemove
    this.objects.clear()
  }
}
