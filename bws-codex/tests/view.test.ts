import { describe, expect, test } from 'claude-code/testing'

import { emptyChat, withMsgs } from '../hooks/chat'
import type { Chat } from '../hooks/chat'
import type { Job } from '../hooks/job'
import { codexSummary, codexTab, mergeHint } from '../hooks/view'
import type { TabView } from '../hooks/view'
import { JOB } from './fixtures'
import { buttonIds, flat, texts } from './world'
import type { Tab } from './world'

const NOW = 2_000_000
const DONE: Job = { ...JOB, state: 'done', endedAt: NOW - 60_000, turnStartedAt: NOW - 150_000, diffstat: { files: 1, insertions: 1, deletions: 1 }, threadId: 't' }
const CHAT_JOB: Job = { ...JOB, id: 'chat-a1b2c3', title: 'chat', branch: 'codex/chat-a1b2c3', kind: 'chat', state: 'running' }

const v = (o: Partial<TabView> = {}): TabView => ({
  view: 'chat',
  chat: emptyChat('api'),
  jobs: [],
  now: NOW,
  hasKey: true,
  repo: 'C:/src/app',
  phases: {},
  expanded: null,
  following: null,
  detail: null,
  follows: 0,
  show: 0,
  open: 0,
  raise: 0,
  isPin: false,
  ...o,
})
const tab = (o: Partial<TabView> = {}) => codexTab(v(o)) as unknown as Tab
const inputs = (t: Tab) => flat(t.body).filter(n => n.kind === 'input')

describe('the Chat view', () => {
  test('an empty api chat: engine and model switches, tips, and the focused Ask box', () => {
    const t = tab()
    expect(t.title).toBe('Codex')
    expect(t.badge).toBe('')
    expect(t.tone).toBe('idle')
    expect(buttonIds(t)).toEqual(['jobs', 'new', 'pull', 'pull-turns', 'send-back', 'engine-api', 'engine-codex', 'model-default', 'model-fast'])
    expect(texts(t)).toContain('🌐 api · gpt-6.1-sol · low · new thread')
    expect(texts(t)).toContain('👋 Ask Codex on the side')
    expect(inputs(t)).toEqual([{ kind: 'input', id: 'ask-0', placeholder: '💭 ask Codex, Enter sends', isFocused: true }])
  })

  test('no key: the api button says so and the Ask box points at the option', () => {
    const t = tab({ hasKey: false })
    const labels = flat(t.body).flatMap(n => n.items ?? []).map(b => b.label)
    expect(labels).toContain('● api')
    const codex = tab({ hasKey: false, chat: emptyChat('codex') })
    expect(flat(codex.body).flatMap(n => n.items ?? []).map(b => b.label)).toContain('api (no key)')
    expect(inputs(t)[0]?.id).toBe('ask-0')
    expect(JSON.stringify(t.body)).toContain('set the openaiApiKey option')
  })

  test('messages: your cards, Codex\'s cards with a Send back button each, notes; a pending answer and Stop', () => {
    const chat: Chat = {
      ...withMsgs(
        emptyChat('api'),
        { role: 'user', text: 'is it safe?' },
        { role: 'codex', text: 'Yes.', meta: 'api · gpt-6.1-sol · 9s' },
        { role: 'note', text: 'OpenAI 500: x' },
        { role: 'note', text: 'Stopped.', isInfo: true },
      ),
      thread: 'resp_0123456789abcdef',
      asks: 2,
      pending: { id: 'resp_2', engine: 'api', startedAt: NOW - 7000, turn: 0, phase: 'in progress' },
      pulled: { label: "Claude's latest reply", text: 'abc' },
    }
    const t = tab({ chat })
    expect(texts(t)).toEqual(expect.arrayContaining(['🧑 You', '🤖 Codex', 'api · gpt-6.1-sol · 9s', '❗ OpenAI 500: x', 'ℹ️ Stopped.', '🤔 Codex is thinking… 7s · in progress']))
    expect(texts(t)).toContain("📎 attached to the next message: Claude's latest reply (3 characters)")
    expect(texts(t).some(s => s.startsWith('🌐 api · gpt-6.1-sol · low · chained on resp_012345678'))).toBe(true)
    expect(buttonIds(t)).toEqual(expect.arrayContaining(['send-1', 'unpull', 'stop']))
    expect(inputs(t)[0]).toEqual({ kind: 'input', id: 'ask-2', placeholder: '⏳ wait for the answer…', isFocused: true })
    expect(t.badge).toBe('…')
    expect(t.tone).toBe('busy')
    expect(t.isPinnedEnd).toBe(true)
  })

  test('the codex engine names its thread and branch; the fast model is marked', () => {
    const chat: Chat = { ...emptyChat('codex'), thread: CHAT_JOB.id }
    expect(texts(tab({ chat, jobs: [CHAT_JOB] }))).toContain('🧰 codex exec · thread chat-a1b2c3 on codex/chat-a1b2c3')
    const fast = tab({ chat: { ...emptyChat('api'), choice: 'fast' } })
    expect(flat(fast.body).flatMap(n => n.items ?? []).find(b => b.id === 'model-fast')?.label).toBe('● ⚡ terra · none (fast)')
  })

  test('a long chat shows the newest messages that fit in the node budget', () => {
    let chat = emptyChat('api')
    for (let i = 0; i < 80; i++) chat = withMsgs(chat, { role: i % 2 ? 'codex' : 'user', text: `m${i}` })
    const t = tab({ chat })
    expect(texts(t).some(s => /^⋯ \d+ earlier messages not shown$/.test(s))).toBe(true)
    expect(JSON.stringify(t.body)).toContain('m79')
    expect(JSON.stringify(t).length).toBeGreaterThan(0)
    expect(flat(t.body).length).toBeLessThanOrEqual(200)
  })
})

