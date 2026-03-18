export default (cls?: string) => (
  <svg class={`icon-overlay ${cls ?? ''}`} viewBox="0 0 22 22">
    <rect x="4" y="4" width="14" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <line x1="7" y1="8" x2="15" y2="8" stroke="currentColor" stroke-width="1"/>
    <line x1="7" y1="11" x2="15" y2="11" stroke="currentColor" stroke-width="1"/>
    <line x1="7" y1="14" x2="12" y2="14" stroke="currentColor" stroke-width="1"/>
  </svg>
)
