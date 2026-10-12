import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { SideChat, SideMsg } from '../types'
import { askKey, clampBack, exitNote, killArgv, nativeArgs, parseSide, reduceLine, roomOf, scrollStep, sideArgs, splitLines, transcriptRows, windowRows } from './side'
import type { Draft, SideConfig } from './side'

const PANE = 'sidechat'
const TITLE = 'Side chat'

const EMPTY: SideChat = { mainId: null, sideId: null, msgs: [], live: '', isForked: false, isBusy: false, back: 0, asks: 0, isClosedByPerson: false }
const chat = atom({ plugin: 'bws-sidechat', key: 'chat' } as const, EMPTY)

// Module variables: the running child's identity and whether the person pressed Stop. A new fork or a close
// bumps `runNo`, so the loop of a child that was left behind stops writing into the chat.
let runNo = 0
let isStopped = false
let isInitSeen = false // the running child has printed its init line, so its session file exists

// Opened inside the command's own dispatch, so the engine counts it as asked and places it at any width (a deferred
// open counts as unasked and waits below 144 columns).
async function openPane($: EngineInterface) {
  await update($, chat, c => ({ ...c, isClosedByPerson: false }))
  const r = await $.ui.open({ id: PANE, title: TITLE })
  if (!r.isPlaced) $.ui.toast(`Side chat not shown (${r.reason}).`)
  focusSoon($)
}

// Keyboard focus is a request: it is granted over an empty composer, and the engine hands the keys back to the prompt
// once the command that opened the pane has returned. So it is asked again a few times after that, each time only
// while the box is still empty (the person who has started typing keeps the keys), then the ring goes to the Ask box.
function focusSoon($: EngineInterface) {
  for (const ms of [10, 250, 800]) $.clock.after(ms, () => void focusPane($).catch(() => undefined))
}

async function focusPane($: EngineInterface) {
  const pane = (await $.ui.panes()).find(p => p.id === PANE)
  if (pane === undefined || pane.isFocused) return
  if ((await $.prompt.read()).text.trim() !== '') return
  await $.ui.open({ id: PANE, title: TITLE, focus: true })
  await focusAsk($)
}

async function focusAsk($: EngineInterface) {
  const c = await read($, chat)
  await settle($.ui.focus({ requestId: PANE, key: askKey(c.asks) }))
}

// After Stop: the Stop button held the ring and is gone, and the engine hands the keys back to the prompt (while it
// still reports the pane as focused, so that flag cannot be trusted here). A ring move is denied for a site that does
// not hold the keyboard, so the keys are asked for again, as when the pane opens, only over an empty box, and then the
// ring goes to the Ask box.
async function refocusAsk($: EngineInterface) {
  if ((await $.ui.panes()).find(p => p.id === PANE) === undefined) return
  if ((await $.prompt.read()).text.trim() !== '') return
  await $.ui.open({ id: PANE, title: TITLE, focus: true })
  await focusAsk($)
}

// The keys come back to the prompt a moment after the Stop button is redrawn away, so the request is repeated as the
// pane settles, as focusSoon does when it opens.
function refocusSoon($: EngineInterface) {
  void settle(refocusAsk($))
  for (const ms of [10, 250, 800]) $.clock.after(ms, () => void refocusAsk($).catch(() => undefined))
}

// Ends the side chat's child at once. The stream ends it only when the next piece arrives, and a child that is
// thinking sends none; the session id is in every argv of the child, so it is found by that.
async function killChild($: EngineInterface, sideId: string | null) {
  if (sideId === null) return
  const argv = killArgv(sideId, (await $.env.get('OS')) === 'Windows_NT')
  if (argv !== null) await settle($.process.run(argv, { timeoutMs: 15000 }))
}

// Throws away the current side chat (its child is killed) and forks the conversation as it is now, on the first message.
async function newFork($: EngineInterface) {
  runNo++
  const old = await read($, chat)
  if (old.isBusy) await killChild($, old.sideId)
  const mainId = await $.session.id()
  await update($, chat, () => ({ ...EMPTY, mainId, sideId: crypto.randomUUID() }))
}

async function closePane($: EngineInterface) {
  runNo++
  const old = await read($, chat)
  if (old.isBusy) await killChild($, old.sideId)
  await update($, chat, c => ({ ...c, isBusy: false, live: '', isClosedByPerson: true }))
  await $.ui.close({ id: PANE })
}

function configOf(options: Record<string, unknown>): SideConfig & { exe: string } {
  return {
    tools: String(options.sideTools ?? 'Read,Glob,Grep,WebFetch,WebSearch'),
    isMcpOff: options.loadMcpServers !== true,
    model: String(options.sideModel ?? ''),
    exe: String(options.claudePath ?? 'claude').trim() || 'claude',
  }
}

