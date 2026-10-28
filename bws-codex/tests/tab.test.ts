// The Codex tab on a stubbed engine: what it publishes, its command twins (a test cannot write bws-cockpit's tabEvent,
// so a press runs `/codex --<id> [text]`, the same action), both chat engines, pull and send back.
import { describe, expect, test } from 'claude-code/testing'

import { COMMON, TOP, buttonIds, finishTurn, texts, world } from './world'
import type { Fetch, Tab } from './world'

// Built from parts so the repo's publish scan does not read the fixture as a real key.
const KEY = ['sk', 'test', 'Zz9Yy8Xx7Ww6Vv5'].join('-')
const MASKED = ['sk', 'test', '**********Vv5'].join('-')
const WITH_KEY = { options: { openaiApiKey: KEY } }

type Dollar = { command: { run: (i: never) => Promise<unknown> } }
const run = ($: Dollar, args: string) => $.command.run({ command: 'codex', args } as never) as Promise<{ text?: string }>
const last = (w: { seen: { tabs: Tab[] } }) => w.seen.tabs.at(-1)
const dirOf = (id: string) => `${COMMON}/bws-codex/jobs/${id}`
const idOfDir = (dir: string | undefined) => (dir ?? '').split('/').pop() ?? ''
const message = (text: string) => ({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] })

// OpenAI as the api engine sees it: each POST is a new queued response; its first poll is in progress, its second done.
function openai(answers: string[]) {
  let posts = 0
  const polls = new Map<string, number>()
  return (f: Fetch) => {
    if (f.method === 'POST' && f.url === 'https://api.openai.com/v1/responses') {
      posts += 1
      return { status: 200, body: { id: `resp_${posts}`, status: 'queued', output: [] } }
    }
    const cancel = /\/v1\/responses\/(resp_\d+)\/cancel$/.exec(f.url)
    if (cancel) return { status: 200, body: { id: cancel[1], status: 'cancelled', output: [] } }
    const get = /\/v1\/responses\/resp_(\d+)$/.exec(f.url)
    if (get && f.method === 'GET') {
      const id = `resp_${get[1]}`
      const n = (polls.get(id) ?? 0) + 1
      polls.set(id, n)
      if (n === 1) return { status: 200, body: { id, status: 'in_progress', output: [] } }
      const usage = { input_tokens: 2400, output_tokens: 40, input_tokens_details: { cached_tokens: 1200 }, output_tokens_details: { reasoning_tokens: 10 } }
      return { status: 200, body: { id, status: 'completed', model: 'gpt-6.1-sol', output: [message(answers[Number(get[1]) - 1] ?? 'ok')], usage } }
    }
    return { status: 404, body: { error: { message: 'unknown path', type: 'invalid_request_error', code: null } } }
  }
}

describe('the Codex tab', () => {
  test('published at session start; /codex opens it on Chat, /cx is the same; twins switch views', { options: {} }, async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: TOP, isInteractive: true } as never)
    expect(w.seen.commands).toEqual(['codex', 'cx'])
    expect(last(w)?.title).toBe('Codex')
    expect(last(w)?.open).toBeUndefined()

    expect(await run($, '')).toEqual({})
    expect(last(w)?.open).toBe(1)
    expect(texts(last(w))).toContain('💬 Codex chat')
    // No key: the chat starts on the codex engine.
    expect(texts(last(w))).toContain('🧰 codex exec · new thread (its own worktree)')

    await $.command.run({ command: 'cx', args: 'jobs' } as never)
    expect(last(w)?.open).toBe(2)
    expect(texts(last(w))).toContain('🧰 Codex jobs')
    await run($, '--chat')
    expect(texts(last(w))).toContain('💬 Codex chat')
    expect(last(w)?.open).toBe(2)
  })

  test('the api engine needs the key: without one, the switch refuses and says where to set it', { options: {} }, async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: TOP, isInteractive: true } as never)
    await run($, '--engine-api')
    expect(w.seen.toasts.at(-1)).toContain('the api engine needs the openaiApiKey option')
    expect(texts(last(w))).toContain('🧰 codex exec · new thread (its own worktree)')
  })
})

