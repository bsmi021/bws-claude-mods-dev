// The session's task list, for the bar's progress row: TodoWrite, the Task tools and the Desktop app's plan
// (update_plan, checked off by wrap_up). Pure; register.tsx feeds it each tool call once it answered.

export type TaskStatus = 'pending' | 'in_progress' | 'completed'
export type Task = { id: string; text: string; status: TaskStatus }
export type TaskList = { startedAt: number; items: Task[] }

export const PLAN_TOOL = 'mcp__ccd_turn__update_plan'
export const WRAP_TOOL = 'mcp__ccd_turn__wrap_up'

const STATUSES: readonly TaskStatus[] = ['pending', 'in_progress', 'completed']
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const status = (v: unknown): TaskStatus => (STATUSES.includes(v as TaskStatus) ? (v as TaskStatus) : 'pending')

// A source's list replaces that source's items and keeps the others'.
const withSource = (items: readonly Task[], prefix: string, mine: Task[]) => [...items.filter(t => !t.id.startsWith(prefix)), ...mine]

function plan(items: readonly Task[], input: Record<string, unknown>): Task[] {
  if (Array.isArray(input.items)) {
    const mine = input.items.filter(isObj).map((t, i) => ({ id: `plan:${i}`, text: str(t.content), status: status(t.status) }))
    return withSource(items, 'plan:', mine)
  }
  let steps = items.filter(t => t.id.startsWith('plan:'))
  if (steps.length === 0) return [...items]
  const set = (i: number, s: TaskStatus) => {
    steps = steps.map((t, j) => (j === i ? { ...t, status: s } : t))
  }
  if (input.advance === true) {
    const cur = steps.findIndex(t => t.status === 'in_progress')
    if (cur >= 0) set(cur, 'completed')
    const nxt = steps.findIndex(t => t.status === 'pending')
    if (nxt >= 0) set(nxt, 'in_progress')
  }
  if (Array.isArray(input.done)) for (const n of input.done) if (typeof n === 'number') set(n - 1, 'completed')
  if (typeof input.start === 'number') set(input.start - 1, 'in_progress')
  return withSource(items, 'plan:', steps)
}

// One tool call that answered without error. `taskId` is TaskCreate's id from its result.
export function taskSeen(list: TaskList, tool: string, input: Record<string, unknown>, taskId?: string): TaskList {
  const items = list.items
  if (tool === 'TodoWrite' && Array.isArray(input.todos)) {
    const mine = input.todos.filter(isObj).map((t, i) => ({ id: `todo:${i}`, text: str(t.content) || str(t.activeForm), status: status(t.status) }))
    return { ...list, items: withSource(items, 'todo:', mine) }
  }
  if (tool === 'TaskCreate' && taskId) {
    const id = `task:${taskId}`
    return { ...list, items: [...items.filter(t => t.id !== id), { id, text: str(input.subject), status: 'pending' }] }
  }
  if (tool === 'TaskUpdate') {
    const id = `task:${str(input.taskId)}`
    if (!items.some(t => t.id === id)) return list
    if (input.status === 'deleted') return { ...list, items: items.filter(t => t.id !== id) }
    const next = (t: Task) => ({ ...t, text: str(input.subject) || t.text, status: input.status === undefined ? t.status : status(input.status) })
    return { ...list, items: items.map(t => (t.id === id ? next(t) : t)) }
  }
  if (tool === PLAN_TOOL) return { ...list, items: plan(items, input) }
  // wrap_up checks off the Desktop plan.
  if (tool === WRAP_TOOL) return { ...list, items: items.map(t => (t.id.startsWith('plan:') ? { ...t, status: 'completed' as const } : t)) }
  return list
}

export type TaskProgress = { done: number; total: number; current: string | null }

export function taskProgress(items: readonly Task[]): TaskProgress {
  const done = items.filter(t => t.status === 'completed').length
  const current = items.find(t => t.status === 'in_progress') ?? items.find(t => t.status === 'pending')
  return { done, total: items.length, current: current && done < items.length ? current.text : null }
}

// A bar of `width` cells: filled for the done share, at least one cell once anything is done and one empty until all is.
export function barCells(done: number, total: number, width: number): { fill: number; empty: number } {
  if (total <= 0 || width <= 0) return { fill: 0, empty: Math.max(0, width) }
  let fill = Math.round((done / total) * width)
  if (done > 0 && fill === 0) fill = 1
  if (done < total && fill === width) fill = width - 1
  fill = Math.max(0, Math.min(width, fill))
  return { fill, empty: width - fill }
}
