// bws-enhance: rewrites a rough prompt into a specific one, grounded in this session's instructions and skills,
// puts it in the prompt box, and shows Send / Revert in its bws-cockpit dashboard tab.
// Triggers: /enhance <rough prompt>, or the chord bound to the footer button's action on the draft in the box.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, PromptSubmitInput, Register } from 'claude-code'
import type { Setting, View } from '../types'
import { bound, classifyGate } from './kit/classify-fork'
import type { KitModel } from './kit/classify-fork'
import { DASHBOARD, parseEvent } from './kit/tab'
import { actionOf, enhanceTab, type Action } from './tab'
import {
  BOUNCE_TIMEOUT_MS,
  bounceSummary,
  failLine,
  glossaryText,
  MODE_NOTE,
  parseMode,
  reasonPrompt,
  reasonText,
  REASON_SYSTEM,
  resolvePath,
  skipReason,
  statusText,
  vagueQuestion,
  type BounceMode,
} from './bounce'
import {
  cleanReply,
  commandsText,
  conversationText,
  instructionPaths,
  instructionsText,
  mcpServers,
  SYSTEM,
  TREE_DEPTH,
  TREE_ENTRIES,
  treeEntries,
  treeLine,
  userPrompt,
  type Doc,
} from './lib'

const COMMAND = 'enhance'
const BOUNCE = 'bounce'
// A ready rewrite kept in the tab because the person was there (View.note).
const IN_TAB = 'in-tab'
const IDLE: View = { phase: 'idle', original: '', enhanced: '', isFilled: false, note: '' }
const view = atom({ plugin: 'bws-enhance', key: 'view' } as const, IDLE)
// What /bounce set for this session: mode null leaves the bounce option in charge; warned is the text held once in warn mode.
const setting = atom({ plugin: 'bws-enhance', key: 'setting' } as const, { mode: null, warned: null } as Setting)
const summary = atom({ plugin: 'bws-enhance', key: 'summary' } as const, null)
// The Enhance tab bws-cockpit draws in its dashboard (bws-kit/tab.ts).
const tab = atom({ plugin: 'bws-enhance', key: 'tab' } as const, null as unknown)
// Counts up when the tab must be shown: an enhance started or done, a prompt held. `openCount` instead asks bws-cockpit
// to open the dashboard with the keys (from the person's command), so the dashboard is cockpit's and it can move the ring.
let showCount = 0
let openCount = 0
// This run asked for the keys at its start (the person is in the dashboard): its rewrite waits in the tab.
let isKeysAsked = false
// bws-better's switch, read-only: while its automatic mode is on it takes the typed prompt, so the bouncer stands aside.
const betterAuto = atom({ plugin: 'bws-better', key: 'auto' } as const, false)
// The options, copied in by register on every load.
let bounceOption: BounceMode = 'off'
let bounceModel = 'haiku'
let glossaryOption = ''

type Outcome = { ok: true; text: string } | { ok: false; note: string }

// The project map, depth-first, through $.fs.list: TREE_DEPTH levels, at most TREE_ENTRIES lines.
async function walkTree($: EngineInterface, root: string, rel: string, depth: number, lines: string[]) {
  let entries: { name: string; kind: string }[] = []
  try {
    entries = await $.fs.list(`${root}${rel}`)
  } catch {
    return
  }
  for (const e of treeEntries(entries, rel)) {
    if (lines.length >= TREE_ENTRIES) return
    lines.push(treeLine(e, depth))
    if (e.kind === 'dir' && depth + 1 < TREE_DEPTH) await walkTree($, root, `${rel}/${e.name}`, depth + 1, lines)
  }
}

// Everything the rewrite is grounded in. Each source is optional: a failed read leaves that part empty.
async function gather($: EngineInterface, rough: string) {
  const root = await $.session.root()
  const lines: string[] = []
  await walkTree($, root.replace(/[\\/]+$/, ''), '', 0, lines)
  const tree = lines.length === 0 ? '(unavailable)' : lines.length >= TREE_ENTRIES ? `${lines.join('\n')}\n… (cut at ${TREE_ENTRIES} entries)` : lines.join('\n')
  let target = 'unknown'
  try {
    target = await $.session.model()
  } catch {}
  let loaded: string[] = []
  try {
    const usage = await $.session.usage({ breakdown: 'summary' })
    loaded = (usage.context.breakdown?.memoryFiles ?? []).map(f => f.path)
  } catch {}
  const docs: Doc[] = []
  for (const path of instructionPaths(loaded, root)) {
    try {
      docs.push({ path, text: String(await $.fs.read(path)) })
    } catch {}
  }
  let commands = '(unknown)'
  try {
    commands = commandsText(await $.command.list(), COMMAND)
  } catch {}
  let servers: string[] = []
  try {
    servers = mcpServers((await $.tool.list()).map(t => t.name))
  } catch {}
  let conversation = '(unavailable)'
  try {
    const messages = await $.session.messages()
    if (Array.isArray(messages)) conversation = conversationText(messages.map(m => ({ role: m.role, text: m.text ?? '' })))
  } catch {}
  return userPrompt({ rough, target, root, tree, instructions: instructionsText(docs), commands, servers, conversation })
}

