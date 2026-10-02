// Loop Watch: reads harness-loop state (loop.json, state.json, TASKS.md) and
// judges it. Pure: no `$`, so tests call it directly.

import type { LoopAlert, LoopNeed, LoopUnit, LoopView } from '../types'

export type { LoopAlert, LoopNeed, LoopUnit, LoopView }

export type LoopLimits = { driverStaleMs: number; idleMs: number; sessionAlert: number }

export type LoopConfig = { name?: string; title?: string; harnessDir?: string; board?: { port?: number } }

// ISO local time without a zone ("2026-10-01T20:31:30"), as the driver writes it.
export const parseLocal = (s: unknown): number | null => {
  if (typeof s !== 'string' || s.length === 0) return null
  const t = Date.parse(s)
  return Number.isNaN(t) ? null : t
}

export const parseNeeds = (tasksMd: string): LoopNeed[] => {
  const out: LoopNeed[] = []
  let inNeeds = false
  for (const line of tasksMd.split(/\r?\n/)) {
    if (line.startsWith('## ')) inNeeds = /^## needs/i.test(line)
    else if (inNeeds) {
      const m = line.match(/^- \[ \] (N\d+)\b\s*(.*)$/)
      if (m) out.push({ id: m[1] ?? '', text: (m[2] ?? '').replace(/^[:—-]\s*/, '').trim() })
    }
  }
  return out
}

export const parseProgress = (tasksMd: string): { done: number; total: number } | null => {
  let inTasks = false
  let done = 0
  let total = 0
  for (const line of tasksMd.split(/\r?\n/)) {
    if (line.startsWith('## ')) inTasks = /^## tasks/i.test(line)
    else if (inTasks) {
      const m = line.match(/^- \[( |x|~)\] T\d+/)
      if (m) {
        total++
        if (m[1] === 'x') done++
      }
    }
  }
  return total > 0 ? { done, total } : null
}

type RawUnit = {
  name?: string
  status?: string
  sessions?: number
  costUsd?: number
  crashes?: number
  folder?: string | null
  message?: string
  heartbeat?: { at?: string; tool?: string } | null
}

type RawState = {
  title?: string
  driver?: { status?: string; message?: string; updated?: string; desired?: string }
  current?: string | null
  order?: string[]
  units?: Record<string, RawUnit>
}

export const parseState = (
  stateJson: string,
  cfg: LoopConfig,
  harnessPy: string,
  stateMtime: number,
): Omit<LoopView, 'needs' | 'alerts'> | null => {
  let s: RawState
  try {
    s = JSON.parse(stateJson) as RawState
  } catch {
    return null
  }
  const ids = s.order && s.order.length > 0 ? s.order : Object.keys(s.units ?? {})
  const units: LoopUnit[] = ids.map(id => {
    const u = s.units?.[id] ?? {}
    return {
      id,
      name: u.name ?? id,
      status: u.status ?? 'PENDING',
      sessions: u.sessions ?? 0,
      costUsd: u.costUsd ?? 0,
      crashes: u.crashes ?? 0,
      folder: u.folder ?? null,
      message: u.message ?? '',
      heartbeatAt: parseLocal(u.heartbeat?.at),
      heartbeatTool: u.heartbeat?.tool ?? null,
      tasksDone: null,
      tasksTotal: null,
    }
  })
  return {
    name: cfg.name ?? 'loop',
    title: cfg.title ?? s.title ?? '',
    harnessPy,
    boardUrl: cfg.board?.port ? `http://localhost:${cfg.board.port}/` : null,
    driver: {
      status: s.driver?.status ?? 'IDLE',
      message: s.driver?.message ?? '',
      updatedAt: parseLocal(s.driver?.updated),
      desired: s.driver?.desired ?? 'idle',
    },
    current: s.current ?? null,
    units,
    stateMtime,
  }
}

export const currentUnit = (v: Pick<LoopView, 'current' | 'units'>) => v.units.find(u => u.id === v.current) ?? null

const minutes = (ms: number) => Math.round(ms / 60000)

