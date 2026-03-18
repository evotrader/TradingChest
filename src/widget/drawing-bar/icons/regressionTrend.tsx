export default (cls?: string) => (
  <svg class={`icon-overlay ${cls ?? ''}`} viewBox="0 0 22 22">
    <line x1="4" y1="16" x2="18" y2="6" stroke="currentColor" stroke-width="1.5"/>
    <circle cx="7" cy="13" r="1.5" fill="currentColor"/>
    <circle cx="10" cy="12" r="1.5" fill="currentColor"/>
    <circle cx="13" cy="9" r="1.5" fill="currentColor"/>
    <circle cx="16" cy="8" r="1.5" fill="currentColor"/>
  </svg>
)
