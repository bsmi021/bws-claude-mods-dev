// bws-better: turns a rough prompt into a great one before it is sent. A pane asks up to three quick questions,
// rewrites the prompt, and shows the original and the upgrade side by side. Nothing runs until Run.
// Triggers: /better <prompt>, /better alone (a box to type one), and typed prompts while /better on.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren, RenderSurface } from 'claude-code'
import type { Answer, Entry, Flow } from '../types'
import {
  addEntry,
  AMBER,
  bigDigits,
  cardWidths,
  classify,
  GOLD,
  GREEN,
  HAIR,
  heading,
  historyRow,
  INK,
  MUTED,
  ON_GOLD,
  parseQuestions,
  parseRewrite,
  QUESTIONS_SYSTEM,
  questionsPrompt,
  readHistory,
  restoreFill,
  REWRITE_SYSTEM,
  rewritePrompt,
  statsLine,
  stepIndex,
  TILE_LABELS,
  tileInner,
  tilesWidth,
  TITLE,
  titleRule,
  tracker,
  wordCount,
  type Seg,
} from './lib'

const COMMAND = 'better'
const PANE = 'bws-better'
const PANE_TITLE = 'Prompt Upgrade'
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
const NARROW = 'The window is too narrow for the Prompt Upgrade pane, so your prompt is back in the box.'
const NARROW_PANE = 'The window is too narrow for the Prompt Upgrade pane. Widen it and try again.'

const flow = atom({ plugin: 'bws-better', key: 'flow' } as const, IDLE)
const auto = atom({ plugin: 'bws-better', key: 'auto' } as const, false)
const history = atom({ plugin: 'bws-better', key: 'history' } as const, [] as Entry[])
const armed = atom({ plugin: 'bws-better', key: 'armed' } as const, false)

// Copied in by register on every load.
let model = 'haiku'
// Stops the model call in flight; replaced for each call.
let stop = new AbortController()

function reason(err: unknown): string {
  const t = err instanceof Error ? err.message : String(err)
  return t.length > 160 ? `${t.slice(0, 159)}…` : t
}

function openPane($: EngineInterface) {
  return $.ui.open({ id: PANE, title: PANE_TITLE, focus: true, closeOnEscape: true, rows: 30 })
}

// Puts the person's words back in the box without losing anything typed meanwhile.
async function restore($: EngineInterface, original: string) {
  if (original.trim() === '') return
  const fill = restoreFill((await $.prompt.read()).text, original)
  if (fill) await $.prompt.fill(fill)
}

// The flow is idle before the pane closes, so the close is never read as the person's.
async function closePane($: EngineInterface) {
  await update($, flow, (old): Flow => ({ ...IDLE, attempt: old.attempt + 1 }))
  await $.ui.close({ id: PANE })
}

// The pane could not be placed: close it, put the words back, say so in one line.
async function notPlaced($: EngineInterface, original: string) {
  stop.abort()
  await closePane($)
  await restore($, original)
  $.ui.log(original.trim() === '' ? NARROW_PANE : NARROW)
}

// ---------------------------------------------------------------------------------------------------------------
// The steps.

// Step 1: reading. The questions call goes out once the caller has answered.
async function begin($: EngineInterface, original: string): Promise<number> {
  stop.abort()
  await update($, armed, () => false)
  let attempt = 0
  await update($, flow, (old): Flow => {
    attempt = old.attempt + 1
    return { ...IDLE, step: 'reading', original, attempt }
  })
  return attempt
}

function later($: EngineInterface, work: () => Promise<void>) {
  $.clock.after(10, () => void work().catch(err => $.ui.log(`Prompt Upgrade: ${reason(err)}`, { to: 'debug' })))
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
    await update($, flow, (old): Flow => ({ ...old, step: 'error', failed: 'questions', note: callNote(r) }))
    return
  }
  // A reply that cannot be read is no reason to stop: go straight to the rewrite.
  const questions = parseQuestions(r.text) ?? []
  if (questions.length === 0) return startRewrite($)
  await update($, flow, (old): Flow => ({ ...old, step: 'questions', questions, answers: questions.map(() => null), other: null }))
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
  await update($, flow, (old): Flow => {
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
    await update($, flow, (old): Flow => ({ ...old, step: 'error', failed: 'rewrite', note: callNote(r) }))
    return
  }
  const out = parseRewrite(r.text)
  if (!out) {
    await update($, flow, (old): Flow => ({ ...old, step: 'error', failed: 'rewrite', note: 'The reply could not be read.' }))
    return
  }
  const at = await $.clock.now()
  const entry: Entry = { id: `${at}-${attempt}`, at, original: v.original, upgraded: out.prompt, added: out.added }
  await update($, flow, (old): Flow => ({ ...old, step: 'review', upgraded: out.prompt, added: out.added, flash: '' }))
  const list = await update($, history, old => addEntry(old, entry))
  await $.store.set('history', list)
}