// One side turn: the message goes to a headless `claude -p` that forks (first turn) or resumes (later ones) the side
// session. The main conversation is never written to.
async function send($: EngineInterface, text: string, cfg: SideConfig & { exe: string }) {
  const message = text.trim()
  if (message === '') return
  let c = await read($, chat)
  if (c.isBusy) return void $.ui.toast('Side chat: still answering. Stop it first, or wait.')
  if (c.sideId === null || c.mainId === null) {
    await newFork($)
    c = await read($, chat)
  }
  const mainId = c.mainId as string
  const sideId = c.sideId as string
  const mine = ++runNo
  isStopped = false
  isInitSeen = false
  const isFirst = !c.isForked
  let draft: Draft = { msgs: [...c.msgs, { role: 'user', text: message }], live: '' }
  await update($, chat, old => ({ ...old, ...draft, isBusy: true, back: 0, asks: old.asks + 1 }))
  void settle(focusAsk($))

  let pending = ''
  let stderr = ''
  let code: number | null = 0
  const stream = $.process.spawn({
    argv: [cfg.exe, ...sideArgs({ message, mainId, sideId, isFirst }, cfg)],
    // No mods in the child: it starts faster, and cannot open a side chat of its own.
    env: { CLAUDE_CODE_PLUGIN_DIRS: '' },
  })
  try {
    for (;;) {
      const step = await stream.next()
      if (mine !== runNo || isStopped) break
      if (step.done) {
        code = step.value.code
        break
      }
      if (step.value.stream === 'stderr') {
        stderr += step.value.text
        continue
      }
      const split = splitLines(pending, step.value.text)
      pending = split.rest
      if (split.lines.length === 0) continue
      for (const line of split.lines) {
        if (line.includes('"subtype":"init"')) isInitSeen = true
        draft = reduceLine(draft, line)
      }
      const snap = draft
      await update($, chat, old => (mine === runNo ? { ...old, msgs: snap.msgs, live: snap.live } : old))
    }
  } catch (err) {
    code = -1
    stderr += String(err)
  } finally {
    await settle(stream.return(undefined as never))
  }
  if (mine !== runNo) return // a new fork or a close took over
  const note = isStopped ? 'Stopped.' : exitNote(code, stderr)
  const extra: SideMsg[] = note === null ? [] : [{ role: 'note', text: note }]
  const shown = draft.live.trim() === '' || isStopped ? [] : [{ role: 'assistant', text: draft.live.trim() } as SideMsg]
  await update($, chat, old => ({
    ...old,
    msgs: [...draft.msgs, ...shown, ...extra],
    live: '',
    isBusy: false,
    isForked: old.isForked || isInitSeen || code === 0,
  }))
}

async function stop($: EngineInterface) {
  const c = await read($, chat)
  if (!c.isBusy) return
  isStopped = true
  runNo++
  await update($, chat, (old): SideChat => ({
    ...old,
    msgs: [...old.msgs, ...(old.live.trim() === '' ? [] : [{ role: 'assistant', text: old.live.trim() } as SideMsg]), { role: 'note', text: 'Stopped.' } as SideMsg],
    live: '',
    isBusy: false,
    isForked: old.isForked || isInitSeen,
  }))
  refocusSoon($) // before the kill, which takes seconds: the Ask box has the keyboard at once
  await killChild($, c.sideId)
}

async function settle<T>(p: Promise<T>): Promise<T | undefined> {
  try {
    return await p
  } catch {
    return undefined
  }
}

// The hotkey and the footer button: open the side chat (continuing the one there is), or take the keys back to it.
async function summon($: EngineInterface) {
  if (!(await isDrawn($))) return
  await openPane($)
}

// Headless runs draw nothing: leave the built-in commands to Claude Code (and keep a side-of-side from starting).
async function isDrawn($: EngineInterface) {
  return (await $.session.surfaces()).length > 0
}