async function enhance($: EngineInterface, rough: string, model: string, signal?: AbortSignal): Promise<Outcome> {
  const prompt = await gather($, rough)
  const r = await $.model.complete({ model, system: SYSTEM, prompt, maxTokens: 2000, timeoutMs: 90000 }, { signal })
  if (!r.isAnswered) {
    const why = r.reason === 'api-error' ? `API error ${r.status ?? ''}`.trim() : r.reason
    return { ok: false, note: why }
  }
  const text = cleanReply(r.text)
  return text ? { ok: true, text } : { ok: false, note: 'empty reply' }
}

let stop = new AbortController()

// Runs after the trigger has returned, so the box is free to take the result.
async function finish($: EngineInterface, rough: string, model: string) {
  stop = new AbortController()
  const mine = stop
  const r = await enhance($, rough, model, mine.signal)
  if (mine.signal.aborted) return
  if (!r.ok) {
    await setView($, () => ({ ...IDLE, phase: 'error', original: rough, note: r.note }))
    return
  }
  // The person is in the dashboard (the run asked for the keys): keep them there. Filling the prompt box hands the keys
  // to the box, and nothing but the person can hand them back, so the rewrite waits in the tab: s sends it, p puts it
  // in the box to edit, d dismisses. Send is marked focused; cockpit moves the ring to it from Cancel.
  if (isKeysAsked) {
    await setView($, () => ({ ...IDLE, phase: 'ready', original: rough, enhanced: r.text, isFilled: false, note: IN_TAB }))
    return
  }
  // The box still holds nothing or the rough draft: replace it. Anything else was typed meanwhile: keep it.
  const box = (await $.prompt.read()).text.trim()
  if (box !== '' && box !== rough) {
    await setView($, () => ({ ...IDLE, phase: 'ready', original: rough, enhanced: r.text, isFilled: false }))
    return
  }
  await setView($, () => ({ ...IDLE, phase: 'ready', original: rough, enhanced: r.text, isFilled: true }))
  const isFilled = (await $.prompt.fill({ text: r.text })).isFilled
  if (!isFilled) await setView($, old => ({ ...old, isFilled: false }))
}

// A dashboard that waits undrawn (a narrow terminal) would hide Send: say so; Enter in the box still sends.
async function placed($: EngineInterface, r: { isPlaced: true } | { isPlaced: false; reason: string }) {
  if (!r.isPlaced) $.ui.toast(`Enhance: dashboard not shown (${r.reason}). Enter in the box sends.`)
}

async function start($: EngineInterface, rough: string, model: string, isCommand = false) {
  stop.abort()
  await setView($, () => ({ ...IDLE, phase: 'working', original: rough }))
  // Called from the person's command or press, so this open is theirs and takes the keys now (c cancels meanwhile;
  // s / r / d once the rewrite lands). From /enhance always: while its hook runs the box still holds the command's own
  // text, which the engine clears. From the chord or a held prompt only over an empty box: a draft there is the person's.
  isKeysAsked = isCommand || (await $.prompt.read()).text.trim() === ''
  await showTab($, isKeysAsked)
  $.clock.after(10, () => void finish($, rough, model).catch(err => setView($, () => ({ ...IDLE, phase: 'error', original: rough, note: String(err) }))))
}

async function closeAll($: EngineInterface) {
  await setView($, () => IDLE)
}

// The summary atom (FR-ALL-05): the bounce mode, or the held prompt's reason while one is held; and the tab.
async function publish($: EngineInterface) {
  const set = await read($, setting)
  const v = await read($, view)
  await update($, summary, () => bounceSummary(set.mode ?? bounceOption, v.phase === 'bounced' ? v.note : null))
  await update($, tab, () => enhanceTab(v, set.mode ?? bounceOption, { show: showCount, open: openCount }))
}

