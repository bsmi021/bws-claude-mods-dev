// bws-better: turns a rough prompt into a great one before it is sent. Its bws-cockpit dashboard tab asks up to three quick questions,
// rewrites the prompt, and shows the original and the upgrade side by side. Nothing runs until Run.
// Triggers: /better <prompt>, /better alone (a box to type one), and typed prompts while /better on.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { Answer, Entry, Flow } from '../types'
import { addEntry, betterSummary, classify, failLine, parseQuestions, parseRewrite, QUESTIONS_SYSTEM, questionsPrompt, readHistory, restoreFill, REWRITE_SYSTEM, rewritePrompt } from './lib'
import { DASHBOARD, parseEvent } from './kit/tab'
import { betterTab, pressOf, type Press } from './tab'

const COMMAND = 'better'
const TIMEOUT_MS = 90000
const IDLE: Flow = {
  step: 'idle',
  attempt: 0,
  original: '',
  questions: [],
  answers: [],
  other: null,
  upgraded: '',
  added: [],
  failed: null,
  note: '',
  flash: '',
  fromHistory: false,
}
const TAKEN = 'Sent to Prompt Upgrade. Nothing runs until you press Run.'
const NARROW = 'The window is too narrow for the dashboard, so your prompt is back in the box.'
const NARROW_PANE = 'The window is too narrow for the dashboard. Widen it and try again.'

const flow = atom({ plugin: 'bws-better', key: 'flow' } as const, IDLE)
const auto = atom({ plugin: 'bws-better', key: 'auto' } as const, false)
const history = atom({ plugin: 'bws-better', key: 'history' } as const, [] as Entry[])
const armed = atom({ plugin: 'bws-better', key: 'armed' } as const, false)
// The summary atom (FR-ALL-05): bws-cockpit's bar draws a chip for it while the mod is loaded and not idle.
const summary = atom({ plugin: 'bws-better', key: 'summary' } as const, null)
// The Better tab bws-cockpit draws in its dashboard (bws-kit/tab.ts).
const tab = atom({ plugin: 'bws-better', key: 'tab' } as const, null as unknown)
// Counts up when the person's action shows the tab.
let showCount = 0

// Copied in by register on every load.
let model = 'haiku'
// Stops the model call in flight; replaced for each call.
let stop = new AbortController()

async function publish($: EngineInterface) {
  const v = await read($, flow)
  const isOn = await read($, auto)
  const list = await read($, history)
  await update($, summary, () => betterSummary(v.step, v.note, isOn))
  await update($, tab, () => betterTab(v, list, isOn, { show: showCount }))
}

// Every change of the flow goes through here, so the summary never lags the tab.
async function setFlow($: EngineInterface, change: (old: Flow) => Flow): Promise<Flow> {
  const v = await update($, flow, change)
  await publish($)
  return v
}

function reason(err: unknown): string {
  const t = err instanceof Error ? err.message : String(err)
  return t.length > 160 ? `${t.slice(0, 159)}…` : t
}

// Shows the Better tab: cockpit switches the dashboard to it; the open is made here, inside the person's command or
// Enter, so it is placed at any width and takes the keys.
async function openTab($: EngineInterface) {
  showCount += 1
  await publish($)
  return $.ui.open({ id: DASHBOARD, title: 'Dashboard', focus: true })
}

// Puts the person's words back in the box without losing anything typed meanwhile.
async function restore($: EngineInterface, original: string) {
  if (original.trim() === '') return
  const fill = restoreFill((await $.prompt.read()).text, original)
  if (fill) await $.prompt.fill(fill)
}

// Back to idle: the tab says there is nothing to upgrade; the dashboard stays as it is.
async function closePane($: EngineInterface) {
  await setFlow($, (old): Flow => ({ ...IDLE, attempt: old.attempt + 1 }))
}

// The dashboard could not be placed: go idle, put the words back, and answer with the one line that says so.
async function notPlaced($: EngineInterface, original: string): Promise<string> {
  stop.abort()
  await closePane($)
  await restore($, original)
  return original.trim() === '' ? NARROW_PANE : NARROW
}

// The engine keeps a held prompt's text in the box; the tab has it now, and Cancel puts it back.
async function clearTaken($: EngineInterface, original: string) {
  if ((await $.prompt.read()).text.trim() === original) await $.prompt.fill({ text: '' })
}

// ---------------------------------------------------------------------------------------------------------------
// The steps.

// Step 1: reading. The questions call goes out once the caller has answered.
async function begin($: EngineInterface, original: string): Promise<number> {
  stop.abort()
  await update($, armed, () => false)
  let attempt = 0
  await setFlow($, (old): Flow => {
    attempt = old.attempt + 1
    return { ...IDLE, step: 'reading', original, attempt }
  })
  return attempt
}