// Step 2: one answer. Once every question is answered or skipped the rewrite starts.
async function answer($: EngineInterface, i: number, a: Answer) {
  const v = await update($, flow, (old): Flow => {
    if (old.step !== 'questions') return old
    const answers = old.answers.slice()
    answers[i] = a
    return { ...old, answers, other: null }
  })
  if (v.step === 'questions' && v.answers.every(x => x !== null)) await startRewrite($)
}

async function openOther($: EngineInterface, i: number) {
  await update($, flow, (old): Flow => (old.step === 'questions' ? { ...old, other: old.other === i ? null : i } : old))
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

async function copy($: EngineInterface, surface: RenderSurface) {
  const v = await read($, flow)
  const r = await $.ui.copy({ text: v.upgraded, surface })
  const flash = r.isCopied ? 'Copied to the clipboard.' : `Could not copy (${r.reason}).`
  await update($, flow, (old): Flow => ({ ...old, flash }))
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
  await update($, flow, (old): Flow => ({
    ...IDLE,
    attempt: old.attempt + 1,
    step: 'review',
    original: entry.original,
    upgraded: entry.upgraded,
    added: entry.added,
    fromHistory: true,
  }))
}

// /better alone: the prompt typed in the pane starts an upgrade.
async function composed($: EngineInterface, text: string) {
  if (text.trim() === '') return
  const attempt = await begin($, text.trim())
  later($, () => askQuestions($, attempt))
}

// Headless (claude -p): no pane, so no questions: the rewrite alone, as text.
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
  return isOn
    ? 'Prompt Upgrade is on: prompts you type go to the pane first. Start one with > to send it as it is.'
    : 'Prompt Upgrade is off: prompts you type are sent as they are.'
}

// After a reload the flow is where it was: re-send the call it was waiting on, and bring the pane back.
async function resume($: EngineInterface) {
  const v = await read($, flow)
  if (v.step === 'idle') return
  if (v.step === 'reading') {
    const attempt = await begin($, v.original)
    later($, () => askQuestions($, attempt))
  } else if (v.step === 'rewrite') {
    await startRewrite($)
  }
  void openPane($)
}

// ---------------------------------------------------------------------------------------------------------------