async function setView($: EngineInterface, f: (old: View) => View) {
  await update($, view, f)
  await publish($)
}

// Shows the Enhance tab: cockpit switches the dashboard to it, and the dashboard is opened from here. `focus` gives it
// the keys (s / r / d), which the engine grants only to a fresh open over an empty box, so an open dashboard is closed first.
async function showTab($: EngineInterface, focus: boolean) {
  if (focus) {
    // bws-cockpit opens it, inside this same dispatch (its state.set hook is awaited), and takes the keys.
    openCount += 1
    await publish($)
    return
  }
  showCount += 1
  await publish($)
  await placed($, await $.ui.open({ id: DASHBOARD, title: 'Dashboard' }))
}

async function send($: EngineInterface) {
  const v = await read($, view)
  const box = await $.prompt.read()
  // The box wins when it holds our text, so edits made there are what gets sent.
  const text = v.isFilled && box.text.trim() !== '' ? box.text : v.enhanced
  if (text.trim() === '') return
  if (v.isFilled) await $.prompt.fill({ text: '' })
  await closeAll($)
  $.clock.after(10, () => void $.prompt.submit({ text, asUser: true }))
}

async function putInBox($: EngineInterface) {
  const v = await read($, view)
  const filled = await $.prompt.fill({ text: v.enhanced })
  await setView($, old => ({ ...old, isFilled: filled.isFilled }))
}

async function revert($: EngineInterface) {
  const v = await read($, view)
  if (v.isFilled) await $.prompt.fill({ text: v.original })
  await closeAll($)
}

async function cancel($: EngineInterface) {
  stop.abort()
  await closeAll($)
}

// The footer button's chord: enhance whatever is in the box now.
async function enhanceDraft($: EngineInterface, model: string) {
  const draft = (await $.prompt.read()).text.trim()
  if (draft === '') {
    $.ui.toast('Enhance: type a rough prompt first')
    return
  }
  if (draft.startsWith('/')) {
    $.ui.toast('Enhance: the box holds a slash command')
    return
  }
  await start($, draft, model)
}

// A call that may be refused or have nothing beneath it: its answer, or undefined.
async function settle<T>(p: Promise<T>): Promise<T | undefined> {
  try {
    return await p
  } catch {
    return undefined
  }
}

// The adapter classify-fork runs on: the mods API calls and nothing else.
function kitModel($: EngineInterface): KitModel {
  return {
    classify: (text, labels, options) => $.model.classify(text, labels, options),
    complete: (request, options) => $.model.complete(request, options),
    fork: request => $.model.fork(request),
    messages: async () => (await $.session.messages()).map(m => ({ role: m.role, text: m.text ?? '' })),
    sessionModel: () => $.session.model(),
    after: (ms, fn) => $.clock.after(ms, fn),
  }
}

// The project's glossary: the glossaryFile option, else docs/GLOSSARY.md, else the ## Glossary section of AGENTS.md or CLAUDE.md.
// Empty when none is found or readable; the bouncer then runs without one.
async function loadGlossary($: EngineInterface): Promise<string> {
  const root = (await settle($.session.root())) ?? ''
  if (root === '') return ''
  const from = async (rel: string, wholeFile: boolean) => {
    try {
      return glossaryText(String(await $.fs.read(resolvePath(root, rel))), wholeFile)
    } catch {
      return ''
    }
  }
  if (glossaryOption !== '') return from(glossaryOption, true)
  for (const [rel, wholeFile] of [['docs/GLOSSARY.md', true], ['AGENTS.md', false], ['CLAUDE.md', false]] as const) {
    const text = await from(rel, wholeFile)
    if (text !== '') return text
  }
  return ''
}

