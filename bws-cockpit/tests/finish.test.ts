import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { actionable, claimsDone, decide, hasEvidence, isHandBack, isParked, openItems, writtenRunFolders } from '../hooks/finish'

const CWD = 'C:/proj'
const STARTED = 1_000_000
const norm = (p: unknown) => String(p).split(String.fromCharCode(92)).join('/')

const PLAN = `# PLAN

## Finish line
1. validate passes

## Tasks
- [x] write the parser
- [ ] add the band row
- [ ] write the README
- [ ] ask the user which color to use (needs the user: palette)
- [ ] Desktop app check (parked)
`

type World = { plan?: string; tasks?: string; mtime?: number; surfaces?: string[]; noRuns?: boolean; owned?: boolean }

type Started = { at: number }

// Stubs the world; then, unless `owned: false`, this session writes its PLAN.md, which is what makes
// the run folder its own (a folder a harness worker writes never counts).
async function world($: { tool: { call: (input: never) => Promise<unknown> } }, on: On, w: World) {
  mock.clock(on, { now: STARTED + 5_000 })
  const toasts: string[] = []
  const started: Started = { at: STARTED }
  on('session.cwd', () => ({ value: CWD }))
  on('session.surfaces', () => ({ value: (w.surfaces ?? ['terminal']) as never }))
  on('session.usage', () => ({ value: { startedAt: started.at, context: {}, rateLimits: [], cost: {} } as never }))
  on('ui.toast', ($, e) => {
    toasts.push(String((e as { text?: string }).text ?? ''))
    return { value: undefined }
  })
  const run = `${CWD}/runs/2026-10-02-band-row`
  const files: Record<string, string> = { [`${run}/PLAN.md`]: w.plan ?? PLAN }
  if (w.tasks !== undefined) files[`${run}/TASKS.md`] = w.tasks
  on('fs.list', ($, e) => {
    const p = norm(e.path)
    if (p === `${CWD}/runs` && !w.noRuns) return { value: [{ name: '2026-10-02-band-row', kind: 'dir', size: 0, mtimeMs: 0, isLink: false }] }
    if (p === run) {
      return {
        value: Object.keys(files).map(f => ({ name: f.slice(run.length + 1), kind: 'file' as const, size: 1, mtimeMs: w.mtime ?? STARTED + 2_000, isLink: false })),
      }
    }
    throw new Error(`ENOENT ${p}`)
  })
  on('fs.read', ($, e) => {
    const hit = files[norm(e.path)]
    if (hit === undefined) throw new Error(`ENOENT ${e.path}`)
    return { value: hit as never }
  })
  on('classic.Stop', () => ({}))
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', () => ({ result: {} as never }))
  if (w.owned !== false) await $.tool.call({ tool: 'Write', file_path: `${CWD}/runs/2026-10-02-band-row/PLAN.md`, content: '' } as never)
  return { toasts, started }
}

const stop = (message: string, extra: Record<string, unknown> = {}) =>
  ({ stop_hook_active: false, last_assistant_message: message, background_tasks: [], session_crons: [], ...extra }) as never

