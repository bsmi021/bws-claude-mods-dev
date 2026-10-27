// What this conversation has used so far: its todos, the connectors (MCP servers) it called and how often, the files it
// read, edited or wrote, and the skills it ran. Pure: no `$`, so tests call it directly. register.ts feeds it events and
// publishes `inventoryTab` for bws-cockpit to draw.
import { card, makeTab, text, type ModTab, type TabColor, type TabNode } from './kit/tab'

export type TodoStatus = 'pending' | 'in_progress' | 'completed'
export type Todo = { id: string; text: string; status: TodoStatus }
export type Connector = { name: string; calls: number; errors: number; lastTool: string; lastAt: number; tools: number }
export type FileUse = { path: string; reads: number; edits: number; writes: number; lastAt: number }
export type SkillUse = { name: string; uses: number; lastAt: number }

// Todos come from three lists: TodoWrite (`todo:`), the Task tools (`task:`) and the Desktop app's plan (`plan:`).
export type Inventory = { todos: Todo[]; connectors: Connector[]; files: FileUse[]; skills: SkillUse[]; toolNames: string[] }

export const EMPTY: Inventory = { todos: [], connectors: [], files: [], skills: [], toolNames: [] }

const DESKTOP_PLAN = 'mcp__ccd_turn__update_plan'
const STATUSES: readonly TodoStatus[] = ['pending', 'in_progress', 'completed']
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const status = (v: unknown): TodoStatus => (STATUSES.includes(v as TodoStatus) ? (v as TodoStatus) : 'pending')

// `mcp__<server>__<tool>` → server and tool; anything else is not a connector.
export function mcpParts(tool: string): { server: string; tool: string } | null {
  if (!tool.startsWith('mcp__')) return null
  const rest = tool.slice(5)
  const at = rest.indexOf('__')
  if (at <= 0) return null
  return { server: rest.slice(0, at), tool: rest.slice(at + 2) }
}

// A server named by a bare id (claude.ai connectors) shows its first block only.
export const serverLabel = (name: string) => (/^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(name) ? `connector ${name.slice(0, 8)}` : name)

// Paths as the tab shows them: forward slashes, the last three parts.
export function shortPath(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts.length <= 3 ? parts.join('/') : parts.slice(-3).join('/')
}

const sameFile = (a: string, b: string) => a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase()

export type FileVerb = 'read' | 'edit' | 'write'

// Which file a tool call touches, and how. Others: null.
export function fileOf(tool: string, input: Record<string, unknown>): { path: string; verb: FileVerb } | null {
  const path = str(input.file_path) || str(input.notebook_path)
  if (!path) return null
  if (tool === 'Read') return { path, verb: 'read' }
  if (tool === 'Edit' || tool === 'MultiEdit' || tool === 'NotebookEdit') return { path, verb: 'edit' }
  if (tool === 'Write') return { path, verb: 'write' }
  return null
}

export function fileUsed(inv: Inventory, path: string, verb: FileVerb, now: number): Inventory {
  const old = inv.files.find(f => sameFile(f.path, path))
  const base: FileUse = old ?? { path, reads: 0, edits: 0, writes: 0, lastAt: now }
  const next: FileUse = { ...base, lastAt: now, reads: base.reads + (verb === 'read' ? 1 : 0), edits: base.edits + (verb === 'edit' ? 1 : 0), writes: base.writes + (verb === 'write' ? 1 : 0) }
  return { ...inv, files: [...inv.files.filter(f => f !== old), next] }
}

export function connectorCalled(inv: Inventory, tool: string, isError: boolean, now: number): Inventory {
  const parts = mcpParts(tool)
  if (!parts) return inv
  const old = inv.connectors.find(c => c.name === parts.server)
  const known = inv.toolNames.includes(tool)
  const next: Connector = {
    name: parts.server,
    calls: (old?.calls ?? 0) + 1,
    errors: (old?.errors ?? 0) + (isError ? 1 : 0),
    lastTool: parts.tool,
    lastAt: now,
    tools: (old?.tools ?? 0) + (known ? 0 : 1),
  }
  return { ...inv, connectors: [...inv.connectors.filter(c => c !== old), next], toolNames: known ? inv.toolNames : [...inv.toolNames, tool] }
}

export function skillUsed(inv: Inventory, name: string, now: number): Inventory {
  if (!name) return inv
  const old = inv.skills.find(s => s.name === name)
  return { ...inv, skills: [...inv.skills.filter(s => s !== old), { name, uses: (old?.uses ?? 0) + 1, lastAt: now }] }
}

const withSource = (todos: readonly Todo[], prefix: string, mine: Todo[]) => [...todos.filter(t => !t.id.startsWith(prefix)), ...mine]

// TodoWrite: the list it sends replaces the previous TodoWrite list.
export function todoWrite(inv: Inventory, input: Record<string, unknown>): Inventory {
  if (!Array.isArray(input.todos)) return inv
  const mine = input.todos.filter(isObj).map((t, i) => ({ id: `todo:${i}`, text: str(t.content) || str(t.activeForm), status: status(t.status) }))
  return { ...inv, todos: withSource(inv.todos, 'todo:', mine) }
}