// The second small-model call: what is missing, with the glossary. Null when it fails, so the prompt is sent.
async function vagueReason($: EngineInterface, km: KitModel, text: string, glossary: string): Promise<string | null> {
  const cut = new AbortController()
  $.clock.after(BOUNCE_TIMEOUT_MS, () => cut.abort())
  const r = await bound(
    // classify-fork's request has no system field, so the rules go in front of the prompt.
    km.complete({ model: bounceModel, prompt: `${REASON_SYSTEM}\n\n${reasonPrompt(text, glossary)}`, maxTokens: 120, timeoutMs: BOUNCE_TIMEOUT_MS }, { signal: cut.signal }),
    km.after,
    { timeoutMs: BOUNCE_TIMEOUT_MS, signal: cut.signal },
  )
  if (!r.ok) {
    $.ui.log(failLine('reason', r.reason), { to: 'debug' })
    return null
  }
  if (!r.value.isAnswered) {
    $.ui.log(failLine('reason', r.value.reason), { to: 'debug' })
    return null
  }
  const reason = reasonText(r.value.text)
  if (reason === '') {
    $.ui.log(failLine('reason', 'empty-reply'), { to: 'debug' })
    return null
  }
  return reason
}

// Runs after the hook has answered, so the box is free: the draft goes back in if the engine cleared it, and the tab shows the reason.
async function showHeld($: EngineInterface, text: string, reason: string) {
  await setView($, () => ({ ...IDLE, phase: 'bounced', original: text, note: reason }))
  if ((await $.prompt.read()).text.trim() === '') await $.prompt.fill({ text })
  await showTab($, false)
}

// The prompt bouncer. null sends the prompt; { drop } holds it, the reason shown to the person. Every failure sends the
// prompt unchanged, with one debug line that carries no prompt text (FR-PB-05).
async function bounceCheck($: EngineInterface, e: PromptSubmitInput): Promise<{ drop: string } | null> {
  try {
    // One mod takes a typed prompt, not two: with bws-better's automatic mode on, its pane is the review.
    if (await read($, betterAuto)) return null
    const set = await read($, setting)
    const mode = set.mode ?? bounceOption
    if (mode === 'off') return null
    // Warn: the second Enter of the same text sends it.
    const again = mode === 'warn' && set.warned !== null && set.warned === e.text
    if (set.warned !== null) await update($, setting, old => ({ ...old, warned: null }))
    if (again) return null
    // A run with no surface (claude -p) has no pane: warn is not checked there; block refuses with the reason.
    const headless = ((await settle($.session.surfaces())) ?? []).length === 0
    if (skipReason(e, mode, headless) !== null) return null
    const km = kitModel($)
    const glossary = await loadGlossary($)
    const gate = await classifyGate(km, { question: vagueQuestion(glossary), material: e.text, model: bounceModel, timeoutMs: BOUNCE_TIMEOUT_MS })
    if (!gate.ok) {
      $.ui.log(failLine('classify', gate.reason), { to: 'debug' })
      return null
    }
    if (!gate.verdict) return null
    const reason = await vagueReason($, km, e.text, glossary)
    if (reason === null) return null
    if (mode === 'warn') await update($, setting, old => ({ ...old, warned: e.text }))
    $.clock.after(10, () => void showHeld($, e.text, reason).catch(() => $.ui.log(failLine('show', 'error'), { to: 'debug' })))
    const hint = headless ? 'Edit it and send it again.' : mode === 'warn' ? 'Press Enter again to send it as it is.' : 'Edit it, or use Send anyway in the Enhance tab.'
    return { drop: `Held by bws-enhance: ${reason} ${hint}` }
  } catch {
    $.ui.log(failLine('check', 'error'), { to: 'debug' })
    return null
  }
}

// Send anyway: the held text goes in as the person's own words; the bouncer does not check it again (its origin is the plugin).
async function sendAnyway($: EngineInterface) {
  const v = await read($, view)
  const text = v.original
  if (text.trim() === '') return
  const box = await $.prompt.read()
  await update($, setting, old => ({ ...old, warned: null }))
  if (box.text === text) await $.prompt.fill({ text: '' })
  await closeAll($)
  $.clock.after(10, () => void $.prompt.submit({ text, asUser: true }))
}

// Enhance: the held text goes through the enhance pipeline; the rewrite replaces the box as usual.
async function enhanceHeld($: EngineInterface, model: string) {
  const v = await read($, view)
  await update($, setting, old => ({ ...old, warned: null }))
  await start($, v.original, model)
}

// Edit: the draft stays in the box for editing; the tab goes idle.
async function editHeld($: EngineInterface) {
  await update($, setting, old => ({ ...old, warned: null }))
  await closeAll($)
}

// A button in the Enhance tab, or `/enhance --<action>`: the same actions the pane's buttons ran.
async function act($: EngineInterface, a: Action, model: string) {
  if (a === 'send') await send($)
  else if (a === 'revert') await revert($)
  else if (a === 'put') await putInBox($)
  else if (a === 'dismiss' || a === 'cancel') await cancel($)
  else if (a === 'sendanyway') await sendAnyway($)
  else if (a === 'enhance') await enhanceHeld($, model)
  else if (a === 'draft') await enhanceDraft($, model)
  else await editHeld($)
}