export const register: Register = (on, options) => {
  model = String(options.model ?? '').trim() || 'haiku'

  on('session.start', async ($, e, nxt) => {
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
      await resume($)
    } catch (err) {
      $.ui.log(`Prompt Upgrade: ${reason(err)}`, { to: 'debug' })
    }
    return nxt(e)
  })

  // Every answer is a plain sentence, failure included.
  on('command.run', { command: COMMAND }, async ($, e) => {
    try {
      const arg = e.args.trim()
      const word = arg.toLowerCase()
      if (word === 'on' || word === 'off') return { text: await setAuto($, word === 'on') }
      const isHeadless = (await $.session.surfaces()).length === 0
      if (word === 'history') {
        const list = await read($, history)
        if (list.length === 0) return { text: 'No upgrades yet. Try /better followed by a rough prompt.' }
        if (isHeadless) return { text: list.map(x => `${x.original}\n→ ${x.upgraded}`).join('\n\n') }
        stop.abort()
        await update($, flow, (old): Flow => ({ ...IDLE, attempt: old.attempt + 1, step: 'history' }))
        void openPane($).then(r => (r.isPlaced ? undefined : notPlaced($, '')))
        return { text: `Your last ${list.length} ${list.length === 1 ? 'upgrade is' : 'upgrades are'} in the Prompt Upgrade pane.` }
      }
      if (arg === '') {
        if (isHeadless) return { text: 'Usage: /better <rough prompt>, /better on, /better off, /better history.' }
        stop.abort()
        await update($, flow, (old): Flow => ({ ...IDLE, attempt: old.attempt + 1, step: 'compose' }))
        void openPane($).then(r => (r.isPlaced ? undefined : notPlaced($, '')))
        return { text: 'Type your rough prompt in the Prompt Upgrade pane.' }
      }
      if (isHeadless) return await headless($, arg)
      const attempt = await begin($, arg)
      void openPane($).then(r => (r.isPlaced ? later($, () => askQuestions($, attempt)) : notPlaced($, arg)))
      return { text: 'Upgrading your prompt in the Prompt Upgrade pane. Nothing runs until you press Run.' }
    } catch (err) {
      return { text: `Prompt Upgrade could not start: ${reason(err)}` }
    }
  }).catch(() => ({ text: 'Prompt Upgrade could not start. Your prompt is safe; try again.' }))

  // Automatic mode. Only the person's own Enter is ever taken; anything that goes wrong sends the prompt as typed.
  on('prompt.submit', async ($, e, nxt) => {
    const verdict = classify(e, { auto: await read($, auto), armed: await read($, armed) })
    if (verdict.kind === 'armed') {
      await update($, armed, () => false)
      return nxt(e)
    }
    if (verdict.kind === 'strip') return nxt({ ...e, text: verdict.text })
    if (verdict.kind === 'pass') return nxt(e)
    const original = e.text.trim()
    const attempt = await begin($, original)
    const opened = await openPane($)
    if (!opened.isPlaced) {
      stop.abort()
      await closePane($)
      $.clock.after(10, () => void restore($, original))
      return { drop: NARROW }
    }
    later($, () => askQuestions($, attempt))
    return { drop: TAKEN }
  }).catch(($, e, nxt) => nxt(e))

  // Closed by the person (Esc or its close mark) mid-upgrade: stop the call and put the words back.
  on('ui.close', async ($, e, nxt) => {
    if (e.id === PANE && e.origin.kind === 'person') {
      const v = await read($, flow)
      if (v.step !== 'idle') {
        stop.abort()
        await update($, flow, (old): Flow => ({ ...IDLE, attempt: old.attempt + 1 }))
        if (!v.fromHistory) $.clock.after(10, () => void restore($, v.original))
      }
    }
    return nxt(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const v = await read($, flow)
    const list = v.step === 'history' ? await read($, history) : []
    const isAuto = await read($, auto)
    const cols = Math.max(20, e.props.bodyColumns)
    const table = $.ui.resolve(e)
    const { Box, Button, Text } = table
    const Input = e.surface !== 'mobile' && 'Input' in table ? table.Input : null

    // -- shared rows ------------------------------------------------------------------------------------------
    const rule = titleRule(cols)
    const right = isAuto ? 'AUTO ON' : ''
    const header = (
      <Box flexDirection="column" width={cols}>
        <Box flexDirection="row" justifyContent="space-between" width={cols}>
          <Text bold color={INK}>{TITLE}</Text>
          {right !== '' && cols >= TITLE.length + right.length + 2 ? <Text color={MUTED}>{right}</Text> : null}
        </Box>
        <Text>
          <Text color={GOLD}>{rule.gold}</Text>
          <Text color={HAIR}>{rule.hair}</Text>
        </Text>
      </Box>
    )
    const toneColor = (s: Seg) => (s.tone === 'done' ? GREEN : s.tone === 'now' ? GOLD : s.tone === 'line' ? HAIR : MUTED)
    const index = stepIndex(v.step, v.failed)
    const steps =
      index < 0 ? null : (
        <Text>
          {tracker(index, cols).map(s => (
            <Text color={toneColor(s)} bold={s.tone === 'now'}>{s.text}</Text>
          ))}
        </Text>
      )
    const section = (label: string) => {
      const head = heading(label, cols)
      return (
        <Text>
          <Text color={MUTED}>{head.label}</Text>
          <Text color={HAIR}>{head.hair === '' ? '' : ` ${head.hair}`}</Text>
        </Text>
      )
    }
    const gold = (key: string, label: string, onPress: () => unknown, focus?: true) => (
      <Button key={key} plain autoFocus={focus} onPress={() => void onPress()}>
        <Text backgroundColor={GOLD} color={ON_GOLD} bold>{` ${label} `}</Text>
      </Button>
    )
    const slate = (key: string, label: string, onPress: () => unknown) => (
      <Button key={key} plain onPress={() => void onPress()}>
        <Text backgroundColor={HAIR} color={INK}>{` ${label} `}</Text>
      </Button>
    )
    const quiet = (key: string, label: string, onPress: () => unknown) => (
      <Button key={key} plain onPress={() => void onPress()}>
        <Text color={MUTED}>{label}</Text>
      </Button>
    )
    const card = (key: string, title: string, text: string, width: number, border: string) => (
      <Box key={key} flexDirection="column" width={width} borderStyle="round" borderColor={border} paddingX={1}>
        <Text color={MUTED}>{title}</Text>
        <Text color={INK}>{text}</Text>
      </Box>
    )
    const page = (...body: RenderChildren[]) => (
      <Box flexDirection="column" width={cols} gap={1}>
        <Box flexDirection="column" width={cols}>
          {header}
          {steps}
        </Box>
        {body}
      </Box>
    )

    // -- steps ------------------------------------------------------------------------------------------------
    if (v.step === 'idle') {
      return page(<Text color={MUTED}>Nothing to upgrade. Type /better followed by a rough prompt.</Text>)
    }

    if (v.step === 'compose') {
      return page(
        section('Your prompt'),
        Input ? (
          <Input key="compose" placeholder="What do you want Claude to do?" submitLabel="upgrade" autoFocus onSubmit={text => void composed($, text)} />
        ) : (
          <Text color={MUTED}>Type /better followed by your prompt.</Text>
        ),
        <Box flexDirection="row" gap={2}>{quiet('cancel', 'Cancel', () => cancel($))}</Box>,
      )
    }

    if (v.step === 'history') {
      return page(
        section('Recent upgrades'),
        list.length === 0 ? (
          <Text color={MUTED}>No upgrades yet.</Text>
        ) : (
          <Box flexDirection="column" width={cols}>
            {list.map((x, i) => {
              const row = historyRow(x, cols)
              return (
                <Button key={`h-${x.id}`} plain autoFocus={i === 0 ? true : undefined} onPress={() => void openEntry($, x)}>
                  <Text color={MUTED}>{`${row.when}  `}</Text>
                  <Text color={INK}>{row.text}</Text>
                </Button>
              )
            })}
          </Box>
        ),
        <Box flexDirection="row" gap={2}>{quiet('close', 'Close', () => closePane($))}</Box>,
      )
    }

    if (v.step === 'reading' || v.step === 'rewrite') {
      const given = v.answers.filter(a => a !== null && a.kind !== 'skip').length
      const line =
        v.step === 'reading'
          ? 'Reading your prompt and choosing the questions that would help most.'
          : `Writing the upgrade from your prompt${given > 0 ? ` and ${given} ${given === 1 ? 'answer' : 'answers'}` : ''}.`
      return page(
        <Text color={MUTED}>{line}</Text>,
        card('original', 'YOUR PROMPT', v.original, cols, HAIR),
        <Box flexDirection="row" gap={2}>{quiet('cancel', 'Cancel', () => cancel($))}</Box>,
      )
    }

    if (v.step === 'error') {
      const what = v.failed === 'rewrite' ? 'writing the upgrade' : 'choosing the questions'
      return page(
        <Box flexDirection="column" width={cols} borderStyle="round" borderColor={AMBER} paddingX={1}>
          <Text color={AMBER}>{`Something went wrong while ${what}.`}</Text>
          <Text color={INK}>Your prompt is safe. Nothing was sent.</Text>
          {v.note !== '' ? <Text color={MUTED}>{v.note}</Text> : null}
        </Box>,
        <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
          {gold('retry', 'Try again', () => retry($), true)}
          {slate('original', 'Send my original', () => sendOriginal($))}
          {quiet('cancel', 'Cancel', () => cancel($))}
        </Box>,
      )
    }

    if (v.step === 'questions') {
      const done = v.answers.filter(a => a !== null).length
      const firstOpen = v.answers.findIndex(a => a === null)
      return page(
        section('Questions'),
        ...v.questions.map((q, i) => {
          const a = v.answers[i] ?? null
          const badge =
            a === null ? (
              <Text backgroundColor={GOLD} color={ON_GOLD} bold>{` ${i + 1} `}</Text>
            ) : a.kind === 'skip' ? (
              <Text backgroundColor={HAIR} color={MUTED}>{' – '}</Text>
            ) : (
              <Text backgroundColor={GREEN} color={ON_GOLD} bold>{' ✓ '}</Text>
            )
          const picked = a !== null && a.kind !== 'skip' ? a.value : null
          const isOther = a !== null && a.kind === 'other'
          return (
            <Box key={`q-${i}`} flexDirection="column" width={cols}>
              <Box flexDirection="row" gap={1} width={cols}>
                {badge}
                <Box width={cols - 4}>
                  <Text color={a !== null && a.kind === 'skip' ? MUTED : INK}>{q.text}</Text>
                </Box>
              </Box>
              <Box flexDirection="row" flexWrap="wrap" columnGap={1} paddingLeft={4} width={cols}>
                {q.options.map((o, j) =>
                  picked === o && !isOther
                    ? gold(`o-${i}-${j}`, o, () => answer($, i, { kind: 'option', value: o }), i === firstOpen && j === 0 ? true : undefined)
                    : (
                      <Button key={`o-${i}-${j}`} plain autoFocus={i === firstOpen && j === 0 ? true : undefined} onPress={() => void answer($, i, { kind: 'option', value: o })}>
                        <Text backgroundColor={HAIR} color={INK}>{` ${o} `}</Text>
                      </Button>
                    ),
                )}
                {Input ? (isOther && picked ? gold(`other-${i}`, `Other: ${picked}`, () => openOther($, i)) : slate(`other-${i}`, 'Other (type it)', () => openOther($, i))) : null}
                {quiet(`skip-${i}`, 'Skip', () => answer($, i, { kind: 'skip' }))}
              </Box>
              {Input && v.other === i ? (
                <Box paddingLeft={4} width={cols}>
                  <Input
                    key={`other-input-${i}`}
                    placeholder="Type your answer"
                    submitLabel="save"
                    autoFocus
                    onSubmit={text => void (text.trim() === '' ? openOther($, i) : answer($, i, { kind: 'other', value: text.trim() }))}
                  />
                </Box>
              ) : null}
            </Box>
          )
        }),
        <Box flexDirection="row" flexWrap="wrap" columnGap={2} width={cols}>
          <Text color={MUTED}>{`${done} of ${v.questions.length} answered`}</Text>
          {gold('upgrade', 'Skip the rest, upgrade now', () => startRewrite($))}
          {quiet('cancel', 'Cancel', () => cancel($))}
        </Box>,
      )
    }

    // review
    const before = wordCount(v.original)
    const after = wordCount(v.upgraded)
    const nums = [before, after, v.added.length]
    const tiles = tilesWidth(nums, cols)
    const tileColor = [INK, GOLD, GREEN]
    const stats =
      tiles === null ? (
        <Text color={INK}>{statsLine(before, after, v.added.length, cols)}</Text>
      ) : (
        <Box flexDirection="row" gap={1}>
          {nums.map((n, i) => {
            const label = TILE_LABELS[i] ?? ''
            const big = bigDigits(n)
            return (
              <Box key={`tile-${i}`} flexDirection="column" borderStyle="round" borderColor={HAIR} width={tileInner(n, label) + 2} paddingX={1}>
                {big.map(row => (
                  <Text color={tileColor[i] ?? INK}>{row}</Text>
                ))}
                <Text color={MUTED}>{label}</Text>
              </Box>
            )
          })}
        </Box>
      )
    const w = cardWidths(cols)
    const cards = (
      <Box flexDirection={w.isSide ? 'row' : 'column'} gap={1} width={cols}>
        {card('mine', 'YOUR PROMPT', v.original, w.left, HAIR)}
        {card('upgrade', 'UPGRADE', v.upgraded, w.right, GOLD)}
      </Box>
    )
    return page(
      stats,
      <Box flexDirection="column" width={cols}>
        <Box flexDirection="row" flexWrap="wrap" columnGap={2} width={cols}>
          {gold('run', 'Run it', () => run($), true)}
          {slate('edit', 'Edit', () => edit($))}
          {slate('copy', 'Copy', () => copy($, e.surface))}
          {quiet('cancel', v.fromHistory ? 'Close' : 'Cancel', () => cancel($))}
        </Box>
        {v.flash !== '' ? <Text color={GREEN}>{v.flash}</Text> : null}
      </Box>,
      v.added.length === 0
        ? null
        : (
          <Box flexDirection="column" width={cols}>
            {section('What I added')}
            {v.added.map(a => (
              <Text>
                <Text color={GREEN}>+ </Text>
                <Text color={INK}>{a}</Text>
              </Text>
            ))}
          </Box>
        ),
      cards,
    )
  })
}
