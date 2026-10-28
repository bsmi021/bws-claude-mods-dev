import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { ageText, noHandoffText, parseHandoff, pickHandoff, pickupPrompt, pickupText, STALE_MS } from '../hooks/pickup'

const CWD = 'C:/proj'
const NOW = Date.parse('2026-10-28T12:00:00')
const HOUR = 60 * 60_000
const norm = (p: unknown) => String(p).split(String.fromCharCode(92)).join('/')

const HANDOFF = [
  '# Handoff: band row',
  '',
  '## Finish line',
  '- [x] 1. parser',
  '- [ ] 2. README section',
  '3. live check: open',
  '',
  '## Live state',
  '| Claim | How to check |',
  '|---|---|',
  '| main at 1067fd6 | `git log -1 --format=%h` |',
  '| gate passes | `python tools/mods-gate.py --plugin bws-cockpit` |',
  '',
  '## Next step',
  '- Write the README section.',
  '',
  '## Open items',
  'none',
].join('\n')

describe('pickup: pure parts', () => {
  const files = [
    { folder: 'runs/2026-10-25-handoff', mtime: 3 },
    { folder: 'runs/2026-10-27-mask', mtime: 9 },
    { folder: 'runs/2026-10-23-handoff', mtime: 5 },
  ]

  test('the newest by file time, or the named folder, exact before partial', () => {
    expect(pickHandoff(files, '')?.folder).toBe('runs/2026-10-27-mask')
    expect(pickHandoff(files, 'runs/2026-10-25-handoff')?.folder).toBe('runs/2026-10-25-handoff')
    expect(pickHandoff(files, '2026-10-25-handoff/HANDOFF.md')?.folder).toBe('runs/2026-10-25-handoff')
    expect(pickHandoff(files, 'C:/proj/runs/2026-10-23-handoff/')?.folder).toBe('runs/2026-10-23-handoff')
    expect(pickHandoff(files, 'handoff')?.folder).toBe('runs/2026-10-23-handoff') // the newer of two partial hits
    expect(pickHandoff(files, 'nope')).toBe(null)
    expect(pickHandoff([], '')).toBe(null)
  })

  test('the parser reads the title, finish line, claims table and next step', () => {
    expect(parseHandoff(HANDOFF)).toEqual({ title: 'band row', next: 'Write the README section.', done: 1, open: 2, claims: 2 })
    expect(parseHandoff('# Notes\r\n\r\n## Next step\r\n\r\nShip it.')).toEqual({ title: 'Notes', next: 'Ship it.', done: 0, open: 0, claims: 0 })
    expect(parseHandoff('')).toEqual({ title: '', next: '', done: 0, open: 0, claims: 0 })
  })

  test('the reply: emoji lines, claims or the fallback, and a stale warning', () => {
    const t = pickupText('runs/x', parseHandoff(HANDOFF), 2 * HOUR)
    expect(t).toContain('📥 Picking up runs/x/HANDOFF.md · written 2h ago')
    expect(t).toContain('🏷️ band row')
    expect(t).toContain('🏁 Finish line: ✅ 1 done · ⬜ 2 open')
    expect(t).toContain('🔍 Live state: 2 claims to re-check first')
    expect(t).toContain('➡️ Next: Write the README section.')
    expect(t).not.toContain('⚠️')
    const old = pickupText('runs/x', parseHandoff('# a'), STALE_MS + 1)
    expect(old).toContain('no claims table')
    expect(old).toContain('⚠️ Over 3 days old')
    expect(old).not.toContain('🏁')
    expect([ageText(0), ageText(5 * 60_000), ageText(47 * HOUR), ageText(72 * HOUR)]).toEqual(['just now', '5m ago', '47h ago', '3 days ago'])
  })

  test('the prompt reads the file and re-checks the live state first', () => {
    const p = pickupPrompt('runs/x')
    expect(p).toMatch(/^Pick up the handoff in runs\/x\/HANDOFF\.md\./)
    expect(p).toContain('re-check every row of its "Live state" table')
    expect(p).toContain('confirmed or stale')
    expect(p).toContain('never reinterpreted')
    expect(noHandoffText(' zz ')).toContain('matching "zz"')
    expect(noHandoffText('')).toContain('/handoff')
  })
})

