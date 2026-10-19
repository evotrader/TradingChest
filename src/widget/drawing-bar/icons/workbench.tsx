const icon=(path:string)=>(className?:string)=><svg class={className} viewBox="0 0 28 28" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5"><path d={path}/></svg>
export const highlighter=icon('M5 20L17 5L24 11L12 24L5 24ZM4 25H19M14 9L20 15')
export const polyline=icon('M3 22L9 6L17 18L25 4M2 21H5V24H2ZM8 5H11V8H8ZM16 17H19V20H16ZM24 3H27V6H24Z')
export const ellipse=()=><svg viewBox="0 0 28 28" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5"><ellipse cx="14" cy="14" rx="11" ry="7"/></svg>
export const rotatedRect=icon('M3 13L20 3L25 15L8 25Z')
export const trendAngle=icon('M3 23H26M3 23L23 4M13 23Q13 17 10 16')
export const crossLine=icon('M14 2V26M2 14H26')
export const priceLabel=icon('M3 14L9 7H26V21H9ZM12 11H22M12 16H20')
export const anchoredText=icon('M8 8H23M15 8V22M3 3H10M3 3V10M3 3L9 9')
