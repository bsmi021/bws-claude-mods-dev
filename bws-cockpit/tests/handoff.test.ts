import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { handoffPrompt, pinnedModel, startPrompt } from '../hooks/handoff'

const CWD = 'C:/proj'
const STARTED = 1_000_000
const NOW = Date.parse('2026-10-02T14:30:00')
const norm = (p: unknown) => String(p).split(String.fromCharCode(92)).join('/')

const HANDOFF = '# Handoff: band row\n\n## Objective\nAdd the band row.\n\n## Next step\nWrite the README section.'

type World = {
  runTouched?: boolean // a run folder written this session
  existing?: string // a HANDOFF.md already there
  fork?: { isAnswered: true; text: string } | { isAnswered: false; reason: string }
  surfaces?: string[]
}

function world(on: On, w: World) {
  mock.clock(on, { now: NOW })
  const writes: Record<string, string> = {}
  const prompts: string[] = []
  const copies: string[] = []
  const run = `${CWD}/runs/2026-10-02-band-row`
  const files: Record<string, string> = { [`${run}/PLAN.md`]: '## Tasks\n- [ ] a\n' }
  if (w.existing !== undefined) files[`${run}/HANDOFF.md`] = w.existing
  on('session.cwd', () => ({ value: CWD }))
  on('session.surfaces', () => ({ value: (w.surfaces ?? ['terminal']) as never }))
  on('session.usage', () => ({ value: { startedAt: STARTED, context: {}, rateLimits: [], cost: {} } as never }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.copy', ($, e) => {
    copies.push(String((e as { text?: string }).text))
    return { value: { isCopied: true } as never }
  })
  on('fs.list', ($, e) => {
    const p = norm(e.path)
    if (p === `${CWD}/runs`) return { value: [{ name: '2026-10-02-band-row', kind: 'dir', size: 0, mtimeMs: 0, isLink: false }] }
    if (p === run) return { value: [{ name: 'PLAN.md', kind: 'file', size: 1, mtimeMs: w.runTouched === false ? STARTED - 1 : STARTED + 10, isLink: false }] }
    throw new Error(`ENOENT ${p}`)
  })
  on('fs.read', ($, e) => {
    const hit = files[norm(e.path)]
    if (hit === undefined) throw new Error(`ENOENT ${e.path}`)
    return { value: hit as never }
  })
  on('fs.write', ($, e) => {
    writes[norm(e.path)] = String(e.text)
    return { value: undefined }
  })
  on('model.fork', ($, e) => {
    prompts.push(String((e as { prompt?: string }).prompt))
    const f = w.fork ?? { isAnswered: true, text: HANDOFF }
    return { value: { ...f, usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } as never }
  })
  return { writes, prompts, copies, run }
}

describe('handoff text', () => {
  test('the prompt names the file, the sections and the focus', () => {
    const p = handoffPrompt('runs/x', 'the M2 milestone')
    expect(p).toContain('saved as runs/x/HANDOFF.md')
    expect(p).toContain('Focus the handoff on: the M2 milestone.')
    expect(p).toContain('## Next step')
    expect(p).toContain('Do not invent anything')
    expect(handoffPrompt('runs/x', '')).not.toContain('Focus')
    expect(startPrompt('runs/x')).toMatch(/^Read runs\/x\/HANDOFF\.md first/)
  })
})