describe('the api engine', () => {
  test('a turn: a stored background response with the brief and the capsule, polled to its answer; the next turn chains', WITH_KEY, async ($, on) => {
    const w = world(on, { api: openai(['The lock is fine.', 'Queue it.']) })
    await $.session.start({ cwd: TOP, isInteractive: true } as never)
    expect(texts(last(w))).toContain('🌐 api · gpt-6.1-sol · low · new thread')

    await run($, '--ask-0 is the lock safe?')
    await w.clock.advance(100)
    const post = w.seen.fetches[0]
    expect(post?.method).toBe('POST')
    expect(post?.headers.Authorization).toBe(`Bearer ${KEY}`)
    expect(post?.headers['Content-Type']).toBe('application/json')
    const body = post?.body ?? {}
    expect([body.model, body.store, body.background, body.max_output_tokens, body.reasoning]).toEqual(['gpt-6.1-sol', true, true, 8000, { effort: 'low' }])
    expect(String(body.instructions)).toContain('beside Claude Code')
    expect(body.previous_response_id).toBeUndefined()
    const input = String(body.input)
    expect(input.startsWith('<workspace path="C:/src/app" note="Claude\'s working tree">\nbranch: main, ahead 1 of origin/main\n')).toBe(true)
    expect(input).toContain('dirty files (2): M src/calc.py · ?? notes.md')
    expect(input.endsWith('\n\nis the lock safe?')).toBe(true)
    expect(texts(last(w))).toContain('🤔 Codex is thinking… 0s · queued')
    expect(last(w)?.isPinnedEnd).toBe(true)

    await w.clock.advance(1000)
    expect(w.seen.fetches[1]?.url).toBe('https://api.openai.com/v1/responses/resp_1')
    expect(w.seen.fetches[1]?.headers['Content-Type']).toBeUndefined()
    expect(texts(last(w))).toContain('🤔 Codex is thinking… 1s · in progress')
    await w.clock.advance(1000)
    const t = last(w)
    expect(texts(t)).toContain('The lock is fine.')
    expect(texts(t)).toContain('api · gpt-6.1-sol · 2s · 2400 in (50% cached) · 40 out')
    expect(buttonIds(t)).toContain('send-1')
    expect(texts(t).some(s => s.startsWith('🌐 api · gpt-6.1-sol · low · chained on resp_1'))).toBe(true)
    // The poll stopped with the answer.
    const polls = w.seen.fetches.length
    await w.clock.advance(5000)
    expect(w.seen.fetches.length).toBe(polls)

    await run($, '--model-fast')
    await run($, '--ask-1 and the queue?')
    await w.clock.advance(3000)
    const second = w.seen.fetches.find(f => f.method === 'POST' && f.body?.input !== body.input)?.body ?? {}
    expect([second.model, second.previous_response_id, second.reasoning]).toEqual(['gpt-6.1-terra', 'resp_1', { effort: 'none' }])
    expect(String(second.instructions)).toContain('beside Claude Code')
    expect(texts(last(w))).toContain('Queue it.')
    expect(JSON.stringify(w.seen.tabs)).not.toContain(KEY)

    // New thread drops the chain.
    await run($, '--new')
    await run($, '--ask-0 fresh start')
    await w.clock.advance(100)
    expect(w.seen.fetches.filter(f => f.method === 'POST').at(-1)?.body?.previous_response_id).toBeUndefined()
  })

  test('OpenAI\'s errors show without the key; Stop cancels the response at OpenAI', WITH_KEY, async ($, on) => {
    const bad = { error: { message: `Incorrect API key provided: ${MASKED}.`, type: 'invalid_request_error', code: 'invalid_api_key', param: null } }
    let isBad = true
    const good = openai(['never seen'])
    const w = world(on, { api: f => (isBad ? { status: 401, body: bad } : good(f)) })
    await $.session.start({ cwd: TOP, isInteractive: true } as never)
    await run($, '--ask-0 hello')
    await w.clock.advance(100)
    expect(texts(last(w))).toContain('❗ OpenAI 401 invalid_api_key: Incorrect API key provided: sk-….')
    expect(JSON.stringify(w.seen.tabs)).not.toContain('*****')
    expect(JSON.stringify(w.seen.tabs)).not.toContain(KEY)

    isBad = false
    await run($, '--ask-1 again')
    await w.clock.advance(100)
    await run($, '--stop')
    await w.clock.advance(100)
    expect(w.seen.fetches.at(-1)?.url).toBe('https://api.openai.com/v1/responses/resp_1/cancel')
    expect(texts(last(w))).toContain('ℹ️ Stopped.')
    expect(buttonIds(last(w))).not.toContain('stop')
    const n = w.seen.fetches.length
    await w.clock.advance(3000)
    expect(w.seen.fetches.length).toBe(n)
  })
})

