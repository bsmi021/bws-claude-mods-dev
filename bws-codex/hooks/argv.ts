// The Codex command lines and prompts a job turn runs with, and the turn spec the supervisor reads. Pure.
//
// Every call pins the sandbox, approvals and effort: the person's own ~/.codex/config.toml may say
// danger-full-access, and the lean config (--ignore-user-config) drops it anyway. `exec resume` has no -s
// or -C, so a follow-up passes sandbox_mode with -c and the supervisor starts it with cwd = the worktree.

import type { Effort, Job } from './job'

// Where npm puts the native codex.exe (never the npm .cmd shim, which wedges when started without a shell).
export function codexCandidates(appData: string | undefined): string[] {
  if (!appData) return []
  const pkg = `${appData.replace(/\\/g, '/')}/npm/node_modules/@openai/codex/node_modules/@openai`
  return [
    `${pkg}/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe`,
    `${pkg}/codex-win32-arm64/vendor/aarch64-pc-windows-msvc/bin/codex.exe`,
  ]
}

export type CodexRun = {
  codex: string
  model: string
  effort: Effort
  network: boolean
  worktree: string
  lastFile: string
}

function configFlags(r: CodexRun): string[] {
  return [
    '-c', 'approval_policy="never"',
    '-c', `model_reasoning_effort=${r.effort}`,
    '-c', 'windows.sandbox="elevated"',
    '-c', 'shell_environment_policy.inherit="core"',
    '-c', 'project_doc_fallback_filenames=["CLAUDE.md"]',
    ...(r.network ? ['-c', 'sandbox_workspace_write.network_access=true'] : []),
  ]
}

// The first turn: a new thread in the worktree. The prompt comes on stdin (`-`).
export const execArgv = (r: CodexRun): string[] => [
  r.codex, 'exec', '--json', '--ignore-user-config', '--strict-config',
  '-m', r.model,
  '-C', r.worktree,
  '-s', 'workspace-write',
  ...configFlags(r),
  '-o', r.lastFile,
  '-',
]

// A follow-up turn on the job's thread.
export const resumeArgv = (r: CodexRun, threadId: string): string[] => [
  r.codex, 'exec', 'resume', threadId, '--json', '--ignore-user-config', '--strict-config',
  '-m', r.model,
  '-c', 'sandbox_mode="workspace-write"',
  ...configFlags(r),
  '-o', r.lastFile,
  '-',
]

const RULES = [
  'Rules:',
  '- Edit files only inside this worktree.',
  '- Do not run git add, commit, checkout, switch, branch, stash, reset or merge: the host reviews and commits your changes after this turn.',
  '- If a command is blocked (sandbox, network), say so and move on; do not work around it.',
  '- Run the checks the task names and report their results.',
  '- End with a short final answer: what you changed, the checks you ran and their results, anything blocked or left undone.',
].join('\n')

export function firstPrompt(job: Pick<Job, 'id' | 'branch' | 'base'>, task: string): string {
  return [
    'You are Codex, working a job that Claude Code (the host) delegated to you.',
    `Job ${job.id}: you are in a git worktree on branch ${job.branch}, based on commit ${job.base.slice(0, 8)}.`,
    RULES,
    '',
    'Task:',
    task.trim(),
    '',
  ].join('\n')
}

export function followupPrompt(job: Pick<Job, 'id' | 'branch' | 'head'>, turn: number, task: string): string {
  const head = job.head ? ` (HEAD ${job.head.slice(0, 8)})` : ''
  return [
    `Follow-up turn ${turn} for job ${job.id}, in the same worktree on branch ${job.branch}. The host committed your previous turn${head}.`,
    RULES,
    '',
    'Task:',
    task.trim(),
    '',
  ].join('\n')
}

// What bin/supervise.py reads from turn-<n>.json.
export type TurnSpec = {
  argv: string[]
  cwd: string
  env: Record<string, string>
  base: string
  commitMessage: string
  timeoutS: number
}

export function turnSpec(job: Pick<Job, 'id' | 'title' | 'worktree' | 'base' | 'dir'>, turn: number, argv: string[], timeoutS: number): TurnSpec {
  const tmp = `${job.dir}/tmp`
  return {
    argv,
    cwd: job.worktree,
    // The sandbox's writable temp root follows Codex's TEMP/TMP: point it at the job folder, not the real %TEMP%.
    env: { TEMP: tmp, TMP: tmp },
    base: job.base,
    commitMessage: `codex: ${job.title} (job ${job.id}, turn ${turn})`,
    timeoutS,
  }
}
