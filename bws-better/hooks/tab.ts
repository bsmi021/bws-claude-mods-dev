// The Better tab bws-cockpit draws in its dashboard (bws-kit/tab.ts): every step the Prompt Upgrade pane used to show.
// Ids sent back (and `/better --<id> [text]`, the same action): cancel, close, retry, original, upgrade, run, edit, copy,
// o-<question>-<option>, other-<question>, skip-<question>, other-input-<question> (with the text), compose (with the
// text), h-<entry id>. Pure: no `$`.
import type { Entry, Flow } from '../types'
import { buttons, card, makeTab, text } from './kit/tab'
import type { ModTab, TabNode } from './kit/tab'
import { historyRow, statsLine, stepIndex, TITLE, tracker, wordCount } from './lib'

// The width the step tracker and the stats line are laid out for.
const COLS = 100

export function betterTab(v: Flow, list: readonly Entry[], isAuto: boolean, o: { show: number }): ModTab {
  const head: TabNode[] = [text(isAuto ? `${TITLE}   AUTO ON` : TITLE, { isBold: true, color: 'accent' })]
  const index = stepIndex(v.step, v.failed)
  if (index >= 0) head.push(text(tracker(index, COLS).map(s => s.text).join(''), { isDim: true, isClipped: true }))
  const tab = (body: TabNode[], badge: string, tone: ModTab['tone']) => makeTab('Better', [...head, ...body], { badge, tone, show: o.show })
  const autoBadge = isAuto ? 'auto' : ''

  if (v.step === 'idle') {
    return tab(
      [
        text('Nothing to upgrade. Type /better followed by a rough prompt.', { isDim: true }),
        buttons({ id: 'compose-open', label: 'Upgrade a prompt' }, { id: 'history', label: 'History' }, isAuto ? { id: 'auto-off', label: 'Turn auto off' } : { id: 'auto-on', label: 'Turn auto on' }),
      ],
      autoBadge,
      'idle',
    )
  }
  if (v.step === 'compose') {
    return tab([text('Your prompt', { isDim: true }), { kind: 'input', id: 'compose', placeholder: 'What do you want Claude to do?' }, buttons({ id: 'cancel', label: 'Cancel' })], '…', 'busy')
  }
  if (v.step === 'history') {
    const rows: TabNode[] = list.length === 0 ? [text('No upgrades yet.', { isDim: true })] : list.map(x => buttons({ id: `h-${x.id}`, label: historyRow(x, 40 + historyRow(x, 0).when.length + 2).text }))
    return tab([text('Recent upgrades', { isDim: true }), ...rows, buttons({ id: 'close', label: 'Close' })], autoBadge, 'idle')
  }
  if (v.step === 'reading' || v.step === 'rewrite') {
    const given = v.answers.filter(a => a !== null && a.kind !== 'skip').length
    const line =
      v.step === 'reading'
        ? 'Reading your prompt and choosing the questions that would help most.'
        : `Writing the upgrade from your prompt${given > 0 ? ` and ${given} ${given === 1 ? 'answer' : 'answers'}` : ''}.`
    return tab([text(line, { isDim: true }), card('YOUR PROMPT', [text(v.original)]), buttons({ id: 'cancel', label: 'Cancel', hotkey: 'c' })], '…', 'busy')
  }
  if (v.step === 'error') {
    const what = v.failed === 'rewrite' ? 'writing the upgrade' : 'choosing the questions'
    return tab(
      [
        card('Something went wrong', [text(`Something went wrong while ${what}.`, { color: 'warn' }), text('Your prompt is safe. Nothing was sent.'), ...(v.note ? [text(v.note, { isDim: true })] : [])], 'warn'),
        buttons({ id: 'retry', label: 'Try again', isPrimary: true, hotkey: 't' }, { id: 'original', label: 'Send my original' }, { id: 'cancel', label: 'Cancel', hotkey: 'c' }),
      ],
      '!',
      'warn',
    )
  }
  if (v.step === 'questions') {
    const done = v.answers.filter(a => a !== null).length
    const qs: TabNode[] = v.questions.map((q, i) => {
      const a = v.answers[i] ?? null
      const mark = a === null ? `${i + 1}.` : a.kind === 'skip' ? '–' : '✓'
      const picked = a !== null && a.kind !== 'skip' ? a.value : null
      const body: TabNode[] = [
        text(`${mark} ${q.text}`, a !== null && a.kind === 'skip' ? { isDim: true } : {}),
        buttons(
          ...q.options.map((opt, j) => ({ id: `o-${i}-${j}`, label: picked === opt && a?.kind === 'option' ? `● ${opt}` : opt })),
          { id: `other-${i}`, label: a?.kind === 'other' && picked ? `Other: ${picked}` : 'Other (type it)' },
          { id: `skip-${i}`, label: 'Skip' },
        ),
        ...(v.other === i ? [{ kind: 'input' as const, id: `other-input-${i}`, placeholder: 'Type your answer' }] : []),
      ]
      return card(`Question ${i + 1}`, body, a === null ? 'accent' : undefined)
    })
    return tab(
      [text('Questions', { isDim: true }), ...qs, text(`${done} of ${v.questions.length} answered`, { isDim: true }), buttons({ id: 'upgrade', label: 'Skip the rest, upgrade now', isPrimary: true }, { id: 'cancel', label: 'Cancel' })],
      `${done}/${v.questions.length}`,
      'warn',
    )
  }
  // review
  const before = wordCount(v.original)
  const after = wordCount(v.upgraded)
  return tab(
    [
      text(statsLine(before, after, v.added.length, COLS)),
      buttons(
        { id: 'run', label: 'Run it', isPrimary: true, hotkey: 'r' },
        { id: 'edit', label: 'Edit', hotkey: 'e' },
        { id: 'copy', label: 'Copy', hotkey: 'y' },
        { id: 'cancel', label: v.fromHistory ? 'Close' : 'Cancel', hotkey: 'c' },
      ),
      ...(v.flash ? [text(v.flash, { color: 'ok' as const })] : []),
      ...(v.added.length > 0 ? [card('What I added', v.added.map(a => text(`+ ${a}`)), 'ok')] : []),
      card('YOUR PROMPT', [text(v.original)]),
      card('UPGRADE', [text(v.upgraded)], 'accent'),
    ],
    '✦',
    'ok',
  )
}

// A tab id, or `/better --<id> [text]`, as an action: the id, and the text an input sent.
export type Press = { id: string; value?: string }
export function pressOf(args: string): Press | null {
  const m = /^--([\w:.-]+)(?:\s+([\s\S]*))?$/.exec(args.trim())
  if (!m || m[1] === undefined) return null
  return m[2] === undefined ? { id: m[1] } : { id: m[1], value: m[2] }
}