describe('/handoff', () => {
  test('writes HANDOFF.md in the session run folder and copies the start prompt', async ($, on) => {
    const w = world(on, {})
    const r = await $.command.run({ command: 'handoff', args: '' } as never)
    expect(w.writes[`${w.run}/HANDOFF.md`]).toBe(`${HANDOFF}\n`)
    expect(w.copies).toEqual([startPrompt('runs/2026-10-02-band-row')])
    expect(r.text).toContain('Handoff written: runs/2026-10-02-band-row/HANDOFF.md (')
    expect(r.text).toContain('(copied to the clipboard)')
    expect(w.prompts[0]).toContain('saved as runs/2026-10-02-band-row/HANDOFF.md')
  })

  test('an existing HANDOFF.md is kept under a timestamped name', async ($, on) => {
    const w = world(on, { existing: '# old handoff' })
    const r = await $.command.run({ command: 'handoff', args: '' } as never)
    const kept = Object.keys(w.writes).find(k => /HANDOFF\.\d{8}-\d{4}\.md$/.test(k))
    expect(kept).toBeDefined()
    expect(w.writes[kept ?? '']).toBe('# old handoff')
    expect(w.writes[`${w.run}/HANDOFF.md`]).toBe(`${HANDOFF}\n`)
    expect(r.text).toMatch(/the previous one is kept as runs\/2026-10-02-band-row\/HANDOFF\.\d{8}-\d{4}\.md/)
  })

  test('the focus text reaches the prompt', async ($, on) => {
    const w = world(on, {})
    await $.command.run({ command: 'handoff', args: '  the README  ' } as never)
    expect(w.prompts[0]).toContain('Focus the handoff on: the README.')
  })

  test('no run folder written this session: a new dated handoff folder', async ($, on) => {
    const w = world(on, { runTouched: false })
    const r = await $.command.run({ command: 'handoff', args: '' } as never)
    expect(Object.keys(w.writes)).toEqual([`${CWD}/runs/2026-10-02-handoff/HANDOFF.md`])
    expect(r.text).toContain('runs/2026-10-02-handoff/HANDOFF.md')
  })

  test('headless: no clipboard, the start prompt is in the reply', async ($, on) => {
    const w = world(on, { surfaces: [] })
    const r = await $.command.run({ command: 'handoff', args: '' } as never)
    expect(w.copies).toEqual([])
    expect(r.text).not.toContain('copied')
    expect(r.text).toContain(startPrompt('runs/2026-10-02-band-row'))
  })

  test('a resumed session (nothing to fork) builds the handoff from the transcript rows', async ($, on) => {
    const w = world(on, { fork: { isAnswered: false, reason: 'nothing-to-fork' } })
    const asked: { model: string; prompt: string }[] = []
    on('session.messages', () => ({
      value: [
        { role: 'user', text: 'Add the band row.', toolUses: [] },
        { role: 'assistant', text: 'Parser written.', toolUses: [{ tool_use_id: 'x', tool: 'Write', input: { file_path: 'a.ts' }, text: 'ok' }] },
      ] as never,
    }))
    on('session.model', () => ({ value: 'claude-opus-5-5' as never }))
    on('model.complete', ($, e) => {
      asked.push({ model: String(e.model), prompt: String(e.prompt) })
      return { value: { isAnswered: true, text: HANDOFF, usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } as never }
    })
    const r = await $.command.run({ command: 'handoff', args: '' } as never)
    expect(asked[0]?.model).toBe('claude-opus-5-5')
    expect(asked[0]?.prompt).toContain('USER: Add the band row.')
    expect(asked[0]?.prompt).toContain('[Write {"file_path":"a.ts"}] -> ok')
    expect(asked[0]?.prompt).toContain('## Next step')
    expect(w.writes[`${w.run}/HANDOFF.md`]).toBe(`${HANDOFF}\n`)
    expect(r.text).toContain('Handoff written')
  })

  test('nothing to fork and no messages: no file, a clear reply', async ($, on) => {
    const w = world(on, { fork: { isAnswered: false, reason: 'nothing-to-fork' } })
    on('session.messages', () => ({ value: [] as never }))
    const r = await $.command.run({ command: 'handoff', args: '' } as never)
    expect(r.text).toMatch(/No handoff written: there is nothing to hand off yet/)
    expect(Object.keys(w.writes)).toEqual([])
  })

  test('an API error writes nothing', async ($, on) => {
    const w = world(on, { fork: { isAnswered: false, reason: 'api-error' } })
    const r = await $.command.run({ command: 'handoff', args: '' } as never)
    expect(r.text).toBe('No handoff written: the model call failed (api-error).')
    expect(Object.keys(w.writes)).toEqual([])
  })
})

// ---------- worker model pin ----------

const spawn = (over: Record<string, unknown>) =>
  ({
    tool_use_id: 't1',
    prompt: 'write the parser',
    description: 'parser',
    subagentType: 'general-purpose',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-opus-5-5',
    background: false,
    fork: false,
    ...over,
  }) as never

function spawns(on: On) {
  const seen: (string | undefined)[] = []
  on('ui.toast', () => ({ value: undefined }))
  on('agent.spawn', ($, e) => {
    seen.push(e.model)
    return { model: e.model ?? e.parentModel }
  })
  return seen
}

describe('worker model pin', () => {
  test('pinnedModel rules', () => {
    const cfg = { model: 'claude-sonnet-5-5', types: ['general-purpose', 'claude'] }
    expect(pinnedModel({ subagentType: 'general-purpose', fork: false }, cfg)).toBe('claude-sonnet-5-5')
    expect(pinnedModel({ subagentType: 'General-Purpose', model: 'inherit', fork: false }, cfg)).toBe('claude-sonnet-5-5')
    expect(pinnedModel({ subagentType: 'general-purpose', model: 'opus', fork: false }, cfg)).toBeUndefined()
    expect(pinnedModel({ subagentType: 'fork', fork: true }, cfg)).toBeUndefined()
    expect(pinnedModel({ subagentType: 'Explore', fork: false }, cfg)).toBeUndefined()
    expect(pinnedModel({ subagentType: 'general-purpose', fork: false }, { model: '', types: cfg.types })).toBeUndefined()
  })

  test('a general-purpose spawn with no model runs on the worker model', { options: { workerModel: 'claude-sonnet-5-5' } }, async ($, on) => {
    const seen = spawns(on)
    const r = await $.agent.spawn(spawn({}))
    expect(seen).toEqual(['claude-sonnet-5-5'])
    expect(r.model).toBe('claude-sonnet-5-5')
  })

  test('an explicit model, a fork and an Explore spawn are left alone', { options: { workerModel: 'claude-sonnet-5-5' } }, async ($, on) => {
    const seen = spawns(on)
    await $.agent.spawn(spawn({ model: 'opus' }))
    await $.agent.spawn(spawn({ subagentType: 'fork', fork: true }))
    await $.agent.spawn(spawn({ subagentType: 'Explore' }))
    expect(seen).toEqual(['opus', undefined, undefined])
  })

  test('off by default: no model is set', async ($, on) => {
    const seen = spawns(on)
    await $.agent.spawn(spawn({}))
    expect(seen).toEqual([undefined])
  })

  test('workerAgentTypes widens the pin', { options: { workerModel: 'haiku', workerAgentTypes: 'general-purpose, Explore' } }, async ($, on) => {
    const seen = spawns(on)
    await $.agent.spawn(spawn({ subagentType: 'Explore' }))
    expect(seen).toEqual(['haiku'])
  })
})
