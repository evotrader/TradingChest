import ts from 'typescript'
import {readFileSync,writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'

// Public classes with private members need one declaration identity across entries.
// Reuse the canonical chart entry instead of duplicating nominal classes in bundles.
const names=new Set(['ChartWorkspace','DrawingSession','DrawingSessionRegistry'])
for(const [entry,target] of [['index.d.ts','./entries/chart.js'],['entries/react.d.ts','./chart.js'],['entries/solid.d.ts','./chart.js']]){
  const file=fileURLToPath(new URL(`../dist/${entry}`,import.meta.url)),source=readFileSync(file,'utf8')
  const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS)
  const classes=ast.statements.filter(node=>ts.isClassDeclaration(node)&&names.has(node.name?.text))
  const imported=classes.map(node=>node.name.text),exported=classes.filter(node=>node.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)).map(node=>node.name.text)
  if(new Set(imported).size!==imported.length)throw Error(`Duplicate public class declarations in ${entry}`)
  if(!classes.length)continue
  let linked=source
  for(const declaration of [...classes].reverse())linked=linked.slice(0,declaration.getFullStart())+linked.slice(declaration.end)
  const imports=`import {${imported.join(',')}} from '${target}';\n`,exports=exported.length?`export {${exported.join(',')}} from '${target}';\n`:''
  writeFileSync(file,imports+exports+linked)
}
// Local build caches are not part of the public package.
writeFileSync(new URL('../dist/.npmignore',import.meta.url),'.*\n')