type Dir = Record<string, { handoff?: string; mtime?: number }>

function world(on: On, dirs: Dir) {
  const clock = mock.clock(on, { now: NOW })
  const submitted: string[] = []
  const reads: string[] = []
  on('session.cwd', () => ({ value: CWD }))
  on('ui.toast', () => ({ value: undefined }))
  on('fs.list', ($, e) => {
    const p = norm(e.path)
    if (p === `${CWD}/runs`) return { value: Object.keys(dirs).map(name => ({ name, kind: 'dir', size: 0, mtimeMs: 0, isLink: false })) as never }
    const name = p.slice(`${CWD}/runs/`.length)
    const d = dirs[name]
    if (d === undefined) throw new Error(`ENOENT ${p}`)
    const files = [{ name: 'RUNLOG.md', kind: 'file', size: 1, mtimeMs: NOW, isLink: false }]
    if (d.handoff !== undefined) files.push({ name: 'HANDOFF.md', kind: 'file', size: 1, mtimeMs: d.mtime ?? NOW - HOUR, isLink: false })
    return { value: files as never }
  })
  on('fs.read', ($, e) => {
    const p = norm(e.path)
    reads.push(p)
    const m = /runs\/([^/]+)\/HANDOFF\.md$/.exec(p)
    const body = m ? dirs[m[1] ?? '']?.handoff : undefined
    if (body === undefined) throw new Error(`ENOENT ${p}`)
    return { value: body as never }
  })
  on('prompt.submit', ($, e) => {
    submitted.push(String((e as { text?: string }).text))
    return { text: '' } as never
  })
  return { submitted, reads, clock }
}

describe('/pickup', () => {
  test('picks the newest handoff, replies with what it holds, then queues the prompt', async ($, on) => {
    const w = world(on, {
      '2026-10-27-mask': { handoff: HANDOFF, mtime: NOW - 2 * HOUR },
      '2026-10-25-handoff': { handoff: '# Handoff: old', mtime: NOW - 50 * HOUR },
      '2026-10-28-pickup': {}, // no HANDOFF.md
    })
    const r = await $.command.run({ command: 'pickup', args: '' } as never)
    expect(r.text).toContain('📥 Picking up runs/2026-10-27-mask/HANDOFF.md · written 2h ago')
    expect(r.text).toContain('🔍 Live state: 2 claims to re-check first')
    expect(w.submitted).toEqual([]) // queued after the command answers, never from inside it
    await w.clock.advance(60)
    expect(w.submitted).toEqual([pickupPrompt('runs/2026-10-27-mask')])
  })

  test('a named run folder, and a stale one warns', async ($, on) => {
    const w = world(on, {
      '2026-10-27-mask': { handoff: HANDOFF, mtime: NOW - HOUR },
      '2026-10-20-old': { handoff: '# Handoff: old', mtime: NOW - 5 * 24 * HOUR },
    })
    const r = await $.command.run({ command: 'pickup', args: 'old' } as never)
    expect(r.text).toContain('runs/2026-10-20-old/HANDOFF.md · written 5 days ago')
    expect(r.text).toContain('⚠️ Over 3 days old')
    await w.clock.advance(60)
    expect(w.submitted).toEqual([pickupPrompt('runs/2026-10-20-old')])
  })

  test('none found: says so and submits nothing', async ($, on) => {
    const w = world(on, { '2026-10-28-pickup': {} })
    const r = await $.command.run({ command: 'pickup', args: '' } as never)
    expect(r.text).toBe(noHandoffText(''))
    const named = await $.command.run({ command: 'pickup', args: 'mask' } as never)
    expect(named.text).toContain('matching "mask"')
    await w.clock.advance(60)
    expect(w.submitted).toEqual([])
  })

  test('no runs folder at all', async ($, on) => {
    mock.clock(on, { now: NOW })
    on('session.cwd', () => ({ value: CWD }))
    on('fs.list', () => {
      throw new Error('ENOENT')
    })
    const r = await $.command.run({ command: 'pickup', args: '' } as never)
    expect(r.text).toBe(noHandoffText(''))
  })
})
