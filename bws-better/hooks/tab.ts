// The Better tab bws-cockpit draws in its dashboard (bws-kit/tab.ts): every step the Prompt Upgrade pane used to show.
// Ids sent back (and `/better --<id> [text]`, the same action): cancel, close, retry, original, upgrade, run, edit, copy,
// o-<question>-<option>, other-<question>, skip-<question>, other-input-<question> (with the text), compose (with the
// text), h-<entry id>. Pure: no `$`.
import type { Entry, Flow } from '../types'
import { banner, reviewPills, stepPills } from './banner'
import type { Pill } from './banner'
import { buttons, card, makeTab, text } from './kit/tab'
import type { ModTab, TabNode } from './kit/tab'
import { historyRow, stepIndex, wordCount } from './lib'

const image = (pills: readonly Pill[], isAuto: boolean): TabNode => ({ kind: 'image', ...banner(pills, isAuto) })

// Top to bottom: the banner, what the step needs from you, the buttons, then the supporting detail (dimmed).
export function betterTab(v: Flow, list: readonly Entry[], isAuto: boolean, o: { show: number }): ModTab {
  const index = stepIndex(v.step, v.failed)
  const tab = (body: TabNode[], badge: string, tone: ModTab['tone'], pills: readonly Pill[] = index >= 0 ? stepPills(index, v.step === 'error') : []) =>
    makeTab('Better', [image(pills, isAuto), ...body], { badge, tone, show: o.show })
  const autoBadge = isAuto ? 'auto' : ''

  if (v.step === 'idle') {
    return tab(
      [
        text('Turn a rough prompt into a clear goal with a way to check it. Nothing runs until you press Run.'),
        text(isAuto ? 'Automatic mode is on: prompts you type come here first. Start one with > to send it as it is.' : 'Type /better followed by a rough prompt, or start one here.', { isDim: true }),
        buttons(
          { id: 'compose-open', label: 'Upgrade a prompt', isPrimary: true },
          { id: 'history', label: 'History' },
          isAuto ? { id: 'auto-off', label: 'Turn auto off' } : { id: 'auto-on', label: 'Turn auto on' },
        ),
      ],
      autoBadge,
      'idle',
    )
  }
  if (v.step === 'compose') {
    return tab(
      [
        text('What do you want Claude to do?', { isBold: true, color: 'accent' }),
        { kind: 'input', id: 'compose', placeholder: 'A rough prompt is fine' },
        text('Press Enter to upgrade it.', { isDim: true }),
        buttons({ id: 'cancel', label: 'Cancel' }),
      ],
      '…',
      'busy',
    )
  }
  if (v.step === 'history') {
    const rows: TabNode[] = list.length === 0 ? [text('No upgrades yet.', { isDim: true })] : list.map(x => buttons({ id: `h-${x.id}`, label: historyRow(x, 40 + historyRow(x, 0).when.length + 2).text }))
    return tab([text('Recent upgrades', { isBold: true, color: 'accent' }), text('Pick one to see it again.', { isDim: true }), ...rows, buttons({ id: 'close', label: 'Close' })], autoBadge, 'idle')
  }
  if (v.step === 'reading' || v.step === 'rewrite') {
    const given = v.answers.filter(a => a !== null && a.kind !== 'skip').length
    const line =
      v.step === 'reading'
        ? 'Reading your prompt and choosing the questions that would help most…'
        : `Writing the upgrade from your prompt${given > 0 ? ` and ${given} ${given === 1 ? 'answer' : 'answers'}` : ''}…`
    return tab([text(line, { color: 'accent' }), buttons({ id: 'cancel', label: 'Cancel', hotkey: 'c' }), card('Your prompt', [text(v.original, { isDim: true })])], '…', 'busy')
  }
  if (v.step === 'error') {
    const what = v.failed === 'rewrite' ? 'writing the upgrade' : 'choosing the questions'
    return tab(
      [
        card('Something went wrong', [text(`Something went wrong while ${what}.`, { color: 'warn' }), text('Your prompt is safe. Nothing was sent.'), ...(v.note ? [text(v.note, { isDim: true })] : [])], 'bad'),
        buttons({ id: 'retry', label: 'Try again', isPrimary: true, hotkey: 't' }, { id: 'original', label: 'Send my original' }, { id: 'cancel', label: 'Cancel', hotkey: 'c' }),
        card('Your prompt', [text(v.original, { isDim: true })]),
      ],
      '!',
      'warn',
    )
  }
  if (v.step === 'questions') {
    const done = v.answers.filter(a => a !== null).length
    const qs: TabNode[] = v.questions.map((q, i) => {
      const a = v.answers[i] ?? null
      const picked = a !== null && a.kind !== 'skip' ? a.value : null
      const status = a === null ? '' : a.kind === 'skip' ? ' · skipped' : ' · answered'
      const body: TabNode[] = [
        text(q.text, a === null ? { isBold: true } : { isDim: true }),
        buttons(
          ...q.options.map((opt, j) => ({ id: `o-${i}-${j}`, label: picked === opt && a?.kind === 'option' ? `● ${opt}` : opt })),
          { id: `other-${i}`, label: a?.kind === 'other' && picked ? `● Other: ${picked}` : 'Other…' },
          { id: `skip-${i}`, label: 'Skip' },
        ),
        ...(v.other === i ? [{ kind: 'input' as const, id: `other-input-${i}`, placeholder: 'Type your answer' }] : []),
      ]
      return card(`Question ${i + 1} of ${v.questions.length}${status}`, body, a === null ? 'accent' : a.kind === 'skip' ? undefined : 'ok')
    })
    return tab(
      [
        text('A few quick questions. Answer what you can and skip the rest.', { color: 'accent' }),
        ...qs,
        text(`${done} of ${v.questions.length} answered`, { isDim: true }),
        buttons({ id: 'upgrade', label: done > 0 ? 'Upgrade now' : 'Skip the questions, upgrade now', isPrimary: true }, { id: 'cancel', label: 'Cancel' }),
      ],
      `${done}/${v.questions.length}`,
      'warn',
    )
  }
  // review
  const before = wordCount(v.original)
  const after = wordCount(v.upgraded)
  return tab(
    [
      card('Your upgraded prompt', [text(v.upgraded)], 'accent'),
      buttons(
        { id: 'run', label: 'Run it', isPrimary: true, hotkey: 'r' },
        { id: 'edit', label: 'Edit', hotkey: 'e' },
        { id: 'copy', label: 'Copy', hotkey: 'y' },
        { id: 'cancel', label: v.fromHistory ? 'Close' : 'Cancel', hotkey: 'c' },
      ),
      ...(v.flash ? [text(v.flash, { color: 'ok' as const })] : []),
      ...(v.added.length > 0 ? [card('What changed', v.added.map(a => text(`+ ${a}`, { color: 'ok' })), 'ok')] : []),
      card('Your original', [text(v.original, { isDim: true })]),
    ],
    '✦',
    'ok',
    reviewPills(before, after, v.added.length),
  )
}

// A tab id, or `/better --<id> [text]`, as an action: the id, and the text an input sent.
export type Press = { id: string; value?: string }
export function pressOf(args: string): Press | null {
  const m = /^--([\w:.-]+)(?:\s+([\s\S]*))?$/.exec(args.trim())
  if (!m || m[1] === undefined) return null
  return m[2] === undefined ? { id: m[1] } : { id: m[1], value: m[2] }
}
