export default (cls?: string) => (
  <svg class={`icon-overlay ${cls ?? ''}`} viewBox="0 0 22 22">
    <rect x="5" y="5" width="12" height="5" fill="none" stroke="currentColor" stroke-width="1" opacity="0.6"/>
    <rect x="5" y="12" width="12" height="5" fill="none" stroke="currentColor" stroke-width="1" opacity="0.6"/>
    <line x1="5" y1="11" x2="17" y2="11" stroke="currentColor" stroke-width="1.5"/>
    <path d="M11,4 L8,7 M11,4 L14,7" fill="none" stroke="currentColor" stroke-width="1.5"/>
  </svg>
)
