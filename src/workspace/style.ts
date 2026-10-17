/** Scoped workspace chrome; chart themes remain owned by individual chart layouts. */
export const workspaceStyle = `
.tc-workspace {
  --tc-workspace-background:#0b0f18;
  --tc-workspace-color:#d1d5db;
  --tc-workspace-border:#374151;
  --tc-workspace-active:#60a5fa;
  --tc-workspace-control:#172033;
  display:flex;flex-direction:column;gap:8px;min-width:0;min-height:0;
  box-sizing:border-box;color:var(--tc-workspace-color);font-size:12px;
}
.tc-workspace[data-theme="light"] {
  --tc-workspace-background:#ffffff;
  --tc-workspace-color:#1f2937;
  --tc-workspace-border:#d1d5db;
  --tc-workspace-active:#2563eb;
  --tc-workspace-control:#f3f4f6;
}
.tc-workspace-toolbar {display:flex;gap:8px 12px;align-items:center;flex-wrap:wrap;flex:none;min-width:0}
.tc-workspace-group {display:flex;gap:8px;align-items:center;flex-wrap:wrap;min-width:0;max-width:100%}
.tc-workspace-group[hidden] {display:none}
.tc-workspace :is(.tc-workspace-toolbar,.tc-workspace-header) label {display:inline-flex;gap:4px;align-items:center;min-width:0;max-width:100%}
.tc-workspace :is(.tc-workspace-toolbar,.tc-workspace-header) :is(select,button,input) {font:inherit;color:inherit;max-width:100%;box-sizing:border-box}
.tc-workspace :is(.tc-workspace-toolbar,.tc-workspace-header) :is(select,button) {background:var(--tc-workspace-control);border:1px solid var(--tc-workspace-border);border-radius:3px;padding:3px 5px}
.tc-workspace :is(.tc-workspace-toolbar,.tc-workspace-header) button:disabled {opacity:.55}
.tc-workspace-notice {flex:none;overflow-wrap:anywhere}
.tc-workspace-notice:empty {display:none}
.tc-workspace [role="alertdialog"] {padding:8px;border:1px solid var(--tc-workspace-border);display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.tc-workspace-grid {display:grid;gap:8px;min-width:0;min-height:0;flex:1;overflow:auto}
.tc-workspace-cell {min-width:0;min-height:0;display:flex;flex-direction:column;border:1px solid var(--tc-workspace-border);overflow:auto;background:var(--tc-workspace-background)}
.tc-workspace-cell[data-active="true"] {border-color:var(--tc-workspace-active)}
.tc-workspace-header {display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:6px;flex:none;min-width:0}
.tc-workspace-header select {min-width:0;max-width:100%}
.tc-workspace-cell-status {overflow-wrap:anywhere;min-width:0}
.tc-workspace-body {min-width:0;min-height:180px;flex:1}
`
