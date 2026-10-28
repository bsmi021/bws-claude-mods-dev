import { describe, expect, test } from 'claude-code/testing'

import { ALLOWED, CODEX, COMMON, DENIED, HEAD, NOT_GRANTED, TOP, finishTurn, world } from './world'

const DELEGATE = { tool: 'mcp__bws-codex__codex_delegate', prompt: 'Fix add() in src/calc.py and run python -m unittest.', title: 'Fix calc', effort: 'low' }
const text = (r: { result?: unknown }) => String(r.result)
const idOf = (r: { result?: unknown }) => /codex job ([a-z0-9-]+)/.exec(text(r))?.[1] ?? ''
const dirOf = (id: string) => `${COMMON}/bws-codex/jobs/${id}`
const hasWorktreeAdd = (runs: string[][]) => runs.some(a => a.includes('worktree') && a.includes('add'))

describe('the permission gate on codex_delegate', () => {
  test('allowed: the job starts in its own worktree and the supervisor gets the pinned turn', { options: {} }, async ($, on) => {
    const w = world(on, { bottom: ALLOWED })
    await $.session.start({ cwd: TOP, isInteractive: true } as never)
    expect(w.seen.registered).toEqual(['codex_delegate (pinned)', 'codex_result (pinned)', 'codex_status', 'codex_cancel', 'codex_followup'])

    const r = await $.tool.call(DELEGATE as never)
    expect(r.deny).toBeUndefined()
    expect(w.seen.reached).toEqual(['mcp__bws-codex__codex_delegate'])
    const id = idOf(r)
    expect(id).toMatch(/^fix-calc-[0-9a-f]{6}$/)
    expect(text(r)).toContain(`worktree C:/src/app.codex-worktrees/${id} on branch codex/${id} from 01234567`)

    expect(w.seen.runs).toContainEqual(['git', '-C', TOP, 'worktree', 'add', '-b', `codex/${id}`, `C:/src/app.codex-worktrees/${id}`, HEAD])
    const launch = w.seen.runs.find(a => a[2] === 'launch')
    expect(launch?.slice(2)).toEqual(['launch', dirOf(id), '1'])
    const files = (JSON.parse(w.seen.stdins.at(-1) ?? '{}') as { files: Record<string, string> }).files
    const spec = JSON.parse(files['turn-1.json'] ?? '{}') as { argv: string[]; cwd: string; env: Record<string, string> }
    expect(spec.argv[0]).toBe(CODEX)
    expect(spec.argv.slice(1, 5)).toEqual(['exec', '--json', '--ignore-user-config', '--strict-config'])
    expect(spec.argv).toContain('workspace-write')
    expect(spec.argv).toContain('model_reasoning_effort=low')
    expect(spec.cwd).toBe(`C:/src/app.codex-worktrees/${id}`)
    expect(spec.env.TEMP).toBe(`${dirOf(id)}/tmp`)
    expect(files['turn-1.prompt.txt']).toContain('Fix add() in src/calc.py and run python -m unittest.')

    const status = await $.tool.call({ tool: 'mcp__bws-codex__codex_status' } as never)
    expect(text(status)).toContain(`codex job ${id} "Fix calc": starting turn 1`)
  })

  test('denied beneath (a rule, a tool.check hook, the person\'s No): returned as it is, nothing runs', { options: {} }, async ($, on) => {
    const w = world(on, { bottom: DENIED })
    await $.session.start({ cwd: TOP, isInteractive: true } as never)
    const r = await $.tool.call(DELEGATE as never)
    expect(r.deny).toBe(DENIED.deny)
    expect(hasWorktreeAdd(w.seen.runs)).toBe(false)
    expect(w.seen.runs.some(a => a[2] === 'launch')).toBe(false)
  })

  test('an ask nobody granted (headless, no rule): the engine\'s error is returned, nothing runs', { options: {} }, async ($, on) => {
    const w = world(on, { bottom: NOT_GRANTED })
    await $.session.start({ cwd: TOP, isInteractive: false } as never)
    const r = (await $.tool.call(DELEGATE as never)) as { isError?: boolean; text?: string }
    expect(r.isError).toBe(true)
    expect(r.text).toBe(NOT_GRANTED.text)
    expect(hasWorktreeAdd(w.seen.runs)).toBe(false)
  })

  test('a bad argument after the gate is a deny the model reads', { options: {} }, async ($, on) => {
    world(on)
    await $.session.start({ cwd: TOP } as never)
    const r = await $.tool.call({ tool: 'mcp__bws-codex__codex_delegate', prompt: 'x', effort: 'max' } as never)
    expect(r.deny).toBe('bws-codex: effort must be one of low, medium, high, xhigh')
  })
})