export const register: Register = (on, options) => {
  const cfg = configOf(options as Record<string, unknown>)
  const takesFork = options.takeOverFork !== false
  const takesBtw = options.takeOverBtw !== false
  const action = String(options.chordAction ?? '').trim()

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'side',
      description: 'Side chat in the right-hand pane, forked from this conversation',
      argumentHint: '[new [message] | close | message]',
      immediate: true,
    })
    return next(e)
  })

  // /side: open the pane, continue the side chat, start a new fork, or close it.
  on('command.run', { command: 'side' }, async ($, e) => {
    if (!(await isDrawn($))) return { text: 'The side chat needs a terminal or Desktop window to draw in.' }
    const cmd = parseSide(e.args)
    if (cmd.kind === 'close') {
      await closePane($)
      return {}
    }
    if (cmd.kind === 'new') {
      await newFork($)
      await openPane($)
      if (cmd.message !== '') $.clock.after(60, () => void send($, cmd.message, cfg))
      return {}
    }
    await openPane($)
    if (cmd.kind === 'send') $.clock.after(60, () => void send($, cmd.message, cfg))
    return {}
  })

  // /fork and /branch: a fresh fork of the conversation as it stands, in the pane. `/fork native` runs the built-in.
  for (const name of ['fork', 'branch'] as const) {
    on('command.run', { command: name }, async ($, e, next) => {
      if (!takesFork || !(await isDrawn($))) return next(e)
      const rest = nativeArgs(e.args)
      if (rest !== null) return next({ ...e, args: rest })
      await newFork($)
      await openPane($)
      const message = e.args.trim()
      if (message !== '') $.clock.after(60, () => void send($, message, cfg))
      return {}
    })
  }

  // /btw <question>: the answer comes in the side chat. An open side chat is continued; none open, a fork is taken.
  on('command.run', { command: 'btw' }, async ($, e, next) => {
    if (!takesBtw || !(await isDrawn($))) return next(e)
    const question = e.args.trim()
    const c = await read($, chat)
    if (c.sideId === null) await newFork($)
    await openPane($)
    if (question !== '') $.clock.after(60, () => void send($, question, cfg))
    return {}
  })

  // The hotkey. A mod cannot bind a chord itself, but a Button can borrow one of the engine's keybinding actions: the
  // footer carries a small "side" button, and the chord the person binds to `chordAction` in ~/.claude/keybindings.json
  // (Global) presses it from the prompt. It opens the pane, or takes the keys back to it, with no command typed.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    if (action === '' || e.surface !== 'terminal') return next(e)
    // The footer holds one tree: share it. Another mod's footer (whatever next(e) draws) stays beside ours; with none,
    // the engine's own mode labels are drawn here, as the engine would.
    const drawn = await settle(next(e))
    const { Box, Button, Text } = $.ui.resolve(e)
    const other = drawn !== undefined && drawn.type !== 'engine' ? drawn : null
    return (
      <Box flexDirection="row" gap={1}>
        {other ?? (e.props.modes.length > 0 ? <Text dimColor>{e.props.modes.join(' & ')}</Text> : null)}
        <Button key="side" plain dimColor label="◨ side" action={action} onPress={() => void summon($)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Box, Text, Button } = table
    const Input = e.surface !== 'mobile' && 'Input' in table ? table.Input : null
    const c = await read($, chat)
    const width = Math.max(20, (e.props.bodyColumns ?? 80) - 2)
    // The transcript is drawn as rows no wider than the pane, so the rows are counted exactly and the header, the
    // scroll buttons, Stop and the Ask box always keep the rows roomOf leaves them, however long an answer is.
    const room = roomOf(e.props.scroll?.bodyRows ?? 24)
    const rows = transcriptRows(c.msgs, c.live, width)
    const back = clampBack(c.back, rows.length, room)
    const win = windowRows(rows.length, room, back)
    const step = scrollStep(room)
    const from = c.mainId === null ? 'not forked yet' : `forked from ${c.mainId.slice(0, 8)}`

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" columnGap={1} flexWrap="wrap">
          <Text bold>Side chat</Text>
          <Text dimColor>{from}</Text>
          <Button key="new" label="New fork" plain dimColor onPress={() => void newFork($)} />
          <Button key="close" label="Close" plain dimColor onPress={() => void closePane($)} />
        </Box>
        {rows.length === 0 && !c.isBusy && (
          <Text dimColor wrap="wrap">
            {'A copy of this conversation. Ask anything below; the main conversation is not touched. /fork starts a fresh copy.'}
          </Text>
        )}
        {win.above > 0 && (
          <Button key="older" label={`↑ ${win.above} rows above`} plain dimColor onPress={() => update($, chat, old => ({ ...old, back: clampBack(back + step, rows.length, room) }))} />
        )}
        {rows.slice(win.from, win.to).map((r, i) => (
          <Text
            key={`r-${win.from + i}`}
            wrap="truncate-end"
            bold={r.kind === 'you' || r.kind === 'claude'}
            dimColor={r.kind === 'tool' || r.kind === 'note'}
            color={r.kind === 'you' ? 'success' : r.kind === 'note' ? 'warning' : undefined}
          >
            {r.text === '' ? ' ' : r.text}
          </Text>
        ))}
        {win.below > 0 && (
          <Button key="newer" label={`↓ ${win.below} rows below`} plain dimColor onPress={() => update($, chat, old => ({ ...old, back: clampBack(back - step, rows.length, room) }))} />
        )}
        {c.isBusy && (
          <Box flexDirection="row" columnGap={1}>
            <Text dimColor>{c.live === '' ? 'thinking…' : 'answering…'}</Text>
            <Button key="stop" label="Stop" plain dimColor onPress={() => void stop($)} />
          </Box>
        )}
        {Input ? (
          <Input
            key={askKey(c.asks)}
            label="Ask › "
            placeholder={c.isBusy ? 'wait for the answer…' : 'ask in the side chat, Enter sends'}
            submitLabel="send"
            onSubmit={(text: string) => void send($, text, cfg)}
          />
        ) : (
          <Text dimColor wrap="wrap">{'Type /side <message> in the prompt box to ask.'}</Text>
        )}
      </Box>
    )
  })
}
