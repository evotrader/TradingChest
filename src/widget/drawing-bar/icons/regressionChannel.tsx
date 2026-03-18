export default (cls?: string) => (
  <svg class={`icon-overlay ${cls ?? ''}`} viewBox="0 0 22 22">
    <line x1="4" y1="14" x2="18" y2="8" stroke="currentColor" stroke-width="1.5"/>
    <line x1="4" y1="10" x2="18" y2="4" stroke="currentColor" stroke-width="1" stroke-dasharray="2,2"/>
    <line x1="4" y1="18" x2="18" y2="12" stroke="currentColor" stroke-width="1" stroke-dasharray="2,2"/>
  </svg>
)