describe('results and the wake', () => {
  test('codex_result is not gated, reads the job folder, and counts the turn as reported', { options: {} }, async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: TOP, isInteractive: true } as never)
    const id = idOf(await $.tool.call(DELEGATE as never))
    w.seen.reached.length = 0
    // Read before the poll sees the end: the wake has nothing left to report.
    finishTurn(w.files, dirOf(id), 1, w.clock.now() + 50_000, 'Fixed add(); tests: 2 run, 2 passed.')

    const r = await $.tool.call({ tool: 'mcp__bws-codex__codex_result', id } as never)
    expect(w.seen.reached).toEqual([])
    expect(text(r).split('\n')[0]).toBe(`codex job ${id} "Fix calc": done in 50s (turn 1); branch codex/${id}: 1 file +1 -1 vs base 01234567`)
    expect(text(r)).toContain('Codex says:\nFixed add(); tests: 2 run, 2 passed.')
    expect(text(r)).toContain(`git merge --no-ff codex/${id}`)
    // Already reported: the poll that sees the end does not wake Claude for it.
    await w.clock.advance(40_000)
    expect(w.seen.submits).toEqual([])
  })

  test('a turn that ends while Claude is idle wakes it once, with a self-contained prompt', { options: {} }, async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: TOP, isInteractive: true } as never)
    const id = idOf(await $.tool.call(DELEGATE as never))
    await $.turn.complete({} as never)
    await w.clock.advance(8_000)
    // Progress is in the tab and the chip, never a status line ($.ui.status draws as a warning).
    expect(w.seen.tabs.at(-1)?.badge).toBe('1▶')

    finishTurn(w.files, dirOf(id), 1, w.clock.now(), 'Fixed add().')
    await w.clock.advance(4_000)
    expect(w.seen.submits.length).toBe(1)
    expect(w.seen.submits[0]).toContain(`bws-codex: codex job ${id} "Fix calc": done in`)
    expect(w.seen.submits[0]).toContain(`codex_result {"id": "${id}"}`)
    expect(w.seen.tabs.at(-1)?.badge).toBe('1')
    expect(w.seen.statuses).toEqual([])
    expect(w.seen.toasts).toEqual([`codex: job ${id} done (1 file +1 -1)`])
    await $.turn.complete({} as never)
    await w.clock.advance(60_000)
    expect(w.seen.submits.length).toBe(1)
  })

  test('while Claude is busy the wake waits for the turn to end; a headless session is never woken', { options: {} }, async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: TOP, isInteractive: true } as never)
    const id = idOf(await $.tool.call(DELEGATE as never))
    await $.prompt.submit({ text: 'keep working', wait: false, origin: { kind: 'composer' } } as never)
    w.seen.submits.length = 0
    finishTurn(w.files, dirOf(id), 1, w.clock.now(), 'Fixed add().')
    await w.clock.advance(8_000)
    expect(w.seen.submits).toEqual([])
    await $.turn.complete({} as never)
    await w.clock.advance(2_000)
    expect(w.seen.submits.length).toBe(1)
  })

  test('headless: no wake', { options: {} }, async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: TOP, isInteractive: false } as never)
    const id = idOf(await $.tool.call(DELEGATE as never))
    finishTurn(w.files, dirOf(id), 1, w.clock.now(), 'Fixed add().')
    await w.clock.advance(60_000)
    expect(w.seen.submits).toEqual([])
  })

  test('a follow-up resumes the thread in the same worktree; a running job refuses one', { options: {} }, async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: TOP, isInteractive: true } as never)
    const id = idOf(await $.tool.call(DELEGATE as never))
    const early = await $.tool.call({ tool: 'mcp__bws-codex__codex_followup', id, prompt: 'more' } as never)
    expect(early.deny).toBe(`bws-codex: job ${id} is still on turn 1: wait for it with codex_result, or codex_cancel it first`)

    finishTurn(w.files, dirOf(id), 1, w.clock.now(), 'Fixed add().')
    const r = await $.tool.call({ tool: 'mcp__bws-codex__codex_followup', id, prompt: 'Rename add to add_numbers.' } as never)
    expect(text(r)).toContain(`Sent follow-up turn 2 to codex job ${id}`)
    const files = (JSON.parse(w.seen.stdins.at(-1) ?? '{}') as { files: Record<string, string> }).files
    const spec = JSON.parse(files['turn-2.json'] ?? '{}') as { argv: string[]; cwd: string }
    expect(spec.argv.slice(1, 4)).toEqual(['exec', 'resume', 'thread-1'])
    expect(spec.argv).toContain('sandbox_mode="workspace-write"')
    expect(spec.cwd).toBe(`C:/src/app.codex-worktrees/${id}`)
    expect(files['turn-2.prompt.txt']).toContain('Follow-up turn 2')
  })

  test('cancel with drop: stops nothing that ended, removes the worktree, archives the thread, deletes a merged branch', { options: {} }, async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: TOP, isInteractive: true } as never)
    const id = idOf(await $.tool.call(DELEGATE as never))
    finishTurn(w.files, dirOf(id), 1, w.clock.now(), 'Fixed add().')
    const r = await $.tool.call({ tool: 'mcp__bws-codex__codex_cancel', id, drop: true } as never)
    expect(text(r)).toContain(`Removed the worktree C:/src/app.codex-worktrees/${id}.`)
    expect(text(r)).toContain('Archived Codex thread thread-1.')
    expect(text(r)).toContain(`Deleted branch codex/${id} (it was merged).`)
    expect(w.seen.runs).toContainEqual([CODEX, 'archive', 'thread-1'])
    expect(w.seen.runs).toContainEqual(['git', '-C', TOP, 'branch', '-d', `codex/${id}`])
    expect((await $.tool.call({ tool: 'mcp__bws-codex__codex_result', id } as never)).deny).toBe(`bws-codex: no Codex job ${id} (codex_status lists them)`)
  })

  test('drop while a Codex helper holds the emptied worktree folder: unregistered, folder reaped in the background', { options: {} }, async ($, on) => {
    const w = world(on, { isRemoveHeld: true })
    await $.session.start({ cwd: TOP, isInteractive: true } as never)
    const id = idOf(await $.tool.call(DELEGATE as never))
    finishTurn(w.files, dirOf(id), 1, w.clock.now(), 'Fixed add().')
    const r = await $.tool.call({ tool: 'mcp__bws-codex__codex_cancel', id, drop: true } as never)
    expect(text(r)).toContain(`Removed the worktree C:/src/app.codex-worktrees/${id} from git; its emptied folder is still held by a Codex helper and is deleted in the background.`)
    expect(w.seen.runs.some(a => a[2] === 'reap' && a[3] === `C:/src/app.codex-worktrees/${id}`)).toBe(true)
  })
})
