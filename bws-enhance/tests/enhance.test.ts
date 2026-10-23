import { test, expect, mock, describe } from 'claude-code/testing'
import { lastTab, mountTab, recordTabs } from './tabview'
import type { On } from 'claude-code'
import {
  cleanReply,
  commandsText,
  conversationText,
  instructionPaths,
  instructionsText,
  mcpServers,
  SYSTEM,
  targetNotes,
  userPrompt,
} from '../hooks/lib'

const ROOT = 'C:/proj'
const ENHANCED = 'Fix the login redirect loop in src/auth.ts.\n\nDone when\n- npm test passes.'

type World = {
  surfaces?: string[]
  box?: string
  // false: the engine keeps the keys with the prompt box (the person is typing there)
  grantsFocus?: boolean
  reply?: { isAnswered: true; text: string } | { isAnswered: false; reason: 'empty-reply' }
}

// Stubs every outside call the mod makes and records what reached the engine.
function world(on: On, w: World = {}) {
  const clock = mock.clock(on, { now: 1_000_000 })
  recordTabs(on)
  const seen = { asks: [] as { model: string; system: string; prompt: string }[], fills: [] as string[], sent: [] as { text: string; asUser?: boolean }[], opened: [] as { id: string; focus?: boolean; box: string }[], closed: [] as string[], toasts: [] as string[] }
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
  on('fs.list', ($, e) => {
    const path = String(e.path).replace(/\\/g, '/')
    const d =(name: string) => ({ name, kind: 'dir', size: 0, mtimeMs: 0, isLink: false })
    const f = (name: string) => ({ name, kind: 'file', size: 1, mtimeMs: 1, isLink: false })
    if (path === ROOT) return { value: [f('README.md'), d('src'), d('node_modules'), d('.git'), d('runs'), d('.claude-plugin')] as never }
    if (path === `${ROOT}/src`) return { value: [f('auth.ts'), d('deep')] as never }
    if (path === `${ROOT}/.claude-plugin`) return { value: [f('plugin.json'), d('types')] as never }
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
  // The panes this plugin opened: the dashboard holds the keys when it was opened with focus.
  const panes = new Map<string, boolean>()
  on('ui.panes', () => ({ value: [...panes].map(([id, isFocused]) => ({ id, title: 'Dashboard', isShown: true, isFocused, isPlaced: true })) as never }))
  on('ui.open', ($, e) => {
    panes.set(e.id, (w.grantsFocus !== false && e.focus === true) || (panes.get(e.id) ?? false))
    // The engine grants focus only over an empty composer: record what the box held at the open.
    seen.opened.push({ id: e.id, focus: e.focus, box })
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

  test('the rewriter asks for the goal and finish line, and leaves the method to Claude', () => {
    expect(SYSTEM).toMatch(/goal-and-outcome prompt/)
    expect(SYSTEM).toMatch(/Leave the method to Claude/)
    expect(SYSTEM).toMatch(/check Claude can run/)
    expect(SYSTEM).toMatch(/No Steps section/)
    expect(SYSTEM).toMatch(/open with the end state/)
    expect(SYSTEM).toMatch(/cut every sentence that tells Claude how/)
    expect(SYSTEM).toMatch(/Always end with a Done when/)
    expect(SYSTEM).toMatch(/Do not sequence the work/)
    expect(SYSTEM).toMatch(/say when to stop and report/)
    expect(SYSTEM).toMatch(/only when it is in the lists you were given/)
    expect(SYSTEM).not.toMatch(/Steps or Scope/)
  })

  test('per-model notes follow the target family', () => {
    expect(targetNotes('claude-opus-5-5')).toMatch(/over-engineer/)
    expect(targetNotes('claude-sonnet-5-5')).toMatch(/keep working until/)
    expect(targetNotes('claude-haiku-5-5')).toMatch(/run the named check/)
    expect(targetNotes('something-else')).toBe('No model-specific notes.')
    const p = userPrompt({ rough: 'fix it', target: 'claude-opus-5-5', root: 'C:/proj', tree: 'a/', instructions: '', commands: '', servers: [], conversation: '' })
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
    expect(ask?.model).toBe('haiku')
    expect(ask?.system).toMatch(/Anthropic|check Claude can run/)
    expect(ask?.prompt).toContain('Run npm test before ending a turn.')
    expect(ask?.prompt).toContain('Terse replies.')
    expect(ask?.prompt).toContain('/interview — Interview the user to scope a task')
    expect(ask?.prompt).not.toContain('/enhance')
    expect(ask?.prompt).toContain('<mcp_servers>figma</mcp_servers>')
    expect(ask?.prompt).toContain('user: the login page loops forever')
    expect(ask?.prompt).toMatch(/<target_model name="claude-sonnet-5-5">Sonnet/)
    expect(ask?.prompt).toContain('<project_tree depth="2">\n.claude-plugin/\n  plugin.json\nsrc/\n  deep/\n  auth.ts\nREADME.md\n</project_tree>')
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

  test('in the dashboard: /enhance asks bws-cockpit to open it with the keys; the rewrite waits in the tab and Send sends it', async ($, on) => {
    const { seen, clock } = world(on)
    const r = await $.command.run({ command: 'enhance', args: 'fix the login thing' } as never)
    expect(r.text).toBeUndefined()
    expect(lastTab()?.open).toBe(1) // cockpit opens it, inside this command: the person's open, and its own pane
    expect(seen.opened).toEqual([]) // the mod opens nothing itself
    await clock.advance(50)
    expect(seen.fills).toEqual([]) // filling the box would hand it the keys
    const tab = await mountTab($ as never)
    expect(await tab.find({ type: 'Text', text: /^✦ Enhanced prompt ready:$/ })).toBeDefined()
    expect(await tab.find({ type: 'Text', text: ENHANCED })).toBeDefined()
    expect(await tab.find({ key: 'put' })).toBeDefined()
    await tab.press({ key: 'send' })
    await clock.advance(50)
    expect(seen.sent).toEqual([{ text: ENHANCED, asUser: true }])
    expect(await (await mountTab($ as never)).find({ type: 'Text', text: /Nothing to enhance/ })).toBeDefined()
  })

  test('keys with the box (the chord over a draft): the rewrite fills it; Send submits the box as edited', async ($, on) => {
    const { seen, clock, setBox } = world(on, { box: 'fix the login thing' })
    const chord = await $.ui.mount({ plugin: 'bws-enhance', surface: 'terminal', component: 'SessionMode', props: { modes: [] } })
    await chord.press({ key: 'enhance' })
    await chord.unmount()
    await clock.advance(50)
    expect(seen.fills).toEqual([ENHANCED])
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await mountTab($ as never)
      expect(await ui.find({ type: 'Text', text: /in the box/ })).toBeDefined()
      expect(await ui.find({ key: 'send' })).toBeDefined()
      expect(await ui.find({ key: 'revert' })).toBeDefined()
      await ui.unmount()
      void surface
    }
    setBox(`${ENHANCED}\nAlso keep the session cookie.`) // edited in the box
    const ui = await mountTab($ as never)
    await ui.press({ key: 'send' })
    await ui.unmount()
    await clock.advance(50)
    expect(seen.sent).toEqual([{ text: `${ENHANCED}\nAlso keep the session cookie.`, asUser: true }])
    expect(seen.fills.at(-1)).toBe('')
    expect(await (await mountTab($ as never)).find({ type: 'Text', text: /Nothing to enhance/ })).toBeDefined()
  })

  test('/enhance asks for the keys even while its own text is still in the box (the engine clears it after the hook)', async ($, on) => {
    world(on, { box: '/enhance fix the login thing' })
    await $.command.run({ command: 'enhance', args: 'fix the login thing' } as never)
    expect(lastTab()?.open).toBe(1)
  })

  test('the chord over a draft leaves the keys with the person', async ($, on) => {
    const { seen } = world(on, { box: 'make the band nicer' })
    const ui = await $.ui.mount({ plugin: 'bws-enhance', surface: 'terminal', component: 'SessionMode', props: { modes: [] } })
    await ui.press({ key: 'enhance' })
    await ui.unmount()
    expect(seen.opened[0]?.focus).toBeUndefined()
  })

  test('Revert puts the rough prompt back', async ($, on) => {
    const { seen, clock } = world(on, { box: 'fix the login thing' })
    const chord = await $.ui.mount({ plugin: 'bws-enhance', surface: 'terminal', component: 'SessionMode', props: { modes: [] } })
    await chord.press({ key: 'enhance' })
    await chord.unmount()
    await clock.advance(50)
    const ui = await mountTab($ as never)
    await ui.press({ key: 'revert' })
    await ui.unmount()
    expect(seen.fills.at(-1)).toBe('fix the login thing')
    expect(seen.sent).toEqual([])
  })

  test('text typed while waiting is kept; Put in box offers the rewrite', async ($, on) => {
    const { seen, clock, setBox } = world(on, { box: 'fix the login thing' })
    const chord = await $.ui.mount({ plugin: 'bws-enhance', surface: 'terminal', component: 'SessionMode', props: { modes: [] } })
    await chord.press({ key: 'enhance' })
    await chord.unmount()
    setBox('something else')
    await clock.advance(50)
    expect(seen.fills).toEqual([])
    const ui = await mountTab($ as never)
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
    const ui = await mountTab($ as never)
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
    // The draft is the person's, so the keys stay with the box and the rewrite replaces the draft there.
    expect(seen.fills).toEqual([ENHANCED])
    expect(seen.opened.every(o => o.focus === undefined)).toBe(true)
  })

  test('footer is shared: a footer drawn by another mod stays beside the enhance button, and the mode labels are not drawn twice', async ($, on) => {
    world(on)
    on('ui.render', () => ({ type: 'Text', props: {}, children: ['other mod footer'] }) as never)
    const ui = await $.ui.mount({ plugin: 'bws-enhance', surface: 'terminal', component: 'SessionMode', props: { modes: ['focus'] } })
    expect(await ui.find({ type: 'Text', text: 'other mod footer' })).toBeDefined()
    expect(await ui.find({ key: 'enhance' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^focus$/ })).toBeUndefined() // whoever drew last-below already carries the labels
    await ui.unmount()
  })

  test('footer: when the engine draws its own below, the mode labels and the button are drawn here', async ($, on) => {
    world(on)
    on('ui.render', () => ({ type: 'engine', ref: 0 }) as never)
    const ui = await $.ui.mount({ plugin: 'bws-enhance', surface: 'terminal', component: 'SessionMode', props: { modes: ['focus', 'plan'] } })
    expect(await ui.find({ type: 'Text', text: 'focus & plan' })).toBeDefined()
    expect(await ui.find({ key: 'enhance' })).toBeDefined()
    await ui.unmount()
  })

  test('footer on desktop: the button is drawn and a click enhances the draft', async ($, on) => {
    const { seen, clock } = world(on, { box: 'make the band nicer' })
    const ui = await $.ui.mount({ plugin: 'bws-enhance', surface: 'desktop', component: 'SessionMode', props: { modes: [] } })
    expect(await ui.find({ key: 'enhance' })).toBeDefined()
    await ui.press({ key: 'enhance' })
    await ui.unmount()
    await clock.advance(50)
    expect(seen.fills).toEqual([ENHANCED])
  })

  test('idle tab: Enhance draft enhances the draft in the box', async ($, on) => {
    const { seen, clock } = world(on, { box: 'make the band nicer' })
    await $.command.run({ command: 'enhance', args: '--dismiss' } as never)
    const tab = await mountTab($ as never)
    expect(await tab.find({ type: 'Text', text: /Nothing to enhance/ })).toBeDefined()
    expect(await tab.find({ key: 'draft' })).toBeDefined()
    await tab.press({ key: 'draft' })
    await clock.advance(50)
    expect(seen.asks[0]?.prompt).toMatch(/<rough_request>\nmake the band nicer\n/)
    expect(seen.fills).toEqual([ENHANCED])
  })

  test('idle tab: Enhance draft over an empty box only toasts', async ($, on) => {
    const { seen } = world(on)
    await $.command.run({ command: 'enhance', args: '--draft' } as never)
    expect(seen.asks).toEqual([])
    expect(seen.toasts.length).toBe(1)
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
