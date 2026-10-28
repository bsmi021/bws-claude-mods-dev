// The context a chat turn carries: the git capsule (a small <workspace> block built from git's own output, no model
// turn) and the partner brief each engine starts from. Pure: register.ts runs the git commands.

import type { Engine } from './chat'

// The three git commands the capsule reads, in Claude's working tree.
export const capsuleArgv = (cwd: string): string[][] => [
  ['git', '-C', cwd, 'status', '--porcelain=v1', '--branch'],
  ['git', '-C', cwd, 'diff', 'HEAD', '--shortstat'],
  ['git', '-C', cwd, 'log', '-1', '--format=%h %s (%cr)'],
]

export type GitOut = { status: string; shortstat: string; log: string }

const MAX_FILES = 20
const MAX_LINE = 160
export const CAPSULE_MAX = 1500

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

// `## main...origin/main [ahead 1, behind 2]`, `## HEAD (no branch)`, `## No commits yet on main`.
export function branchOf(statusLine: string): string {
  const s = statusLine.replace(/^##\s*/, '').trim()
  if (s.startsWith('No commits yet on ')) return `${s.slice('No commits yet on '.length)} (no commits yet)`
  if (s.startsWith('HEAD (no branch)')) return 'detached HEAD'
  const m = /^(\S+?)(?:\.\.\.(\S+))?(?:\s+\[(.+)\])?$/.exec(s)
  if (m === null || m[1] === undefined) return s
  const track = m[2] === undefined ? '' : m[3] === undefined ? `, up to date with ${m[2]}` : `, ${m[3]} of ${m[2]}`
  return `${m[1]}${track}`
}

// The <workspace> block: branch, last commit, uncommitted diff stat, dirty files. Empty git output reads as unknown.
export function capsuleText(cwd: string, g: GitOut | null): string {
  if (g === null) return `<workspace path="${cwd}">\nnot a git repository (or git did not run)\n</workspace>`
  const lines = g.status.split(/\r?\n/).filter(l => l.trim() !== '')
  const head = lines[0]?.startsWith('##') ? branchOf(lines[0]) : 'unknown'
  const dirty = lines.filter(l => !l.startsWith('##')).map(l => l.replace(/\s+/g, ' ').trim())
  const shown = dirty.slice(0, MAX_FILES).map(l => clip(l, MAX_LINE))
  const more = dirty.length > MAX_FILES ? ` · … ${dirty.length - MAX_FILES} more` : ''
  const out = [
    `<workspace path="${cwd}" note="Claude's working tree">`,
    `branch: ${head}`,
    `last commit: ${clip(g.log.trim() || 'none', MAX_LINE)}`,
    `uncommitted vs HEAD: ${g.shortstat.trim() || 'no tracked changes'}`,
    dirty.length === 0 ? 'dirty files: none' : `dirty files (${dirty.length}): ${shown.join(' · ')}${more}`,
    '</workspace>',
  ].join('\n')
  if (out.length <= CAPSULE_MAX) return out
  return `${out.slice(0, CAPSULE_MAX - 14)}…\n</workspace>`
}

// What Codex is told it is, once per thread: as `instructions` on every api turn (they are not inherited), and at the top
// of a codex thread's first prompt.
export function partnerBrief(engine: Engine, branch?: string): string {
  const common = [
    'You are Codex, pairing with a developer beside Claude Code (Anthropic\'s coding agent), which is doing the main work in their repository.',
    'Each message starts with a <workspace> block: the branch, last commit, uncommitted diff stat and dirty files of Claude\'s working tree, taken just before the message. It may also carry Claude\'s latest reply or recent turns, pulled in by the developer.',
    'Answer the developer directly and briefly: reviews, second opinions, plans, risks, code. Your answer may be sent back to Claude as its next prompt, so keep it self-contained.',
  ]
  if (engine === 'api')
    return [...common, 'You cannot read files or run commands: say which file or output you would need to see instead of guessing.'].join('\n')
  return [
    ...common,
    `You are in your own git worktree${branch ? ` on branch ${branch}` : ''}, made from Claude's last commit: you can read files and run commands there. The <workspace> block describes Claude's tree, not yours.`,
    'Change files only when the developer asks. Never run git add, commit, checkout, switch, branch, stash, reset or merge: the host commits what you change on your branch after each turn, and Claude can merge it.',
  ].join('\n')
}