function later($: EngineInterface, work: () => Promise<void>) {
  $.clock.after(10, () => void work().catch(() => $.ui.log(failLine('step', 'error'), { to: 'debug' })))
}

// A reply for this attempt and step, or nothing when the person moved on (cancel, retry, reload, a new prompt).
async function current($: EngineInterface, attempt: number, step: Flow['step']): Promise<Flow | null> {
  const v = await read($, flow)
  return v.attempt === attempt && v.step === step ? v : null
}

async function askQuestions($: EngineInterface, attempt: number) {
  const v = await current($, attempt, 'reading')
  if (!v) return
  stop = new AbortController()
  const r = await $.model.complete(
    { model, system: QUESTIONS_SYSTEM, prompt: questionsPrompt(v.original), maxTokens: 800, timeoutMs: TIMEOUT_MS },
    { signal: stop.signal },
  )
  if (!(await current($, attempt, 'reading'))) return
  if (!r.isAnswered) {
    $.ui.log(failLine('questions', r.reason), { to: 'debug' })
    await setFlow($, (old): Flow => ({ ...old, step: 'error', failed: 'questions', note: callNote(r) }))
    return
  }
  // A reply that cannot be read is no reason to stop: go straight to the rewrite.
  const questions = parseQuestions(r.text) ?? []
  if (questions.length === 0) return startRewrite($)
  await setFlow($, (old): Flow => ({ ...old, step: 'questions', questions, answers: questions.map(() => null), other: null }))
}

function callNote(r: { reason: string; status?: number | null }): string {
  if (r.reason === 'api-error') return `The model answered with an error${r.status ? ` (${r.status})` : ''}.`
  if (r.reason === 'aborted') return 'The model took too long to answer.'
  return 'The model sent back nothing.'
}

// Step 3: the rewrite, from the original and the answers given.
async function startRewrite($: EngineInterface) {
  stop.abort()
  let attempt = 0
  await setFlow($, (old): Flow => {
    attempt = old.attempt + 1
    return { ...old, step: 'rewrite', attempt, other: null, failed: null, note: '' }
  })
  later($, () => doRewrite($, attempt))
}

async function doRewrite($: EngineInterface, attempt: number) {
  const v = await current($, attempt, 'rewrite')
  if (!v) return
  stop = new AbortController()
  const r = await $.model.complete(
    { model, system: REWRITE_SYSTEM, prompt: rewritePrompt(v.original, v.questions, v.answers), maxTokens: 2000, timeoutMs: TIMEOUT_MS },
    { signal: stop.signal },
  )
  if (!(await current($, attempt, 'rewrite'))) return
  if (!r.isAnswered) {
    $.ui.log(failLine('rewrite', r.reason), { to: 'debug' })
    await setFlow($, (old): Flow => ({ ...old, step: 'error', failed: 'rewrite', note: callNote(r) }))
    return
  }
  const out = parseRewrite(r.text)
  if (!out) {
    $.ui.log(failLine('rewrite', 'unreadable'), { to: 'debug' })
    await setFlow($, (old): Flow => ({ ...old, step: 'error', failed: 'rewrite', note: 'The reply could not be read.' }))
    return
  }
  const at = await $.clock.now()
  const entry: Entry = { id: `${at}-${attempt}`, at, original: v.original, upgraded: out.prompt, added: out.added }
  await setFlow($, (old): Flow => ({ ...old, step: 'review', upgraded: out.prompt, added: out.added, flash: '' }))
  const list = await update($, history, old => addEntry(old, entry))
  await $.store.set('history', list)
}

// Step 2: one answer. Once every question is answered or skipped the rewrite starts.
async function answer($: EngineInterface, i: number, a: Answer) {
  const v = await setFlow($, (old): Flow => {
    if (old.step !== 'questions') return old
    const answers = old.answers.slice()
    answers[i] = a
    return { ...old, answers, other: null }
  })
  if (v.step === 'questions' && v.answers.every(x => x !== null)) await startRewrite($)
}

async function openOther($: EngineInterface, i: number) {
  await setFlow($, (old): Flow => (old.step === 'questions' ? { ...old, other: old.other === i ? null : i } : old))
}

// Step 4: the buttons.
async function run($: EngineInterface) {
  const v = await read($, flow)
  if (v.upgraded.trim() === '') return
  await closePane($)
  $.clock.after(10, () => void $.prompt.submit({ text: v.upgraded, asUser: true }))
}

async function edit($: EngineInterface) {
  const v = await read($, flow)
  if (v.upgraded.trim() === '') return
  await closePane($)
  await update($, armed, () => true)
  await $.prompt.fill({ text: v.upgraded })
}

async function copy($: EngineInterface) {
  const v = await read($, flow)
  const surface = (await $.session.surfaces())[0] ?? 'terminal'
  const r = await $.ui.copy({ text: v.upgraded, surface })
  const flash = r.isCopied ? 'Copied to the clipboard.' : `Could not copy (${r.reason}).`
  await setFlow($, (old): Flow => ({ ...old, flash }))
}

