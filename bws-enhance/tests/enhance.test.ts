import { test, expect, mock, describe } from 'claude-code/testing'
import type { On } from 'claude-code'
import {
  cleanReply,
  commandsText,
  conversationText,
  instructionPaths,
  instructionsText,
  mcpServers,
  targetNotes,
  userPrompt,
} from '../hooks/lib'

const ROOT = 'C:/proj'
const ENHANCED = 'Fix the login redirect loop in src/auth.ts.\n\nDone when\n- npm test passes.'

type World = {
  surfaces?: string[]
  box?: string
  reply?: { isAnswered: true; text: string } | { isAnswered: false; reason: 'empty-reply' }
}

// Stubs every outside call the mod makes and records what reached the engine.
function world(on: On, w: World = {}) {
  const clock = mock.clock(on, { now: 1_000_000 })
  const seen = { asks: [] as { model: string; system: string; prompt: string }[], fills: [] as string[], sent: [] as { text: string; asUser?: boolean }[], opened: [] as { id: string; focus?: boolean }[], closed: [] as string[], toasts: [] as string[] }
  let box = w.box ?? ''
  on('session.surfaces', () => ({ value: (w.surfaces ?? ['terminal']) as never }))
  on('session.root', () => ({ value: ROOT }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('session.usage', () => ({ value: { context: { breakdown: { memoryFiles: [{ path: 'C:\\Users\\me\\.claude\\CLAUDE.md', type: 'User', tokens: 10 }] } } } as never }))
  on('fs.read', ($, e) => {
    const path = String(e.path).replace(/\\/g, '/')
    if (path === 'C:/Users/me/.claude/CLAUDE.md') return { value: 'Terse replies.' as never }
    if (path === `${ROOT}/AGENTS.md`) return { value: 'Run npm test before ending a turn.' as never }
    throw new Error(`ENOENT ${path}`)
  })
  on('command.list', () => ({
    value: [
      { name: 'clear', description: 'Clear the conversation', source: 'builtin' },
      { name: 'interview', description: 'Interview the user to scope a task', source: 'user' },
      { name: 'enhance', description: 'this mod', source: 'plugin' },
    ] as never,
  }))
  on('tool.list', () => ({ value: [{ name: 'Bash', description: '', mcp: false }, { name: 'mcp__figma__get_screenshot', description: '', mcp: true }] as never }))
  on('session.messages', () => ({ value: [{ role: 'user', text: 'the login page loops forever', toolUses: [] }] as never }))
  on('model.complete', ($, e) => {
    const req = e as unknown as { model: string; system: string; prompt: string }
    seen.asks.push(req)
    return { value: (w.reply ?? { isAnswered: true, text: ENHANCED, usage: {} }) as never }
  })
  on('prompt.read', () => ({ value: { text: box, cursor: box.length } }))
  on('prompt.fill', ($, e) => {
    box = e.text
    seen.fills.push(e.text)
    return { isFilled: true }
  })
  on('prompt.submit', ($, e) => {
    seen.sent.push({ text: e.text, asUser: (e.origin as { asUser?: boolean } | undefined)?.asUser })
    return { text: e.text } as never
  })
  on('ui.open', ($, e) => {
    seen.opened.push({ id: e.id, focus: e.focus })
    return { value: { isPlaced: true } }
  })
  on('ui.close', ($, e) => {
    seen.closed.push(e.id)
    return { value: undefined } as never
  })
  on('ui.toast', ($, e) => {
    seen.toasts.push(String((e as unknown as { text: string }).text ?? e))
    return { value: undefined as never }
  })
  return { seen, clock, setBox: (t: string) => (box = t) }
}

const PANE = {
  plugin: 'bws-enhance',
  component: 'Pane',
  requestId: 'bws-enhance',
  props: { title: 'Enhance', isFocused: false, bodyColumns: 80, placement: 'inline', scroll: { offset: 0, bodyRows: 8 }, view: {} },
} as const

describe('lib', () => {
  test('instruction paths: loaded first, project files added once, case-insensitive', () => {
    expect(instructionPaths(['C:\\proj\\AGENTS.md', 'C:/Users/me/.claude/CLAUDE.md'], 'C:\\proj\\')).toEqual([
      'C:/proj/AGENTS.md',
      'C:/Users/me/.claude/CLAUDE.md',
      'C:/proj/CLAUDE.md',
      'C:/proj/.claude/CLAUDE.md',
    ])
  })

  test('instruction text is capped per file and overall', () => {
    const t = instructionsText([{ path: 'a', text: 'x'.repeat(100) }, { path: 'b', text: 'y'.repeat(100) }, { path: 'c', text: '' }], 50, 300)
    expect(t).toContain('<file path="a">')
    expect(t).toContain(`${'x'.repeat(49)}…`)
    expect(t).not.toContain('path="c"')
    expect(instructionsText([])).toBe('(none found)')
  })

  test('commands: user and plugin first, built-ins last, own command left out', () => {
    const t = commandsText(
      [
        { name: 'clear', description: 'Clear', source: 'builtin' },
        { name: 'interview', description: 'Interview\n the user', source: 'user' },
        { name: 'enhance', description: 'self', source: 'plugin' },
      ],
      'enhance',
    )
    expect(t).toBe('/interview — Interview the user\n/clear — Clear')
  })

  test('mcp server names, conversation tail, reply cleanup', () => {
    expect(mcpServers(['Bash', 'mcp__figma__a', 'mcp__figma__b', 'mcp__claude-in-chrome__nav'])).toEqual(['claude-in-chrome', 'figma'])
    expect(conversationText([])).toMatch(/nothing said yet/)
    expect(conversationText([{ role: 'user', text: 'a\n b' }, { role: 'assistant', text: '' }])).toBe('user: a b')
    expect(cleanReply('```markdown\nDo the thing.\n```')).toBe('Do the thing.')
    expect(cleanReply("Here's the enhanced prompt:\nDo the thing.")).toBe('Do the thing.')
    expect(cleanReply('"Do it."')).toBe('Do it.')
  })

  test('per-model notes follow the target family', () => {
    expect(targetNotes('claude-opus-5-5')).toMatch(/over-engineer/)
    expect(targetNotes('claude-sonnet-5-5')).toMatch(/keep working until/)
    expect(targetNotes('claude-haiku-5-5')).toMatch(/run the named check/)
    expect(targetNotes('something-else')).toBe('No model-specific notes.')
    const p = userPrompt({ rough: 'fix it', target: 'claude-opus-5-5', root: 'C:/proj', instructions: '', commands: '', servers: [], conversation: '' })
    expect(p).toMatch(/<target_model name="claude-opus-5-5">Opus/)
    expect(p.indexOf('<rough_request>')).toBeGreaterThan(p.indexOf('<instruction_files>'))
  })
})

describe('mod', () => {
  test('headless: /enhance answers with the rewrite, grounded in instructions, skills and the model', async ($, on) => {
    const { seen } = world(on, { surfaces: [] })
    const r = await $.command.run({ command: 'enhance', args: 'fix the login thing' } as never)
    expect(r.text).toBe(ENHANCED)
    const ask = seen.asks[0]
    expect(ask?.model).toBe('sonnet')
    expect(ask?.system).toMatch(/Anthropic|check Claude can run/)
    expect(ask?.prompt).toContain('Run npm test before ending a turn.')
    expect(ask?.prompt).toContain('Terse replies.')
    expect(ask?.prompt).toContain('/interview — Interview the user to scope a task')
    expect(ask?.prompt).not.toContain('/enhance')
    expect(ask?.prompt).toContain('<mcp_servers>figma</mcp_servers>')
    expect(ask?.prompt).toContain('user: the login page loops forever')
    expect(ask?.prompt).toMatch(/<target_model name="claude-sonnet-5-5">Sonnet/)
    expect(ask?.prompt).toMatch(/<rough_request>\nfix the login thing\n<\/rough_request>/)
    expect(seen.fills).toEqual([])
  })

  test('the model option picks the enhancer model', { options: { model: 'opus' } }, async ($, on) => {
    const { seen } = world(on, { surfaces: [] })
    await $.command.run({ command: 'enhance', args: 'x' } as never)
    expect(seen.asks[0]?.model).toBe('opus')
  })

  test('no argument: usage, no model call', async ($, on) => {
    const { seen } = world(on)
    const r = await $.command.run({ command: 'enhance', args: '  ' } as never)
    expect(r.text).toMatch(/^Usage: \/enhance/)
    expect(seen.asks).toEqual([])
  })

  test('interactive: fills the box, opens the pane once, Send submits the box as the user', async ($, on) => {
    const { seen, clock, setBox } = world(on)
    const r = await $.command.run({ command: 'enhance', args: 'fix the login thing' } as never)
    expect(r.text).toBeUndefined()
    expect(seen.opened[0]).toEqual({ id: 'bws-enhance', focus: undefined })
    await clock.advance(50)
    expect(seen.fills).toEqual([ENHANCED])
    expect(seen.opened.length).toBe(1)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...PANE, surface })
      expect(await ui.find({ type: 'Text', text: /in the box/ })).toBeDefined()
      expect(await ui.find({ key: 'send' })).toBeDefined()
      expect(await ui.find({ key: 'revert' })).toBeDefined()
      await ui.unmount()
    }
    setBox(`${ENHANCED}\nAlso keep the session cookie.`) // edited in the box
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'send' })
    await ui.unmount()
    await clock.advance(50)
    expect(seen.sent).toEqual([{ text: `${ENHANCED}\nAlso keep the session cookie.`, asUser: true }])
    expect(seen.fills.at(-1)).toBe('')
    expect(seen.closed).toContain('bws-enhance')
  })

  test('Revert puts the rough prompt back', async ($, on) => {
    const { seen, clock } = world(on)
    await $.command.run({ command: 'enhance', args: 'fix the login thing' } as never)
    await clock.advance(50)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await ui.press({ key: 'revert' })
    await ui.unmount()
    expect(seen.fills.at(-1)).toBe('fix the login thing')
    expect(seen.sent).toEqual([])
  })

  test('text typed while waiting is kept; Put in box offers the rewrite', async ($, on) => {
    const { seen, clock, setBox } = world(on)
    await $.command.run({ command: 'enhance', args: 'fix the login thing' } as never)
    setBox('something else')
    await clock.advance(50)
    expect(seen.fills).toEqual([])
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /left alone/ })).toBeDefined()
    await ui.press({ key: 'put' })
    await ui.unmount()
    expect(seen.fills).toEqual([ENHANCED])
  })

  test('a failed model call shows the reason and fills nothing', async ($, on) => {
    const { seen, clock } = world(on, { reply: { isAnswered: false, reason: 'empty-reply' } })
    await $.command.run({ command: 'enhance', args: 'fix it' } as never)
    await clock.advance(50)
    expect(seen.fills).toEqual([])
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /Enhance failed: empty-reply/ })).toBeDefined()
    await ui.unmount()
  })

  test('footer button: the chord enhances the draft in the box and replaces it', async ($, on) => {
    const { seen, clock } = world(on, { box: 'make the band nicer' })
    const ui = await $.ui.mount({ plugin: 'bws-enhance', surface: 'terminal', component: 'SessionMode', props: { modes: ['focus'] } })
    expect(await ui.find({ type: 'Text', text: /^focus$/ })).toBeDefined()
    await ui.press({ key: 'enhance' })
    await ui.unmount()
    await clock.advance(50)
    expect(seen.asks[0]?.prompt).toMatch(/<rough_request>\nmake the band nicer\n/)
    expect(seen.fills).toEqual([ENHANCED])
  })

  test('footer button with an empty box only toasts', async ($, on) => {
    const { seen } = world(on)
    const ui = await $.ui.mount({ plugin: 'bws-enhance', surface: 'terminal', component: 'SessionMode', props: { modes: [] } })
    await ui.press({ key: 'enhance' })
    await ui.unmount()
    expect(seen.asks).toEqual([])
    expect(seen.toasts.length).toBe(1)
  })

  test('chordAction empty: the footer is left to the engine', { options: { chordAction: '' } }, async ($, on) => {
    world(on)
    on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine footer'] }) as never)
    const ui = await $.ui.mount({ plugin: 'bws-enhance', surface: 'terminal', component: 'SessionMode', props: { modes: [] } })
    expect(await ui.find({ key: 'enhance' })).toBeUndefined()
    await ui.unmount()
  })

  test('prompts the person sends themselves pass through untouched', async ($, on) => {
    const { seen } = world(on)
    const r = await $.prompt.submit({ text: 'hello' } as never)
    expect(r).toMatchObject({ text: 'hello' })
    expect(seen.asks).toEqual([])
  })
})