const turnDone = (answer: string) => ({ answer, durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answered' }) as never

// ---------- pure ----------

describe('finish-line rules', () => {
  test('open items, parked items, actionable', () => {
    const items = openItems(PLAN)
    expect(items).toEqual(['add the band row', 'write the README', 'ask the user which color to use (needs the user: palette)', 'Desktop app check (parked)'])
    expect(actionable(items)).toEqual(['add the band row', 'write the README'])
    expect(isParked('flaky test (blocked: CI is down)')).toBe(true)
    expect(isParked('waiting on the art lead for the sprites')).toBe(true)
    expect(isParked('write the README')).toBe(false)
  })

  test('hand-back: a question or explicit phrasing', () => {
    expect(isHandBack('Two options. Which one do you want?')).toBe(true)
    expect(isHandBack('Built it.\n\nWant me to wire it into the band too?')).toBe(true)
    expect(isHandBack('Done with step 1. Your call on the palette.')).toBe(true)
    expect(isHandBack('I added the parser and the tests.')).toBe(false)
  })

  test('hand-back: imperative asks from real replies; an offer is not one', () => {
    expect(isHandBack('It needs the tablet connected and unlocked. Tell me when it\'s plugged in.')).toBe(true)
    expect(isHandBack('When the apps are open, tell me "tablet ready" and I\'ll record the answer.')).toBe(true)
    expect(isHandBack('When you say "tablet ready", I\'ll record your answer and resume the loop.')).toBe(true)
    expect(isHandBack('Once the notebook is on a tablet, say "go" and I\'ll check it.')).toBe(true)
    expect(isHandBack('I\'ll leave the loop running and check it again when you next ask.')).toBe(true)
    expect(isHandBack('Next: the faster pose model. Say if you want a different order.')).toBe(false)
    expect(isHandBack('I\'ll tell the worker to rerun the gate.')).toBe(false)
  })

  test('parked: harness proposals and items addressed to the owner', () => {
    expect(isParked('N1 (proposed-task) The gate failed in sessions 3 and 4')).toBe(true)
    expect(isParked('Brian: tape floor marks, record the 34 takes', 'Brian')).toBe(true)
    expect(isParked('Brian: tape floor marks', 'the user')).toBe(false)
    expect(isParked('Quick pass two: hand landmarker wrists', 'Brian')).toBe(false)
    expect(actionable(['Brian: record takes', 'faster pose model'], 'Brian')).toEqual(['faster pose model'])
  })

  test('ownership: which run folders a tool call writes', () => {
    const run = 'C:/p/runs/2026-10-10-x/PLAN.md'
    expect(writtenRunFolders('Write', { file_path: run })).toEqual(['2026-10-10-x'])
    expect(writtenRunFolders('Edit', { file_path: 'C:\\p\\runs\\2026-10-10-x\\TASKS.md' })).toEqual(['2026-10-10-x'])
    expect(writtenRunFolders('Edit', { file_path: 'C:/p/src/a.ts' })).toEqual([])
    expect(writtenRunFolders('Bash', { command: 'cat runs/2026-10-10-x/TASKS.md | head' })).toEqual([])
    expect(writtenRunFolders('Bash', { command: 'python tools/h/harness.py status 2>&1 | tail -5' })).toEqual([])
    expect(writtenRunFolders('Bash', { command: 'git log > runs/2026-10-10-x/receipts/log.txt 2>&1' })).toEqual(['2026-10-10-x'])
    expect(writtenRunFolders('Bash', { command: "sed -i 's/- \\[ \\] T1/- [x] T1/' runs/2026-10-10-x/PLAN.md" })).toEqual(['2026-10-10-x'])
    expect(writtenRunFolders('Bash', { command: 'mkdir -p runs/2026-10-10-x/receipts' })).toEqual(['2026-10-10-x'])
    expect(writtenRunFolders('PowerShell', { command: 'Set-Content runs\\2026-10-10-x\\RUNLOG.md "x"' })).toEqual(['2026-10-10-x'])
    expect(writtenRunFolders('Read', { file_path: run })).toEqual([])
  })

  test('completion claims and evidence', () => {
    expect(claimsDone('All done. The band shows the run row.')).toBe(true)
    expect(claimsDone('Step 2 of 4 is in; the parser handles tabs.')).toBe(false)
    expect(hasEvidence('48/48 tests pass')).toBe(true)
    expect(hasEvidence('validate passed, 16 pass, receipts in runs/x/receipts/test.txt')).toBe(true)
    expect(hasEvidence('committed as 8de0a99')).toBe(true)
    expect(hasEvidence('It works now, trust me.')).toBe(false)
  })

  test('decide: open items block, the cap holds, waiting and hand-back pass', () => {
    const base = { open: ['add the band row'], folder: 'runs/x', message: 'Parser is in.', continuesUsed: 0, maxContinues: 2, isWaiting: false, evidenceCheck: true }
    expect(decide(base)?.kind).toBe('open')
    expect(decide({ ...base, continuesUsed: 2 })).toBeNull()
    expect(decide({ ...base, isWaiting: true })).toBeNull()
    expect(decide({ ...base, message: 'Parser is in. Should I do the band row now?' })).toBeNull()
    expect(decide({ ...base, open: [], message: 'All done.' })?.kind).toBe('evidence')
    expect(decide({ ...base, open: [], message: 'All done: 48/48 tests pass.' })).toBeNull()
    expect(decide({ ...base, open: [], message: 'All done.', evidenceCheck: false })).toBeNull()
  })
})

// ---------- hooks ----------

describe('finish-line guard', () => {
  test('blocks a stop while the session run folder has open items, and names them', async ($, on) => {
    const w = await world($, on, {})
    const r = await $.classic.Stop(stop('The parser is in.'))
    expect(r.block).toContain('runs/2026-10-02-band-row still has 2 open items: add the band row; write the README')
    expect(r.block).not.toContain('palette')
    expect(w.toasts.some(t => /2 open, keeping Claude going/.test(t))).toBe(true)
  })

  test('at most 2 blocks per prompt; a new prompt resets the count', async ($, on) => {
    on('prompt.submit', ($, e) => ({ text: String((e as { text?: string }).text ?? '') }) as never)
    await world($, on, {})
    expect((await $.classic.Stop(stop('a'))).block).toBeDefined()
    expect((await $.classic.Stop(stop('b', { stop_hook_active: true }))).block).toBeDefined()
    expect((await $.classic.Stop(stop('c', { stop_hook_active: true }))).block).toBeUndefined()
    await $.prompt.submit({ text: 'keep going' } as never)
    expect((await $.classic.Stop(stop('d'))).block).toBeDefined()
  })

  test('everything ticked or parked: no block', async ($, on) => {
    await world($, on, { plan: '## Tasks\n- [x] a\n- [ ] b (blocked: needs a license key)\n' })
    expect((await $.classic.Stop(stop('Finished a; b is blocked, see the checklist. 3 pass.'))).block).toBeUndefined()
  })

  test('a question hands back, background work waits: no block', async ($, on) => {
    await world($, on, {})
    expect((await $.classic.Stop(stop('Which palette do you want?'))).block).toBeUndefined()
    expect((await $.classic.Stop(stop('Build running.', { background_tasks: [{ id: 'b1' }] }))).block).toBeUndefined()
  })

  test('evidenceCheck: true blocks a done claim without evidence once; with evidence it passes', { options: { evidenceCheck: true } }, async ($, on) => {
    await world($, on, { plan: '## Tasks\n- [x] a\n' })
    const r = await $.classic.Stop(stop('All done. The band row works.'))
    expect(r.block).toContain('cites no evidence')
    const ok = await $.classic.Stop(stop('All done: 51/51 tests pass, receipts/test.txt.'))
    expect(ok.block).toBeUndefined()
  })

  test('the evidence check is off by default', async ($, on) => {
    await world($, on, { plan: '## Tasks\n- [x] a\n' })
    expect((await $.classic.Stop(stop('All done. The band row works.'))).block).toBeUndefined()
  })

  // backgroundProbe off: turn.complete's band refresh would outlive this short test.
  test('a run folder a worker wrote (fresh, but never written by this session) is ignored', { options: { backgroundProbe: false } }, async ($, on) => {
    await world($, on, { owned: false })
    expect((await $.classic.Stop(stop('The loop is running; I will check it later.'))).block).toBeUndefined()
    // Reading the worker's checklist claims nothing either.
    await $.tool.call({ tool: 'Bash', command: 'cat runs/2026-10-02-band-row/TASKS.md; tail -5 runs/2026-10-02-band-row/RUNLOG.md 2>&1' })
    expect((await $.classic.Stop(stop('Still running.'))).block).toBeUndefined()
    const r = await $.turn.complete(turnDone('Still running.'))
    expect(r.text).toBe('')
  })

  test('a shell write into the run folder makes it this session\'s', async ($, on) => {
    await world($, on, { owned: false })
    await $.tool.call({ tool: 'Bash', command: "echo '- step 1 done' >> runs/2026-10-02-band-row/RUNLOG.md" })
    expect((await $.classic.Stop(stop('The parser is in.'))).block).toContain('2 open items')
  })

  test('a new conversation (another start time) forgets the folders the last one wrote', async ($, on) => {
    const w = await world($, on, {})
    w.started.at = STARTED + 1
    expect((await $.classic.Stop(stop('The parser is in.'))).block).toBeUndefined()
  })

  test('the 10-06 shapes: a supervisor reply and a "tell me when" hand-back pass; a "say if" offer still blocks', async ($, on) => {
    await world($, on, {})
    expect((await $.classic.Stop(stop('Next is F5. It needs the tablet connected and unlocked. Tell me when it\'s plugged in.'))).block).toBeUndefined()
    expect((await $.classic.Stop(stop('The measured comparison waits on your takes. Say if you want a different order.'))).block).toContain('2 open items')
  })

  test('no runs folder: the guard stays out of the way', async ($, on) => {
    await world($, on, { noRuns: true })
    expect((await $.classic.Stop(stop('All done.'))).block).toBeUndefined()
  })

  test('headless sessions are skipped unless finishLineHeadless is on', async ($, on) => {
    await world($, on, { surfaces: [] })
    expect((await $.classic.Stop(stop('The parser is in.'))).block).toBeUndefined()
  })

  test('finishLineHeadless: true guards headless sessions too', { options: { finishLineHeadless: true } }, async ($, on) => {
    await world($, on, { surfaces: [] })
    expect((await $.classic.Stop(stop('The parser is in.'))).block).toContain('2 open items')
  })

  test('ownerName names the person in the block message; "(needs <Name>: ...)" parks an item', { options: { ownerName: 'Dana' } }, async ($, on) => {
    await world($, on, { plan: '## Tasks\n- [ ] add the band row\n- [ ] pick the palette (needs Dana: warm or cool?)\n' })
    const r = await $.classic.Stop(stop('The parser is in.'))
    expect(r.block).toContain('1 open item: add the band row')
    expect(r.block).toContain('If one is blocked or needs Dana')
    expect(r.block).toContain('"(needs Dana: question)"')
  })

  test('the default owner is "the user"', async ($, on) => {
    await world($, on, {})
    const r = await $.classic.Stop(stop('The parser is in.'))
    expect(r.block).toContain('"(needs the user: question)"')
  })

  test('finishLine: false passes everything through', { options: { finishLine: false } }, async ($, on) => {
    await world($, on, {})
    expect((await $.classic.Stop(stop('The parser is in.'))).block).toBeUndefined()
  })

  test('a turn that ends with open items shows the line under the answer', async ($, on) => {
    await world($, on, {})
    const r = await $.turn.complete(turnDone('Parser is in.'))
    expect(r.text).toBe('⚑ finish line: 2 open · add the band row; write the README')
  })

  test('no line when the checklist is clear', async ($, on) => {
    await world($, on, { plan: '## Tasks\n- [x] a\n' })
    const r = await $.turn.complete(turnDone('Done: 3 pass.'))
    expect(r.text).toBe('')
  })
})
