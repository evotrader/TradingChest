import {isWorkspaceDocument} from './document'
import type {WorkspaceDocument} from './types'

export interface WorkspaceSummary {id:string;name:string;updatedAt:number;revision:string}
export interface StoredWorkspace extends WorkspaceSummary {document:WorkspaceDocument}
export type WorkspaceWrite =
  | {kind:'create';id:string;name:string;document:WorkspaceDocument}
  | {kind:'update';id:string;expectedRevision:string;name:string;document:WorkspaceDocument}
export interface WorkspaceStore {
  list(scope:string,signal:AbortSignal):Promise<WorkspaceSummary[]>
  read(scope:string,id:string,signal:AbortSignal):Promise<StoredWorkspace|null>
  write(scope:string,input:WorkspaceWrite,signal:AbortSignal):Promise<StoredWorkspace>
  remove(scope:string,id:string,expectedRevision:string,signal:AbortSignal):Promise<void>
}
export type WorkspaceStoreErrorCode = 'WORKSPACE_NOT_FOUND'|'WORKSPACE_STORE_UNAVAILABLE'|'WORKSPACE_INVALID_DOCUMENT'|'WORKSPACE_CONFLICT'
export class WorkspaceStoreError extends Error {
  constructor(readonly code:WorkspaceStoreErrorCode,message:string,options?:ErrorOptions){
    super(message,options)
    this.name='WorkspaceStoreError'
  }
}

const invalid=(message:string,cause?:unknown)=>new WorkspaceStoreError('WORKSPACE_INVALID_DOCUMENT',message,cause===undefined?undefined:{cause})

/** Scopes are opaque host values; in particular, they are never trimmed or split. */
export function assertWorkspaceScope(scope:unknown):asserts scope is string {
  if(typeof scope!=='string')throw invalid('Workspace scope must be a string')
}
export function assertWorkspaceId(id:unknown):asserts id is string {
  if(typeof id!=='string'||!id.length)throw invalid('Workspace ID must be a nonempty string')
}
export function assertWorkspaceRevision(revision:unknown):asserts revision is string {
  if(typeof revision!=='string'||!revision.length)throw invalid('Workspace revision must be a nonempty string')
}
export function normalizeWorkspaceName(name:unknown):string {
  if(typeof name!=='string')throw invalid('Workspace name must be a string')
  const normalized=name.trim()
  if(normalized.length<1||normalized.length>80)throw invalid('Workspace name must contain 1–80 characters after trimming')
  return normalized
}

/** Validate both sides of serialization, so a copy cannot silently change the document. */
export function copyWorkspaceDocument(scope:string,value:unknown):WorkspaceDocument {
  assertWorkspaceScope(scope)
  try {
    if(!isWorkspaceDocument(value))throw invalid('Workspace document is invalid or not JSON safe')
    const copy:unknown=JSON.parse(JSON.stringify(value))
    if(!isWorkspaceDocument(copy))throw invalid('Workspace document is invalid after serialization')
    for(const cell of copy.cells){
      const expected=cell.cellId==='primary'?scope:`${scope}:${cell.cellId}`
      if(cell.context!==expected)throw invalid('Workspace cell context does not match its scope')
    }
    return copy
  }catch(error){
    if(error instanceof WorkspaceStoreError)throw error
    throw invalid('Workspace document cannot be validated or copied',error)
  }
}

/** Capture all write inputs before the first asynchronous operation. */
export function prepareWorkspaceWrite(scope:string,input:WorkspaceWrite):WorkspaceWrite {
  assertWorkspaceScope(scope)
  if(!input||typeof input!=='object'||(input.kind!=='create'&&input.kind!=='update'))throw invalid('Workspace write kind is invalid')
  const {kind,id,name,document}=input
  assertWorkspaceId(id)
  const normalized=normalizeWorkspaceName(name),copy=copyWorkspaceDocument(scope,document)
  if(kind==='create')return {kind,id,name:normalized,document:copy}
  const {expectedRevision}=input
  assertWorkspaceRevision(expectedRevision)
  return {kind,id,expectedRevision,name:normalized,document:copy}
}

/** Stored scope is checked separately from the document's per-cell contexts. */
export function copyStoredWorkspace(scope:string,value:unknown,expectedId?:string):StoredWorkspace {
  assertWorkspaceScope(scope)
  try {
    if(!value||typeof value!=='object')throw invalid('Stored workspace record is invalid')
    const row=value as StoredWorkspace & {scope:string}
    assertWorkspaceId(row.id)
    assertWorkspaceRevision(row.revision)
    if(row.scope!==scope||(expectedId!==undefined&&row.id!==expectedId))throw invalid('Stored workspace identity does not match its key')
    if(row.name!==normalizeWorkspaceName(row.name)||!Number.isFinite(row.updatedAt)||row.updatedAt<0)throw invalid('Stored workspace metadata is invalid')
    return {id:row.id,name:row.name,updatedAt:row.updatedAt,revision:row.revision,document:copyWorkspaceDocument(scope,row.document)}
  }catch(error){
    if(error instanceof WorkspaceStoreError)throw error
    throw invalid('Stored workspace cannot be validated or copied',error)
  }
}
export function workspaceSummary(record:StoredWorkspace):WorkspaceSummary {
  return {id:record.id,name:record.name,updatedAt:record.updatedAt,revision:record.revision}
}
