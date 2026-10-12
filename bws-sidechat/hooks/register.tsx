import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { SideChat, SideMsg } from '../types'
import { ROLE_PREFIX, exitNote, nativeArgs, parseSide, reduceLine, sideArgs, splitLines, windowOf } from './side'
import type { Draft, SideConfig } from './side'

const PANE = 'sidechat'
const TITLE = 'Side chat'

const EMPTY: SideChat = { mainId: null, sideId: null, msgs: [], live: '', isForked: false, isBusy: false, back: 0, isClosedByPerson: false }
const chat = atom({ plugin: 'bws-sidechat', key: 'chat' } as const, EMPTY)

// Module variables: the running child's identity and whether the person pressed Stop. A new fork or a close
// bumps `runNo`, so the loop of a child that was left behind stops writing into the chat.
let runNo = 0
let isStopped = false

// The pane opens after the command has returned, when the composer is clear (focus is granted only then).
async function openPane($: EngineInterface) {
  await update($, chat, c => ({ ...c, isClosedByPerson: false }))
  const isEmpty = (await $.prompt.read()).text.trim() === ''
  const r = await $.ui.open(isEmpty ? { id: PANE, title: TITLE, focus: true } : { id: PANE, title: TITLE })
  if (!r.isPlaced) $.ui.toast(`Side chat not shown (${r.reason}). Widen the terminal, or use /side again.`)
}

function openSoon($: EngineInterface) {
  $.clock.after(10, () => void openPane($).catch(err => $.ui.toast(`Side chat: could not open (${String(err)})`)))
}

// Throws away the current side chat (its child is killed) and forks the conversation as it is now, on the first message.
async function newFork($: EngineInterface) {
  runNo++
  const mainId = await $.session.id()
  await update($, chat, () => ({ ...EMPTY, mainId, sideId: crypto.randomUUID() }))
}

async function closePane($: EngineInterface) {
  runNo++
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
  const isFirst = !c.isForked
  let draft: Draft = { msgs: [...c.msgs, { role: 'user', text: message }], live: '' }
  await update($, chat, old => ({ ...old, ...draft, isBusy: true, back: 0 }))

  let pending = ''
  let stderr = ''
  let code: number | null = 0
  let isInit = false
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
        if (line.includes('"subtype":"init"')) isInit = true
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
    isForked: old.isForked || isInit || code === 0,
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
    isForked: true,
  }))
}

async function settle<T>(p: Promise<T>): Promise<T | undefined> {
  try {
    return await p
  } catch {
    return undefined
  }
}

// Headless runs draw nothing: leave the built-in commands to Claude Code (and keep a side-of-side from starting).
async function isDrawn($: EngineInterface) {
  return (await $.session.surfaces()).length > 0
}

export const register: Register = (on, options) => {
  const cfg = configOf(options as Record<string, unknown>)
  const takesFork = options.takeOverFork !== false
  const takesBtw = options.takeOverBtw !== false

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
      openSoon($)
      if (cmd.message !== '') $.clock.after(60, () => void send($, cmd.message, cfg))
      return {}
    }
    openSoon($)
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
      openSoon($)
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
    openSoon($)
    if (question !== '') $.clock.after(60, () => void send($, question, cfg))
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Box, Text, Button } = table
    const Input = e.surface !== 'mobile' && 'Input' in table ? table.Input : null
    const c = await read($, chat)
    const width = Math.max(24, (e.props.bodyColumns ?? 80) - 1)
    // the header, a blank row, the busy row and the input row are not messages
    const rows = Math.max(4, (e.props.scroll?.bodyRows ?? 24) - 8)
    const win = windowOf(c.msgs, rows, width, c.back)
    const shown = c.msgs.slice(win.from, win.to)
    const older = win.from
    const newer = c.msgs.length - win.to
    const from = c.mainId === null ? 'not forked yet' : `forked from ${c.mainId.slice(0, 8)}`

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" columnGap={1} flexWrap="wrap">
          <Text bold>Side chat</Text>
          <Text dimColor>{from}</Text>
          <Button key="new" label="New fork" plain dimColor onPress={() => void newFork($)} />
          <Button key="close" label="Close" plain dimColor onPress={() => void closePane($)} />
        </Box>
        {c.msgs.length === 0 && !c.isBusy && (
          <Text dimColor wrap="wrap">
            {'A copy of this conversation. Ask anything below; the main conversation is not touched. /fork starts a fresh copy.'}
          </Text>
        )}
        {older > 0 && <Button key="older" label={`↑ ${older} earlier`} plain dimColor onPress={() => update($, chat, old => ({ ...old, back: Math.min(old.msgs.length - 1, old.back + 3) }))} />}
        {shown.map((m, i) => (
          <Box key={`m-${win.from + i}`} flexDirection="column">
            {m.role === 'user' || m.role === 'assistant' ? (
              <Box flexDirection="column">
                <Text bold color={m.role === 'user' ? 'success' : undefined}>{ROLE_PREFIX[m.role]}</Text>
                <Text wrap="wrap">{m.text}</Text>
              </Box>
            ) : (
              <Text dimColor wrap="wrap" color={m.role === 'note' ? 'warning' : undefined}>{`${ROLE_PREFIX[m.role]} ${m.text}`}</Text>
            )}
          </Box>
        ))}
        {newer > 0 && <Button key="newer" label={`↓ ${newer} newer`} plain dimColor onPress={() => update($, chat, old => ({ ...old, back: Math.max(0, old.back - 3) }))} />}
        {newer === 0 && c.live !== '' && (
          <Box flexDirection="column">
            <Text bold>Claude</Text>
            <Text wrap="wrap">{c.live + '▌'}</Text>
          </Box>
        )}
        {c.isBusy && (
          <Box flexDirection="row" columnGap={1}>
            <Text dimColor>{c.live === '' ? 'thinking…' : 'answering…'}</Text>
            <Button key="stop" label="Stop" plain dimColor onPress={() => void stop($)} />
          </Box>
        )}
        {Input ? (
          <Input
            key={`ask-${c.msgs.length}-${c.isBusy ? 'busy' : 'idle'}`}
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