async function cancel($: EngineInterface) {
  const v = await read($, flow)
  stop.abort()
  await update($, armed, () => false)
  await closePane($)
  if (!v.fromHistory) await restore($, v.original)
}

async function sendOriginal($: EngineInterface) {
  const v = await read($, flow)
  await closePane($)
  if (v.original.trim() !== '') $.clock.after(10, () => void $.prompt.submit({ text: v.original, asUser: true }))
}

async function retry($: EngineInterface) {
  const v = await read($, flow)
  if (v.failed === 'rewrite') return startRewrite($)
  const attempt = await begin($, v.original)
  later($, () => askQuestions($, attempt))
}

async function openEntry($: EngineInterface, entry: Entry) {
  await setFlow($, (old): Flow => ({
    ...IDLE,
    attempt: old.attempt + 1,
    step: 'review',
    original: entry.original,
    upgraded: entry.upgraded,
    added: entry.added,
    fromHistory: true,
  }))
}

// /better alone: the prompt typed in the tab starts an upgrade.
async function composed($: EngineInterface, text: string) {
  if (text.trim() === '') return
  const attempt = await begin($, text.trim())
  later($, () => askQuestions($, attempt))
}

// Headless (claude -p): no dashboard, so no questions: the rewrite alone, as text.
async function headless($: EngineInterface, original: string): Promise<{ text: string; exitCode?: number }> {
  const r = await $.model.complete({ model, system: REWRITE_SYSTEM, prompt: rewritePrompt(original, [], []), maxTokens: 2000, timeoutMs: TIMEOUT_MS })
  if (!r.isAnswered) return { text: `Prompt Upgrade could not write the upgrade. ${callNote(r)}`, exitCode: 1 }
  const out = parseRewrite(r.text)
  if (!out) return { text: 'Prompt Upgrade could not read the reply.', exitCode: 1 }
  const added = out.added.length === 0 ? '' : `\n\nWhat I added:\n${out.added.map(a => `- ${a}`).join('\n')}`
  return { text: `${out.prompt}${added}` }
}

async function setAuto($: EngineInterface, isOn: boolean): Promise<string> {
  await update($, auto, () => isOn)
  await $.store.set('auto', isOn)
  await publish($)
  return isOn
    ? 'Prompt Upgrade is on: prompts you type go to the Better tab first. Start one with > to send it as it is.'
    : 'Prompt Upgrade is off: prompts you type are sent as they are.'
}

// After a reload the flow is where it was: re-send the call it was waiting on, and bring the tab back.
async function resume($: EngineInterface) {
  const v = await read($, flow)
  if (v.step === 'idle') return
  if (v.step === 'reading') {
    const attempt = await begin($, v.original)
    later($, () => askQuestions($, attempt))
  } else if (v.step === 'rewrite') {
    await startRewrite($)
  }
  void openTab($)
}

// A button or input in the Better tab (or its `/better --<id>` twin): the action the pane's control ran.
async function act($: EngineInterface, p: Press) {
  const v = await read($, flow)
  const id = p.id
  let m: RegExpExecArray | null
  if (id === 'cancel') await cancel($)
  else if (id === 'close') await closePane($)
  else if (id === 'retry') await retry($)
  else if (id === 'original') await sendOriginal($)
  else if (id === 'upgrade') await startRewrite($)
  else if (id === 'run') await run($)
  else if (id === 'edit') await edit($)
  else if (id === 'copy') await copy($)
  else if (id === 'compose') await composed($, p.value ?? '')
  else if (id === 'compose-open') await setFlow($, (old): Flow => ({ ...IDLE, attempt: old.attempt + 1, step: 'compose' }))
  else if (id === 'history') await setFlow($, (old): Flow => ({ ...IDLE, attempt: old.attempt + 1, step: 'history' }))
  else if (id === 'auto-on' || id === 'auto-off') $.ui.toast(await setAuto($, id === 'auto-on'))
  else if ((m = /^o-(\d+)-(\d+)$/.exec(id))) {
    const i = Number(m[1])
    const value = v.questions[i]?.options[Number(m[2])]
    if (value !== undefined) await answer($, i, { kind: 'option', value })
  } else if ((m = /^other-(\d+)$/.exec(id))) await openOther($, Number(m[1]))
  else if ((m = /^skip-(\d+)$/.exec(id))) await answer($, Number(m[1]), { kind: 'skip' })
  else if ((m = /^other-input-(\d+)$/.exec(id))) {
    const i = Number(m[1])
    const text = (p.value ?? '').trim()
    await (text === '' ? openOther($, i) : answer($, i, { kind: 'other', value: text }))
  } else if (id.startsWith('h-')) {
    const entry = (await read($, history)).find(x => `h-${x.id}` === id)
    if (entry) await openEntry($, entry)
  }
}