describe('the Jobs view', () => {
  test('a running job: state, branch, diff stat; Diff and Cancel', () => {
    const t = tab({ view: 'jobs', jobs: [{ ...JOB, turnStartedAt: NOW - 100_000 }], phases: { 'fix-calc-3f2a1c': 'editing files' } })
    expect(texts(t)).toContain('⚙️ Fix calc · fix-calc-3f2a1c')
    expect(texts(t)).toContain('running 1m40s · editing files · codex/fix-calc-3f2a1c · no changes')
    expect(buttonIds(t)).toEqual(['chat', 'refresh', 'diff-fix-calc-3f2a1c', 'cancel-fix-calc-3f2a1c'])
    expect(t.badge).toBe('1▶')
    expect(t.tone).toBe('busy')
  })

  test('a done job: Diff, Follow up, Merge and Drop; Diff open shows the stat, Codex\'s message and the merge steps', () => {
    const closed = tab({ view: 'jobs', jobs: [DONE] })
    expect(texts(closed)).toContain('done in 1m30s · codex/fix-calc-3f2a1c · 1 file +1 -1 · 1m00s ago')
    expect(buttonIds(closed)).toEqual(['chat', 'refresh', 'diff-fix-calc-3f2a1c', 'follow-fix-calc-3f2a1c', 'merge-fix-calc-3f2a1c', 'drop-fix-calc-3f2a1c'])
    const stat = ' src/calc.py | 2 +-\n 1 file changed, 1 insertion(+), 1 deletion(-)'
    const open = tab({ view: 'jobs', jobs: [DONE], expanded: DONE.id, detail: { id: DONE.id, stat, message: 'Fixed add().' }, following: DONE.id, follows: 3 })
    expect(texts(open)).toEqual(expect.arrayContaining([' src/calc.py | 2 +-', 'Codex says:', 'Fixed add().']))
    expect(texts(open).some(s => s.startsWith('🔀 Merge Codex job fix-calc-3f2a1c ("Fix calc") from branch codex/fix-calc-3f2a1c.'))).toBe(true)
    expect(flat(open.body).flatMap(n => n.items ?? []).find(b => b.id === `diff-${DONE.id}`)?.label).toBe('🔽 Hide diff')
    expect(inputs(open)).toEqual([{ kind: 'input', id: 'fu-fix-calc-3f2a1c-3', placeholder: '💬 follow-up for job fix-calc-3f2a1c, Enter sends', isFocused: true }])
  })

  test('a job with no changes has no Merge; chat jobs are marked and not counted as running', () => {
    const t = tab({ view: 'jobs', jobs: [{ ...DONE, diffstat: { files: 0, insertions: 0, deletions: 0 } }, CHAT_JOB] })
    expect(buttonIds(t)).not.toContain('merge-fix-calc-3f2a1c')
    expect(texts(t)).toContain('⚙️ 💬 chat · chat-a1b2c3')
    expect(t.badge).toBe('2')
  })

  test('no jobs: how to get one', () => {
    expect(texts(tab({ view: 'jobs' }))).toContain('👋 No Codex jobs in this repository yet')
  })
})

describe('the merge hint and the chip', () => {
  test('the merge steps; carried edits add the stash warning', () => {
    expect(mergeHint(DONE)).toBe(
      'Merge Codex job fix-calc-3f2a1c ("Fix calc") from branch codex/fix-calc-3f2a1c. Review it first: `git -C C:/src/app diff 01234567...codex/fix-calc-3f2a1c` (patch: C:/src/app/.git/bws-codex/jobs/fix-calc-3f2a1c/diff.patch). Then in C:/src/app: `git merge --no-ff codex/fix-calc-3f2a1c`. After merging, codex_cancel {"id": "fix-calc-3f2a1c", "drop": true} removes its worktree.',
    )
    const carried = mergeHint({ ...DONE, carry: { stash: 'abc', commit: 'cafe0000cafe', error: null } })
    expect(carried).toContain('Carried edits:')
    expect(carried).toContain('git stash push -m bws-codex-fix-calc-3f2a1c')
  })

  test('the chip says what runs, and nothing when nothing does', () => {
    expect(codexSummary([{ ...JOB, turnStartedAt: NOW - 5000 }], emptyChat('api'), NOW, { 'fix-calc-3f2a1c': 'thinking' })).toEqual({
      state: 'busy',
      label: 'codex fix-calc-3f2a1c running 5s',
      detail: 'codex: fix-calc-3f2a1c 5s thinking',
    })
    expect(codexSummary([DONE, CHAT_JOB], emptyChat('api'), NOW)).toBeNull()
    expect(codexSummary([], { ...emptyChat('api'), pending: { id: 'r', engine: 'api', startedAt: NOW, turn: 0, phase: '' } }, NOW)?.label).toBe('codex chat thinking')
  })
})