// TaskCreate (its id comes back in the result) and TaskUpdate. A deleted task goes.
export function taskCreated(inv: Inventory, id: string, subject: string): Inventory {
  if (!id) return inv
  return { ...inv, todos: [...inv.todos.filter(t => t.id !== `task:${id}`), { id: `task:${id}`, text: subject, status: 'pending' }] }
}

export function taskUpdated(inv: Inventory, input: Record<string, unknown>): Inventory {
  const id = `task:${str(input.taskId)}`
  if (!inv.todos.some(t => t.id === id)) return inv
  if (input.status === 'deleted') return { ...inv, todos: inv.todos.filter(t => t.id !== id) }
  return {
    ...inv,
    todos: inv.todos.map(t => (t.id === id ? { ...t, text: str(input.subject) || t.text, status: input.status === undefined ? t.status : status(input.status) } : t)),
  }
}

// The Desktop app's task list: `items` replaces it; `advance`, `done` and `start` move it.
export function desktopPlan(inv: Inventory, input: Record<string, unknown>): Inventory {
  if (Array.isArray(input.items)) {
    const mine = input.items.filter(isObj).map((t, i) => ({ id: `plan:${i}`, text: str(t.content), status: status(t.status) }))
    return { ...inv, todos: withSource(inv.todos, 'plan:', mine) }
  }
  let plan = inv.todos.filter(t => t.id.startsWith('plan:'))
  if (plan.length === 0) return inv
  const set = (i: number, s: TodoStatus) => {
    plan = plan.map((t, j) => (j === i ? { ...t, status: s } : t))
  }
  if (input.advance === true) {
    const cur = plan.findIndex(t => t.status === 'in_progress')
    if (cur >= 0) set(cur, 'completed')
    const nxt = plan.findIndex(t => t.status === 'pending')
    if (nxt >= 0) set(nxt, 'in_progress')
  }
  if (Array.isArray(input.done)) for (const n of input.done) if (typeof n === 'number') set(n - 1, 'completed')
  if (typeof input.start === 'number') set(input.start - 1, 'in_progress')
  return { ...inv, todos: withSource(inv.todos, 'plan:', plan) }
}

// One tool call, seen after it answered.
export function toolSeen(inv: Inventory, tool: string, input: Record<string, unknown>, result: { isError: boolean; taskId?: string }, now: number): Inventory {
  let out = connectorCalled(inv, tool, result.isError, now)
  if (result.isError) return out
  const f = fileOf(tool, input)
  if (f) out = fileUsed(out, f.path, f.verb, now)
  if (tool === 'TodoWrite') out = todoWrite(out, input)
  if (tool === 'TaskCreate' && result.taskId) out = taskCreated(out, result.taskId, str(input.subject))
  if (tool === 'TaskUpdate') out = taskUpdated(out, input)
  if (tool === DESKTOP_PLAN) out = desktopPlan(out, input)
  return out
}

export const counts = (inv: Inventory) => ({
  todos: inv.todos.length,
  todosDone: inv.todos.filter(t => t.status === 'completed').length,
  connectors: inv.connectors.length,
  calls: inv.connectors.reduce((n, c) => n + c.calls, 0),
  errors: inv.connectors.reduce((n, c) => n + c.errors, 0),
  files: inv.files.length,
  edited: inv.files.filter(f => f.edits + f.writes > 0).length,
  skills: inv.skills.length,
})

