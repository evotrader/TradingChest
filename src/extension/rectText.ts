import {type FigureTemplate,type TextAttrs,type TextStyle,getFigureClass,utils} from 'klinecharts'

/** Multi-line bounds use the same measured font, padding and alignment as native text. */
export function multilineTextLayout(attrs:TextAttrs,styles:Partial<Pick<TextStyle,'size'|'weight'|'family'|'paddingLeft'|'paddingRight'|'paddingTop'|'paddingBottom'>>){
  const lines=String(attrs.text).split(/\r?\n/),size=styles.size??12,lineHeight=size*1.35,left=styles.paddingLeft??0,right=styles.paddingRight??0,top=styles.paddingTop??0,bottom=styles.paddingBottom??0
  const width=attrs.width??Math.max(...lines.map(line=>utils.calcTextWidth(line,size,styles.weight,styles.family)))+left+right,height=attrs.height??lines.length*lineHeight+top+bottom
  const align=attrs.align??'left',baseline=attrs.baseline??'top'
  const x=attrs.x-(['right','end'].includes(align)?width:align==='center'?width/2:0),y=attrs.y-(['bottom','ideographic','alphabetic'].includes(baseline)?height:baseline==='middle'?height/2:0)
  return {lines,width,height,x,y,lineHeight,left,right,top,bottom,box:{...attrs,text:'',width,height}}
}
const rectText:FigureTemplate<TextAttrs|TextAttrs[],Partial<TextStyle>>={
  name:'rectText',
  checkEventOn:(coordinate,attrs,styles)=>[attrs].flat().some(attr=>utils.checkCoordinateOnText(coordinate,String(attr.text).includes('\n')?multilineTextLayout(attr,styles).box:attr,styles)),
  draw:(ctx,attrs,styles)=>{
    const Text=getFigureClass<TextAttrs|TextAttrs[],Partial<TextStyle>>('text')!
    for(const attr of [attrs].flat()){
      if(!String(attr.text).includes('\n')){new Text({name:'text',attrs:attr,styles}).draw(ctx);continue}
      const block=multilineTextLayout(attr,styles)
      new Text({name:'text',attrs:block.box,styles}).draw(ctx)
      const align=attr.align??'left',available=block.width-block.left-block.right
      for(const [index,line] of block.lines.entries()){
        const lineWidth=utils.calcTextWidth(line,styles.size??12,styles.weight,styles.family)
        const offset=['right','end'].includes(align)?available-lineWidth:align==='center'?(available-lineWidth)/2:0
        new Text({name:'text',attrs:{x:block.x+block.left+offset,y:block.y+block.top+index*block.lineHeight,text:line,align:'left',baseline:'top',width:lineWidth,height:block.lineHeight},styles:{...styles,paddingLeft:0,paddingRight:0,paddingTop:0,paddingBottom:0,backgroundColor:'transparent',borderSize:0}}).draw(ctx)
      }
    }
  }
}
export default rectText
