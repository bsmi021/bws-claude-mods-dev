// What a toast says. Pure: no engine, so the tests can hold every wording.

const MARKUP = /!?\[([^\]]*)\]\([^)]*\)|[`*_#>]|^\s*[-+]\s+/gm

// The first non-empty line of a reply, markup stripped, cut to max characters with an ellipsis.
export const firstLine = (text: string | undefined, max: number): string => {
  const line = (text ?? '')
    .split(/\r?\n/)
    .map(l => l.replace(MARKUP, (_m, label) => (typeof label === 'string' ? label : '')).trim())
    .find(l => l !== '')
  if (line === undefined) return ''
  return line.length > max ? `${line.slice(0, Math.max(1, max - 1)).trimEnd()}…` : line
}

export const project = (cwd: string): string => {
  const parts = cwd.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] ?? cwd
}

export const duration = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`
}

export type Toast = { title: string; body: string }

export const needsInput = (cwd: string, message: string, kind: string, max: number): Toast => ({
  title: `${project(cwd)} · ${kind === 'idle_prompt' ? 'waiting for you' : 'needs you'}`,
  body: firstLine(message, max) || 'Claude is waiting on you.',
})

export const turnDone = (cwd: string, last: string | undefined, ms: number | undefined, max: number): Toast => ({
  title: `${project(cwd)} · done${ms === undefined ? '' : ` (${duration(ms)})`}`,
  body: firstLine(last, max) || 'Claude finished.',
})

export const subagentDone = (cwd: string, agentType: string, last: string | undefined, max: number): Toast => ({
  title: `${project(cwd)} · ${agentType} finished`,
  body: firstLine(last, max) || 'Subagent finished.',
})

export const failure = (cwd: string, error: string, details: string | undefined, max: number): Toast => ({
  title: `${project(cwd)} · error: ${error}`,
  body: firstLine(details, max) || 'The turn ended on an error.',
})

// The wscript argument: base64 of the UTF-8 JSON, so no quoting or escaping reaches a shell.
export const encode = (t: Toast): string => {
  const json = JSON.stringify(t)
  let bin = ''
  for (const b of new TextEncoder().encode(json)) bin += String.fromCharCode(b)
  return btoa(bin)
}

// A real subagent report: it has a type and is not the JSON array a prompt-suggestion fork returns.
export const isReport = (agentType: string | undefined, last: string | undefined): boolean =>
  (agentType ?? '').trim() !== '' && !/^\s*\[\s*\{\s*"label"/.test(last ?? '')