const TODO_EMOJI: Record<TodoStatus, string> = { completed: '✅', in_progress: '🔄', pending: '⬜' }
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`
const MAX_ROWS = 12

// Newest first, then the rest as one "+N more" line.
function capped<T>(rows: readonly T[], line: (r: T) => TabNode): TabNode[] {
  const shown = rows.slice(0, MAX_ROWS).map(line)
  return rows.length > MAX_ROWS ? [...shown, text(`➕ ${rows.length - MAX_ROWS} more`, { isDim: true })] : shown
}

const byLast = <T extends { lastAt: number }>(xs: readonly T[]) => [...xs].sort((a, b) => b.lastAt - a.lastAt)

function fileLine(f: FileUse): string {
  const bits = [...(f.writes > 0 ? [`written ${f.writes}×`] : []), ...(f.edits > 0 ? [`edited ${f.edits}×`] : []), ...(f.reads > 0 ? [`read ${f.reads}×`] : [])]
  const emoji = f.writes > 0 ? '🆕' : f.edits > 0 ? '✏️' : '👁️'
  return `${emoji} ${shortPath(f.path)} · ${bits.join(' · ')}`
}

export type View = { inv: Inventory; show: number }

// The tab: a summary card, then one card per kind. Each emoji opens its line (a wide glyph mid-line can push a round
// border out of line).
export function inventoryTab(v: View): ModTab {
  const inv = v.inv
  const c = counts(inv)
  const isEmpty = c.todos + c.connectors + c.files + c.skills === 0
  const strip = `📦 ${plural(c.todos, 'todo')} · ${plural(c.connectors, 'connector')} · ${plural(c.files, 'file')} · ${plural(c.skills, 'skill')}`
  const head: TabNode[] = [text(strip, { isBold: true })]
  if (c.todos > 0) head.push(text(`📊 ${c.todosDone}/${c.todos} todos done`, { color: c.todosDone === c.todos ? 'ok' : undefined }))
  if (c.calls > 0) head.push(text(`🔌 ${plural(c.calls, 'connector call')}${c.errors > 0 ? ` · ${plural(c.errors, 'error')}` : ''}`, { color: c.errors > 0 ? 'warn' : undefined }))
  if (c.files > 0) head.push(text(`📄 ${c.edited} of ${plural(c.files, 'file')} changed`, { isDim: true }))
  const body: TabNode[] = [card('🧾 This conversation', head, 'accent')]
  if (isEmpty) {
    body.push(text('Nothing used yet. Todos, connectors, files and skills appear here as Claude uses them.', { isDim: true }))
  } else {
    if (c.todos > 0) {
      const open = inv.todos.filter(t => t.status !== 'completed')
      const tone: TabColor = open.length === 0 ? 'ok' : inv.todos.some(t => t.status === 'in_progress') ? 'accent' : 'warn'
      body.push(card(`📝 Todos · ${c.todosDone}/${c.todos}`, capped(inv.todos, t => text(`${TODO_EMOJI[t.status]} ${t.text || '(untitled)'}`, { isDim: t.status === 'completed', isBold: t.status === 'in_progress' })), tone))
    }
    if (c.connectors > 0) {
      const rows = [...inv.connectors].sort((a, b) => b.calls - a.calls || b.lastAt - a.lastAt)
      body.push(card(`🔌 Connectors · ${plural(c.calls, 'call')}`, capped(rows, k => text(`${k.errors > 0 ? '⚠️' : '🟢'} ${serverLabel(k.name)} · ${plural(k.calls, 'call')} · ${plural(k.tools, 'tool')}${k.errors > 0 ? ` · ${plural(k.errors, 'error')}` : ''} · last ${k.lastTool}`, { color: k.errors > 0 ? 'warn' : undefined })), c.errors > 0 ? 'warn' : 'ok'))
    }
    if (c.files > 0) {
      body.push(card(`📁 Files · ${c.edited} changed · ${c.files - c.edited} read only`, capped(byLast(inv.files), f => text(fileLine(f), { isDim: f.edits + f.writes === 0 })), c.edited > 0 ? 'accent' : undefined))
    }
    if (c.skills > 0) {
      body.push(card(`🧠 Skills · ${plural(c.skills, 'skill')}`, capped(byLast(inv.skills), s => text(`✨ ${s.name} · ${s.uses}×`)), 'ok'))
    }
  }
  body.push({ kind: 'buttons', items: [{ id: 'clear', label: '🧹 Clear', hotkey: 'c' }] })
  const open = c.todos - c.todosDone
  const badge = isEmpty ? '' : open > 0 ? `📝${open}` : String(c.connectors + c.files + c.skills)
  const tone: ModTab['tone'] = c.errors > 0 ? 'warn' : open > 0 ? 'busy' : isEmpty ? 'idle' : 'ok'
  return makeTab('Inventory', body, { badge, tone, show: v.show })
}

export type SummaryState = 'idle' | 'busy' | 'ok' | 'warn' | 'bad'

export function inventoryChip(inv: Inventory): { state: SummaryState; label: string; detail?: string } | null {
  const c = counts(inv)
  if (c.todos + c.connectors + c.files + c.skills === 0) return null
  const open = c.todos - c.todosDone
  return {
    state: c.errors > 0 ? 'warn' : open > 0 ? 'busy' : 'ok',
    label: open > 0 ? `${open} todo${open === 1 ? '' : 's'} open` : `${plural(c.files, 'file')}, ${plural(c.connectors, 'connector')}`,
    detail: `${plural(c.skills, 'skill')}, ${plural(c.calls, 'connector call')}`,
  }
}

export function inventoryText(inv: Inventory): string {
  const c = counts(inv)
  if (c.todos + c.connectors + c.files + c.skills === 0) return 'Nothing used yet this conversation.'
  const out = [`Inventory: ${c.todosDone}/${c.todos} todos done, ${c.connectors} connectors (${c.calls} calls, ${c.errors} errors), ${c.files} files (${c.edited} changed), ${c.skills} skills`]
  for (const t of inv.todos) out.push(`  todo [${t.status}] ${t.text}`)
  for (const k of inv.connectors) out.push(`  connector ${serverLabel(k.name)}: ${k.calls} calls, ${k.errors} errors, last ${k.lastTool}`)
  for (const f of byLast(inv.files)) out.push(`  file ${shortPath(f.path)}: ${f.reads} reads, ${f.edits} edits, ${f.writes} writes`)
  for (const s of byLast(inv.skills)) out.push(`  skill ${s.name}: ${s.uses}x`)
  return out.join('\n')
}
