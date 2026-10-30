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

.tc-workspace-main{display:flex;gap:8px;min-height:0;min-width:0;flex:1}
.tc-replay-controls{flex:none;border:1px solid var(--tc-workspace-border);padding:6px;min-width:0}
.tc-replay-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:5px}
.tc-replay-row label{display:inline-flex;flex-wrap:wrap;gap:4px;align-items:center;max-width:100%}
.tc-replay-controls :is(input,select,button),.tc-replay-notes :is(input,select,button,textarea){font:inherit;color:inherit;background:var(--tc-workspace-control);border:1px solid var(--tc-workspace-border);border-radius:3px;padding:4px;max-width:100%;box-sizing:border-box}
.tc-replay-controls input[type=range]{width:100%}.tc-replay-controls output{display:block;overflow-wrap:anywhere}
.tc-replay-controls button:disabled,.tc-replay-notes button:disabled{opacity:.55}
.tc-replay-notes{flex:0 0 260px;max-width:35%;min-width:0;overflow:auto;border:1px solid var(--tc-workspace-border);padding:6px}
.tc-replay-notes:not([data-open="true"]){flex:0 0 auto}
.tc-replay-notes summary{cursor:pointer;padding:5px}.tc-replay-notes ul{list-style:none;padding:0;max-height:260px;overflow:auto}
.tc-replay-notes li button{display:block;width:100%;text-align:left;margin:3px 0;overflow-wrap:anywhere}
.tc-replay-notes textarea,.tc-replay-notes form input{display:block;width:100%;margin:5px 0}
.tc-replay-notes [hidden]{display:none}.tc-replay-notes [role=tab][aria-selected=true]{border-color:var(--tc-workspace-active)}
.tc-replay-notes [role=status]{overflow-wrap:anywhere;margin-top:5px}
@media(max-width:720px){.tc-workspace-main{flex-direction:column}.tc-replay-notes{flex:0 0 auto;max-width:100%;max-height:280px}.tc-workspace-grid{min-height:260px}.tc-replay-row label{flex:1 1 100%}}
.tc-workspace-grid{position:relative}.tc-workspace-replay-busy{position:absolute;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.9);color:#e2e8f0;padding:20px;text-align:center}
`
