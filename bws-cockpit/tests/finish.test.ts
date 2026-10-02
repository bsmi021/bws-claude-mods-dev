import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { actionable, claimsDone, decide, hasEvidence, isHandBack, isParked, openItems } from '../hooks/finish'

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

type World = { plan?: string; tasks?: string; mtime?: number; surfaces?: string[]; noRuns?: boolean }

function world(on: On, w: World) {
  mock.clock(on, { now: STARTED + 5_000 })
  const toasts: string[] = []
  on('session.cwd', () => ({ value: CWD }))
  on('session.surfaces', () => ({ value: (w.surfaces ?? ['terminal']) as never }))
  on('session.usage', () => ({ value: { startedAt: STARTED, context: {}, rateLimits: [], cost: {} } as never }))
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
  return { toasts }
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
    const w = world(on, {})
    const r = await $.classic.Stop(stop('The parser is in.'))
    expect(r.block).toContain('runs/2026-10-02-band-row still has 2 open items: add the band row; write the README')
    expect(r.block).not.toContain('palette')
    expect(w.toasts.some(t => /2 open, keeping Claude going/.test(t))).toBe(true)
  })

  test('at most 2 blocks per prompt; a new prompt resets the count', async ($, on) => {
    world(on, {})
    on('prompt.submit', ($, e) => ({ text: String((e as { text?: string }).text ?? '') }) as never)
    expect((await $.classic.Stop(stop('a'))).block).toBeDefined()
    expect((await $.classic.Stop(stop('b', { stop_hook_active: true }))).block).toBeDefined()
    expect((await $.classic.Stop(stop('c', { stop_hook_active: true }))).block).toBeUndefined()
    await $.prompt.submit({ text: 'keep going' } as never)
    expect((await $.classic.Stop(stop('d'))).block).toBeDefined()
  })

  test('everything ticked or parked: no block', async ($, on) => {
    world(on, { plan: '## Tasks\n- [x] a\n- [ ] b (blocked: needs a license key)\n' })
    expect((await $.classic.Stop(stop('Finished a; b is blocked, see the checklist. 3 pass.'))).block).toBeUndefined()
  })

  test('a question hands back, background work waits: no block', async ($, on) => {
    world(on, {})
    expect((await $.classic.Stop(stop('Which palette do you want?'))).block).toBeUndefined()
    expect((await $.classic.Stop(stop('Build running.', { background_tasks: [{ id: 'b1' }] }))).block).toBeUndefined()
  })

  test('a done claim without evidence is blocked once; with evidence it passes', async ($, on) => {
    world(on, { plan: '## Tasks\n- [x] a\n' })
    const r = await $.classic.Stop(stop('All done. The band row works.'))
    expect(r.block).toContain('cites no evidence')
    const ok = await $.classic.Stop(stop('All done: 51/51 tests pass, receipts/test.txt.'))
    expect(ok.block).toBeUndefined()
  })

  test('a run folder not touched this session is ignored', async ($, on) => {
    world(on, { mtime: STARTED - 60_000 })
    expect((await $.classic.Stop(stop('All done.'))).block).toBeUndefined()
  })

  test('no runs folder: the guard stays out of the way', async ($, on) => {
    world(on, { noRuns: true })
    expect((await $.classic.Stop(stop('All done.'))).block).toBeUndefined()
  })

  test('headless sessions are skipped unless finishLineHeadless is on', async ($, on) => {
    world(on, { surfaces: [] })
    expect((await $.classic.Stop(stop('The parser is in.'))).block).toBeUndefined()
  })

  test('finishLineHeadless: true guards headless sessions too', { options: { finishLineHeadless: true } }, async ($, on) => {
    world(on, { surfaces: [] })
    expect((await $.classic.Stop(stop('The parser is in.'))).block).toContain('2 open items')
  })

  test('ownerName names the person in the block message; "(needs <Name>: ...)" parks an item', { options: { ownerName: 'Dana' } }, async ($, on) => {
    world(on, { plan: '## Tasks\n- [ ] add the band row\n- [ ] pick the palette (needs Dana: warm or cool?)\n' })
    const r = await $.classic.Stop(stop('The parser is in.'))
    expect(r.block).toContain('1 open item: add the band row')
    expect(r.block).toContain('If one is blocked or needs Dana')
    expect(r.block).toContain('"(needs Dana: question)"')
  })

  test('the default owner is "the user"', async ($, on) => {
    world(on, {})
    const r = await $.classic.Stop(stop('The parser is in.'))
    expect(r.block).toContain('"(needs the user: question)"')
  })

  test('finishLine: false passes everything through', { options: { finishLine: false } }, async ($, on) => {
    world(on, {})
    expect((await $.classic.Stop(stop('The parser is in.'))).block).toBeUndefined()
  })

  test('a turn that ends with open items shows the line under the answer', async ($, on) => {
    world(on, {})
    const r = await $.turn.complete(turnDone('Parser is in.'))
    expect(r.text).toBe('⚑ finish line: 2 open · add the band row; write the README')
  })

  test('no line when the checklist is clear', async ($, on) => {
    world(on, { plan: '## Tasks\n- [x] a\n' })
    const r = await $.turn.complete(turnDone('Done: 3 pass.'))
    expect(r.text).toBe('')
  })
})
