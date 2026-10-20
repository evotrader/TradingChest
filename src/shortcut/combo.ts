/** Preferences and DOM events use the same modifier order. */
export function shortcutCombo(modifiers:{ctrl:boolean;alt:boolean;shift:boolean},key:string):string {
  return [...(['ctrl','alt','shift'] as const).filter(modifier=>modifiers[modifier]),key].join('+')
}