describe('pull from Claude and send back', () => {
  test('Pull attaches Claude\'s latest reply to the next message; Send back puts the answer in Claude\'s prompt box', WITH_KEY, async ($, on) => {
    const messages = [
      { role: 'user' as const, text: 'Add a lock.' },
      { role: 'assistant' as const, text: 'Added a lock around the queue in src/q.py.' },
    ]
    const w = world(on, { api: openai(['The lock is fine.']), messages })
    await $.session.start({ cwd: TOP, isInteractive: true } as never)
    await run($, '--send-back')
    expect(w.seen.toasts.at(-1)).toBe('Codex chat: no answer to send back yet.')

    await run($, '--pull')
    await w.clock.advance(100)
    expect(texts(last(w))).toContain("📎 attached to the next message: Claude's latest reply (42 characters)")
    await run($, '--ask-0 is this right?')
    await w.clock.advance(100)
    const input = String(w.seen.fetches[0]?.body?.input)
    expect(input).toContain("Claude's latest reply, pulled in by the developer:\n<claude>\nAdded a lock around the queue in src/q.py.\n</claude>\n\nis this right?")
    expect(texts(last(w)).some(s => s.startsWith('📎 attached'))).toBe(false)
    await w.clock.advance(2000)

    expect(await run($, '--send-back')).toEqual({})
    expect(w.seen.fills).toEqual([])
    await w.clock.advance(20)
    expect(w.seen.fills).toEqual([{ text: 'Codex (side chat) says:\n\nThe lock is fine.', mode: 'replace' }])
    expect(w.seen.toasts.at(-1)).toBe("Codex's answer is in Claude's prompt box: Enter sends it to Claude.")
  })

  test('Send back after a draft appends; /codex pull turns <question> sends at once', WITH_KEY, async ($, on) => {
    const messages = [
      { role: 'user' as const, text: 'Plan it.' },
      { role: 'assistant' as const, text: 'Step 1, step 2.' },
    ]
    const w = world(on, { api: openai(['Good plan.']), messages, box: 'my draft' })
    await $.session.start({ cwd: TOP, isInteractive: true } as never)
    await run($, 'pull turns any gaps?')
    await w.clock.advance(100)
    expect(String(w.seen.fetches[0]?.body?.input)).toContain("Claude's last 2 messages, pulled in by the developer:\n<claude>\nDeveloper: Plan it.\n\nClaude: Step 1, step 2.\n</claude>\n\nany gaps?")
    await w.clock.advance(2000)
    await run($, 'send-back')
    await w.clock.advance(20)
    expect(w.seen.fills).toEqual([{ text: '\n\nCodex (side chat) says:\n\nGood plan.', mode: 'append' }])
  })
})