export const judge = (v: Omit<LoopView, 'alerts'>, now: number, lim: LoopLimits): LoopAlert[] => {
  const alerts: LoopAlert[] = []
  const cur = currentUnit(v)
  const d = v.driver
  if (d.status === 'RUNNING' && d.updatedAt !== null && now - d.updatedAt >= lim.driverStaleMs) {
    alerts.push({ key: `${v.name}:dead`, level: 'bad', text: `driver says RUNNING but has not updated for ${minutes(now - d.updatedAt)}m: it looks dead (harness.py start --resume relaunches it)` })
  }
  if (d.status === 'RUNNING' && cur && cur.status === 'RUNNING' && cur.heartbeatAt !== null && now - cur.heartbeatAt >= lim.idleMs) {
    alerts.push({ key: `${v.name}:idle:${cur.id}`, level: 'bad', text: `${cur.id} has had no tool activity for ${minutes(now - cur.heartbeatAt)}m (last: ${cur.heartbeatTool ?? 'unknown'})` })
  }
  const isLive = d.status === 'RUNNING' || d.status === 'PAUSED'
  if (isLive && cur && cur.status !== 'DONE' && cur.sessions >= lim.sessionAlert) {
    alerts.push({ key: `${v.name}:sessions:${cur.id}:${cur.sessions}`, level: 'warn', text: `${cur.id} is on session ${cur.sessions}` })
  }
  if (d.status === 'PAUSED') {
    alerts.push({ key: `${v.name}:paused:${d.message}`, level: 'warn', text: `paused for you: ${d.message || 'see the board'}` })
  }
  if (v.units.length > 0 && v.units.every(u => u.status === 'DONE')) {
    alerts.push({ key: `${v.name}:complete`, level: 'info', text: 'every unit is DONE and verified' })
  }
  return alerts
}

// One word for the band chip.
export const loopState = (v: LoopView): { word: string; state: 'good' | 'warn' | 'bad' | 'off' } => {
  if (v.alerts.some(a => a.level === 'bad')) return { word: 'stalled', state: 'bad' }
  if (v.driver.status === 'PAUSED') return { word: 'needs you', state: 'warn' }
  if (v.driver.status === 'RUNNING') return { word: 'running', state: v.alerts.some(a => a.level === 'warn') ? 'warn' : 'good' }
  if (v.units.length > 0 && v.units.every(u => u.status === 'DONE')) return { word: 'done', state: 'good' }
  return { word: v.driver.status.toLowerCase(), state: 'off' }
}

export const ago = (then: number | null, now: number): string => {
  if (then === null) return '-'
  const s = Math.max(0, Math.round((now - then) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

export const money = (n: number) => `$${n.toFixed(2)}`

export const answerCommand = (v: LoopView, unit: string, need: string) => `python ${v.harnessPy} answer ${unit} ${need} "<your answer>"`

export const loopText = (v: LoopView, now: number): string => {
  const cost = v.units.reduce((s, u) => s + u.costUsd, 0)
  const sessions = v.units.reduce((s, u) => s + u.sessions, 0)
  const done = v.units.filter(u => u.status === 'DONE').length
  const lines = [
    `Loop ${v.name}${v.title ? ` (${v.title})` : ''}: ${v.driver.status}, updated ${ago(v.driver.updatedAt, now)}${v.boardUrl ? `, board ${v.boardUrl}` : ''}`,
    ...v.units.map(u => {
      const mark = u.id === v.current ? '>' : ' '
      const prog = u.tasksTotal !== null ? ` ${u.tasksDone}/${u.tasksTotal} tasks` : ''
      const hb = u.status === 'RUNNING' && u.heartbeatAt !== null ? `, ${u.heartbeatTool ?? 'tool'} ${ago(u.heartbeatAt, now)}` : ''
      return `${mark} ${u.id} ${u.status} - ${u.name}: ${u.sessions} session${u.sessions === 1 ? "" : "s"}, ${money(u.costUsd)}${prog}${hb}`
    }),
    `${v.units.length} units, ${done} done, ${sessions} sessions, ${money(cost)}`,
    ...v.alerts.map(a => `! ${a.text}`),
    ...v.needs.map(n => `Needs you (${v.current}): ${n.id} ${n.text}\n  ${answerCommand(v, v.current ?? '?', n.id)}`),
  ]
  if (v.driver.message && v.driver.status !== 'PAUSED') lines.splice(1, 0, `  ${v.driver.message}`)
  return lines.join('\n')
}