export const register: Register = (on, options) => {
  const model = String(options.model ?? '').trim() || 'haiku'
  const action = String(options.chordAction ?? '').trim()
  bounceOption = parseMode(options.bounce) ?? 'off'
  bounceModel = String(options.bounceModel ?? '').trim() || 'haiku'
  glossaryOption = String(options.glossaryFile ?? '').trim()

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: "Rewrite a rough prompt into a specific one using this project's instructions and skills, then Send",
      argumentHint: '<rough prompt>',
      immediate: true,
    })
    await $.command.register({
      name: BOUNCE,
      description: 'Hold a vague prompt before it is sent: off, warn (Enter again sends it) or block (the draft stays in the box); no argument shows the mode',
      argumentHint: '[off|warn|block|status]',
      immediate: true,
    })
    await publish($)
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const rough = e.args.trim()
    // `/enhance --send` and the like: what a button in the Enhance tab does.
    const a = rough.startsWith('--') ? actionOf(rough) : null
    if (a !== null) {
      await act($, a, model)
      return {}
    }
    if (rough === '') return { text: 'Usage: /enhance <rough prompt>. The rewrite replaces the prompt box; Send (or Enter) submits it.' }
    // Headless (claude -p): no box and no pane, so answer with the rewrite itself.
    if ((await $.session.surfaces()).length === 0) {
      const r = await enhance($, rough, model).catch((err): Outcome => ({ ok: false, note: String(err) }))
      return r.ok ? { text: r.text } : { text: `Enhance failed: ${r.note}`, exitCode: 1 }
    }
    try {
      await start($, rough, model, true)
      return {}
    } catch (err) {
      return { text: `Enhance failed: ${String(err)}` }
    }
  })

  on('command.run', { command: BOUNCE }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const set = await read($, setting)
    if (arg === '' || arg === 'status') return { text: statusText(set.mode ?? bounceOption, set.mode !== null) }
    const mode = parseMode(arg)
    if (mode === null) return { text: 'Usage: /bounce [off|warn|block|status]' }
    await update($, setting, old => ({ ...old, mode, warned: null }))
    await publish($)
    return { text: statusText(mode, true) }
  })

  // The bouncer may hold a prompt the person typed. Then the person sent the box themselves: the tab has done its job.
  on('prompt.submit', async ($, e, next) => {
    const held = await bounceCheck($, e)
    if (held) return held
    try {
      const v = await read($, view)
      if (e.origin.kind === 'composer' && (v.phase === 'ready' || v.phase === 'error' || v.phase === 'bounced')) await closeAll($)
    } catch {
      // never hold up a prompt over the pane
    }
    return next(e)
  })

  // A small footer button, so the chord bound to `chordAction` presses it from the prompt. The footer holds one tree:
  // share it. Another mod's footer (whatever next(e) draws, as bws-sidechat's `side` button) stays beside ours; with
  // none, the engine's mode labels are drawn here, as the engine would. Drawing without next hid every footer below us.
  // The engine raises the footer on the terminal and desktop; a chord presses a Button on the terminal only, so the
  // desktop gets a plain clickable button without the borrowed action.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    if (action === '' || (e.surface !== 'terminal' && e.surface !== 'desktop')) return next(e)
    const drawn = await settle(next(e))
    const other = drawn !== undefined && drawn.type !== 'engine' ? drawn : null
    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" gap={1}>
        {other ?? (e.props.modes.length > 0 ? <Text dimColor>{e.props.modes.join(' & ')}</Text> : null)}
        <Button key="enhance" plain dimColor label="✦ enhance" {...(e.surface === 'terminal' ? { action } : {})} onPress={() => enhanceDraft($, model)} />
      </Box>
    )
  })

  // A press in the Enhance tab (bws-cockpit writes it).
  on('state.set', { plugin: 'bws-cockpit', key: 'tabEvent' }, async ($, e, next) => {
    const ev = parseEvent(e.value)
    const a = ev?.plugin === 'bws-enhance' ? actionOf(ev.id) : null
    if (a !== null) await act($, a, model).catch(() => $.ui.log(failLine('tab', 'error'), { to: 'debug' }))
    return next(e)
  })
}
