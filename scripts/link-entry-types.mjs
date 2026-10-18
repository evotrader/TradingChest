import ts from 'typescript'
import {readFileSync,writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'

// A class with private members must have one declaration identity across entries.
// The generator otherwise inlines a second nominal ChartWorkspace into react.d.ts.
const file=fileURLToPath(new URL('../dist/entries/react.d.ts',import.meta.url)),source=readFileSync(file,'utf8')
const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS)
const classes=ast.statements.filter(node=>ts.isClassDeclaration(node)&&node.name?.text==='ChartWorkspace')
if(classes.length!==1)throw Error('Expected exactly one generated ChartWorkspace declaration to link')
const declaration=classes[0]
if(declaration.modifiers?.some(modifier=>modifier.kind===ts.SyntaxKind.ExportKeyword))throw Error('React must reference the public chart class, not declare another export')
writeFileSync(file,`import type {ChartWorkspace} from './chart.js';\n`+source.slice(0,declaration.getFullStart())+source.slice(declaration.end))
// Local build caches are not part of the public package.
writeFileSync(new URL('../dist/.npmignore',import.meta.url),'.*\n')