describe('the codex engine', () => {
  test('a message starts a chat job in its own worktree with the brief; its answer lands in the chat, never as a wake', { options: {} }, async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: TOP, isInteractive: true } as never)
    await run($, '--ask-0 what does calc do?')
    await w.clock.advance(100)
    const launch = w.seen.runs.find(a => a[2] === 'launch')
    const id = idOfDir(launch?.[3])
    expect(id).toMatch(/^chat-[0-9a-f]{6}$/)
    expect(w.seen.runs).toContainEqual(['git', '-C', TOP, 'worktree', 'add', '-b', `codex/${id}`, `C:/src/app.codex-worktrees/${id}`, '0123456789abcdef0123456789abcdef01234567'])
    const files = (JSON.parse(w.seen.stdins.at(-1) ?? '{}') as { files: Record<string, string> }).files
    const prompt = files['turn-1.prompt.txt'] ?? ''
    expect(prompt).toContain(`You are in your own git worktree on branch codex/${id}`)
    expect(prompt).toContain('<workspace path="C:/src/app"')
    expect(prompt.trim().endsWith('what does calc do?')).toBe(true)
    const record = JSON.parse(files['job.json'] ?? '{}') as { kind?: string; effort?: string }
    expect([record.kind, record.effort]).toEqual(['chat', 'low'])
    expect(texts(last(w))).toContain('🤔 Codex is thinking… 0s · starting')

    await $.turn.complete({} as never)
    finishTurn(w.files, dirOf(id), 1, w.clock.now(), 'calc adds two numbers.')
    await w.clock.advance(4000)
    expect(texts(last(w))).toContain('calc adds two numbers.')
    expect(texts(last(w)).some(s => s.startsWith('codex exec · gpt-6.1-sol · '))).toBe(true)
    await w.clock.advance(60_000)
    expect(w.seen.submits).toEqual([])
    expect(w.seen.toasts.some(t => t.includes(id))).toBe(false)

    // The next message resumes the same thread; its prompt is the capsule and the message only.
    await run($, '--ask-1 now rename add')
    await w.clock.advance(100)
    const next = (JSON.parse(w.seen.stdins.at(-1) ?? '{}') as { files: Record<string, string> }).files
    const spec = JSON.parse(next['turn-2.json'] ?? '{}') as { argv: string[] }
    expect(spec.argv.slice(1, 4)).toEqual(['exec', 'resume', 'thread-1'])
    expect(next['turn-2.prompt.txt']?.startsWith('<workspace path="C:/src/app"')).toBe(true)
    expect(next['turn-2.prompt.txt']).not.toContain('You are Codex')
  })
})

describe('the Jobs view', () => {
  test('a delegated job shows up and updates; Diff reads the folder without reporting the turn; Merge fills the prompt; Drop removes it', { options: {} }, async ($, on) => {
    const w = world(on)
    await $.session.start({ cwd: TOP, isInteractive: true } as never)
    const r = await $.tool.call({ tool: 'mcp__bws-codex__codex_delegate', prompt: 'Fix add() in src/calc.py.', title: 'Fix calc', effort: 'low' } as never)
    const id = /codex job ([a-z0-9-]+)/.exec(String(r.result))?.[1] ?? ''
    await run($, 'jobs')
    expect(texts(last(w))).toContain(`⏳ Fix calc · ${id}`)
    expect(buttonIds(last(w))).toEqual(['chat', 'refresh', `diff-${id}`, `cancel-${id}`])
    expect(last(w)?.badge).toBe('1▶')

    await $.turn.complete({} as never)
    finishTurn(w.files, dirOf(id), 1, w.clock.now(), 'Fixed add(); 2 tests pass.')
    await run($, `--diff-${id}`)
    expect(texts(last(w))).toEqual(expect.arrayContaining([' src/calc.py | 2 +-', 'Codex says:', 'Fixed add(); 2 tests pass.']))
    expect(buttonIds(last(w))).toEqual(['chat', 'refresh', `diff-${id}`, `follow-${id}`, `merge-${id}`, `drop-${id}`])
    // Diff did not count the turn as reported: the wake still comes.
    await w.clock.advance(4000)
    expect(w.seen.submits.length).toBe(1)
    expect(texts(last(w)).some(s => s.startsWith('done in') && s.includes(`codex/${id} · 1 file +1 -1`))).toBe(true)

    await run($, `--merge-${id}`)
    await w.clock.advance(20)
    expect(w.seen.fills[0]?.text.startsWith(`Merge Codex job ${id} ("Fix calc") from branch codex/${id}.`)).toBe(true)

    await run($, `--follow-${id}`)
    expect(JSON.stringify(last(w)?.body)).toContain(`"id":"fu-${id}-0"`)
    await run($, `--drop-${id}`)
    expect(w.seen.toasts.at(-1)).toBe(`Removed the worktree C:/src/app.codex-worktrees/${id}.`)
    expect(texts(last(w))).toContain('👋 No Codex jobs in this repository yet')
  })
})