// ---------------------------------------------------------------------------------------------------------------

export const register: Register = (on, options) => {
  model = String(options.model ?? '').trim() || 'haiku'

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Upgrade a rough prompt before it is sent: on, off, history, or the prompt itself',
      argumentHint: '<rough prompt> | on | off | history',
      immediate: true,
    })
    // Auto mode and history outlive the session in the store; the session's copies are what the pane reads.
    try {
      const isOn = (await $.store.get('auto')) === true
      const saved = readHistory(await $.store.get('history'))
      await update($, auto, () => isOn)
      await update($, history, () => saved)
      await publish($)
      await resume($)
    } catch (err) {
      $.ui.log(failLine('start', reason(err)), { to: 'debug' })
    }
    return next(e)
  })

  // Every answer is a plain sentence, failure included.
  on('command.run', { command: COMMAND }, async ($, e) => {
    try {
      const arg = e.args.trim()
      // `/better --<id> [text]`: what a button or input in the Better tab does.
      const p = pressOf(arg)
      if (p !== null) {
        await act($, p)
        return {}
      }
      const word = arg.toLowerCase()
      if (word === 'on' || word === 'off') return { text: await setAuto($, word === 'on') }
      const isHeadless = (await $.session.surfaces()).length === 0
      if (word === 'history') {
        const list = await read($, history)
        if (list.length === 0) return { text: 'No upgrades yet. Try /better followed by a rough prompt.' }
        if (isHeadless) return { text: list.map(x => `${x.original}\n→ ${x.upgraded}`).join('\n\n') }
        stop.abort()
        await setFlow($, (old): Flow => ({ ...IDLE, attempt: old.attempt + 1, step: 'history' }))
        if (!(await openTab($)).isPlaced) return { text: await notPlaced($, '') }
        return { text: `Your last ${list.length} ${list.length === 1 ? 'upgrade is' : 'upgrades are'} in the Better tab.` }
      }
      if (arg === '') {
        if (isHeadless) return { text: 'Usage: /better <rough prompt>, /better on, /better off, /better history.' }
        stop.abort()
        await setFlow($, (old): Flow => ({ ...IDLE, attempt: old.attempt + 1, step: 'compose' }))
        if (!(await openTab($)).isPlaced) return { text: await notPlaced($, '') }
        return { text: 'Type your rough prompt in the Better tab.' }
      }
      if (isHeadless) return await headless($, arg)
      const attempt = await begin($, arg)
      // Awaited inside the hook: an open behind the person's command is placed at any width; one made after the
      // hook has answered counts as unasked and waits below 144 columns. The model call still goes out later.
      if (!(await openTab($)).isPlaced) return { text: await notPlaced($, arg) }
      later($, () => askQuestions($, attempt))
      return { text: 'Upgrading your prompt in the Better tab. Nothing runs until you press Run.' }
    } catch (err) {
      return { text: `Prompt Upgrade could not start: ${reason(err)}` }
    }
  }).catch(() => ({ text: 'Prompt Upgrade could not start. Your prompt is safe; try again.' }))

  // Automatic mode. Only the person's own Enter is ever taken; anything that goes wrong sends the prompt as typed.
  on('prompt.submit', async ($, e, next) => {
    const verdict = classify(e, { auto: await read($, auto), armed: await read($, armed) })
    if (verdict.kind === 'armed') {
      await update($, armed, () => false)
      return next(e)
    }
    if (verdict.kind === 'strip') return next({ ...e, text: verdict.text })
    if (verdict.kind === 'pass') return next(e)
    const original = e.text.trim()
    const attempt = await begin($, original)
    // A failed open leaves no pane waiting on a prompt the catch below sends as typed.
    const opened = await openTab($).catch(async err => {
      await setFlow($, (old): Flow => ({ ...IDLE, attempt: old.attempt + 1 }))
      throw err
    })
    if (!opened.isPlaced) {
      stop.abort()
      await closePane($)
      $.clock.after(10, () => void restore($, original))
      return { drop: NARROW }
    }
    later($, () => askQuestions($, attempt))
    $.clock.after(10, () => void clearTaken($, original).catch(() => undefined))
    return { drop: TAKEN }
  }).catch(($, e, next) => next(e))

  // A press or a submitted input in the Better tab (bws-cockpit writes it).
  on('state.set', { plugin: 'bws-cockpit', key: 'tabEvent' }, async ($, e, next) => {
    const ev = parseEvent(e.value)
    if (ev?.plugin === 'bws-better') await act($, ev.value === undefined ? { id: ev.id } : { id: ev.id, value: ev.value }).catch(() => $.ui.log(failLine('tab', 'error'), { to: 'debug' }))
    return next(e)
  })
}
