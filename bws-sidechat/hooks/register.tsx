import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { DecisionTree, SideChat, SideMsg, TreePane } from '../types'
import { MAX_FORKS, crumbOf, explorePrompt, failLine, lastReply, mapPaneRows, nodeRows, parseOptions, parseReply, treeText } from './explain'
import type { PaneRow } from './explain'
import { MODEL_CHOICES, askKey, clampBack, exitNote, isModelName, killArgv, modelOf, nativeArgs, parseSide, reduceLine, replayPrefix, roomOf, scrollStep, sideArgs, splitLines, transcriptRows, windowRows } from './side'
import type { Draft, SideConfig } from './side'
import { MAX_NODES, addOption, branch, childVia, currentOf, decisionParagraph, fillNode, goBack, goTo, mapText, newTree, nodeOf, treeSummary } from './tree'
import { DASHBOARD, parseEvent } from './kit/tab'
import { ROOM, STEP, TAB_COLS, pressOf, sideTab, type View } from './tab'

// The dashboard pane (bws-cockpit) the Side chat tab is drawn in; this mod opens it itself so the open is the person's.
const DASH_TITLE = 'Dashboard'

const EMPTY: SideChat = {
  mainId: null,
  sideId: null,
  msgs: [],
  live: '',
  isForked: false,
  isBusy: false,
  back: 0,
  asks: 0,
  isClosedByPerson: false,
  model: '',
  mainTurns: 0,
  forkTurns: 0,
  isMainBusy: false,
  pendingReplay: false,
}
const chat = atom({ plugin: 'bws-sidechat', key: 'chat' } as const, EMPTY)
// The Side chat tab bws-cockpit draws in its dashboard (bws-kit/tab.ts): the chat, or the decision tree.
const tab = atom({ plugin: 'bws-sidechat', key: 'tab' } as const, null as unknown)
// Which of the two the tab shows, and a count that goes up when the person's command or press shows the tab.
let view: View = 'chat'
let showCount = 0

// Module variables: the running child's identity and whether the person pressed Stop. A new fork or a close
// bumps `runNo`, so the loop of a child that was left behind stops writing into the chat.
let runNo = 0
let isStopped = false
let isInitSeen = false // the running child has printed its init line, so its session file exists

// The tab as the chat and the tree stand; written after every change of either (setChat, saveTree).
// Streamed pieces arrive faster than a write settles, so the writes are queued: each reads the state when its turn
// comes, and an older one can never land after a newer one.
let publishing: Promise<void> = Promise.resolve()
function publishTab($: EngineInterface): Promise<void> {
  publishing = publishing
    .then(async () => {
      const c = await read($, chat)
      const st = await read($, treeState)
      await update($, tab, () => sideTab(c, st, view, { show: showCount, exploring: exploring.size }))
    })
    .catch(() => undefined)
  return publishing
}

// Every change of the chat goes through here, so the tab follows it (streamed pieces included).
async function setChat($: EngineInterface, f: (old: SideChat) => SideChat): Promise<SideChat> {
  const next = await update($, chat, f)
  await publishTab($)
  return next
}

// Shows one view of the tab and opens the dashboard inside the command's own dispatch, so the engine counts it as asked
// and places it at any width (a deferred open counts as unasked and waits below 144 columns).
// The keys are asked for in this same dispatch (the person's own open). From a command they always are: the box still
// holds the command's own text while its hook runs, and the engine clears it. From the footer button only over an
// empty box, so a person who has started typing keeps the keys.
async function showTab($: EngineInterface, v: View, isCommand: boolean) {
  view = v
  showCount += 1
  await publishTab($)
  const isFocus = isCommand || (await $.prompt.read()).text.trim() === ''
  return $.ui.open(isFocus ? { id: DASHBOARD, title: DASH_TITLE, focus: true } : { id: DASHBOARD, title: DASH_TITLE })
}

async function openPane($: EngineInterface, isCommand = true) {
  await setChat($, c => ({ ...c, isClosedByPerson: false }))
  const r = await showTab($, 'chat', isCommand)
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
  const pane = (await $.ui.panes()).find(p => p.id === DASHBOARD)
  if (pane === undefined || pane.isFocused) return
  if ((await $.prompt.read()).text.trim() !== '') return
  await $.ui.open({ id: DASHBOARD, title: DASH_TITLE, focus: true })
  await focusAsk($)
}

// The Ask box in the dashboard: cockpit keys an input `<plugin>-<id>`.
async function focusAsk($: EngineInterface) {
  const c = await read($, chat)
  await settle($.ui.focus({ requestId: DASHBOARD, key: `bws-sidechat-${askKey(c.asks)}` }))
}

// After Stop: the Stop button held the ring and is gone, and the engine hands the keys back to the prompt (while it
// still reports the pane as focused, so that flag cannot be trusted here). A ring move is denied for a site that does
// not hold the keyboard, so the keys are asked for again, as when the pane opens, only over an empty box, and then the
// ring goes to the Ask box.
async function refocusAsk($: EngineInterface) {
  if ((await $.ui.panes()).find(p => p.id === DASHBOARD) === undefined) return
  if ((await $.prompt.read()).text.trim() !== '') return
  await $.ui.open({ id: DASHBOARD, title: DASH_TITLE, focus: true })
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
// The model choice and what is known of the main conversation's turns stay.
async function newFork($: EngineInterface) {
  runNo++
  const old = await read($, chat)
  if (old.isBusy) await killChild($, old.sideId)
  const mainId = await $.session.id()
  await setChat($, c => ({ ...EMPTY, mainId, sideId: crypto.randomUUID(), model: c.model, mainTurns: c.mainTurns, forkTurns: c.mainTurns, isMainBusy: c.isMainBusy }))
}

// Re-forks from the main conversation as it stands now. The transcript stays on screen; the earlier questions ride on the
// next message (replayPrefix), since the new fork only knows main. No model call here.
async function refresh($: EngineInterface) {
  const c = await read($, chat)
  if (!c.isForked) return void $.ui.toast('Side chat: nothing to refresh yet; the first message forks main as it is.')
  runNo++
  if (c.isBusy) await killChild($, c.sideId)
  await setChat($, old => ({
    ...old,
    sideId: crypto.randomUUID(),
    isForked: false,
    isBusy: false,
    live: '',
    back: 0,
    forkTurns: old.mainTurns,
    pendingReplay: true,
    msgs: [...old.msgs, { role: 'note', text: 'Refreshed from main: the next message forks it as it is now.' } as SideMsg],
  }))
  void settle(focusAsk($))
}

// The label of the model a side turn would run on.
function modelLabel(override: string, setting: string): string {
  const name = modelOf(override, setting)
  return name === '' ? "main's model" : name
}

// `/side model <name>` and the header buttons: the open side chat's own model, from the next message. `default` clears it
// (back to the sideModel setting). Returns the sentence to answer with, or null when the name was refused.
async function setModel($: EngineInterface, name: string, setting: string): Promise<string | null> {
  const clean = name.trim()
  if (clean === '') return `Side chat model: ${modelLabel((await read($, chat)).model, setting)}.`
  const isDefault = /^default$/i.test(clean)
  if (!isDefault && !isModelName(clean)) {
    $.ui.toast(`Side chat: "${clean}" is not a model name (an alias such as opus, or an id).`)
    return null
  }
  const next = await setChat($, c => ({ ...c, model: isDefault ? '' : clean }))
  return `Side chat model: ${modelLabel(next.model, setting)}, from the next message.`
}

// Sends an answer of the side chat into the main conversation, as you. `$.prompt.submit` inside a command's dispatch
// deadlocks (AGENTS.md), and the engine runs a plugin's prompt once main is idle, so it goes just after.
async function sendBack($: EngineInterface, index?: number): Promise<string | null> {
  const c = await read($, chat)
  const m = index === undefined ? [...c.msgs].reverse().find(x => x.role === 'assistant') : c.msgs[index]
  const text = m !== undefined && m.role === 'assistant' ? m.text.trim() : ''
  if (text === '') return null
  $.ui.toast(c.isMainBusy ? 'Side chat: main is busy; the answer goes in when it finishes.' : 'Side chat: answer sent to main.')
  $.clock.after(10, () => void $.prompt.submit({ text, asUser: true }).catch(() => $.ui.toast('Side chat: the answer could not be sent to main.')))
  return text
}

const PULL_LIMIT = 12000 // a command line is at most about 32k on Windows

// Adds main's latest reply to the side chat as a message, so it can be asked about (it may be newer than the fork).
async function pull($: EngineInterface, question: string, cfg: SideConfig & { exe: string }) {
  const reply = lastReply(await $.session.messages()).trim()
  if (reply === '') return void $.ui.toast("Side chat: main has no reply to pull yet.")
  const ask = question !== '' ? question : 'Say in two lines what matters in it; I will ask follow-ups.'
  const body = reply.length > PULL_LIMIT ? `${reply.slice(0, PULL_LIMIT)}\n[shortened]` : reply
  await send($, `The main conversation's latest reply (it may be newer than this side session):\n\n${body}\n\n${ask}`, cfg, `Pulled main's latest reply (${reply.length} characters). ${ask}`)
}

async function closePane($: EngineInterface) {
  runNo++
  const old = await read($, chat)
  if (old.isBusy) await killChild($, old.sideId)
  await setChat($, c => ({ ...c, isBusy: false, live: '', isClosedByPerson: true }))
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
async function send($: EngineInterface, text: string, cfg: SideConfig & { exe: string }, typed?: string) {
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
  // A first turn after a refresh is told what the replaced side chat covered; the pane still shows only what was typed.
  const sent = isFirst && c.pendingReplay ? replayPrefix(c.msgs) + message : message
  const sideCfg = { ...cfg, model: modelOf(c.model, cfg.model) }
  let draft: Draft = { msgs: [...c.msgs, { role: 'user', text: typed ?? message }], live: '' }
  await setChat($, old => ({ ...old, ...draft, isBusy: true, back: 0, asks: old.asks + 1, forkTurns: isFirst ? old.mainTurns : old.forkTurns }))
  void settle(focusAsk($))

  let pending = ''
  let stderr = ''
  let code: number | null = 0
  const stream = $.process.spawn({
    argv: [cfg.exe, ...sideArgs({ message: sent, mainId, sideId, isFirst }, sideCfg)],
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
      await setChat($, old => (mine === runNo ? { ...old, msgs: snap.msgs, live: snap.live } : old))
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
  await setChat($, old => {
    const isForked = old.isForked || isInitSeen || code === 0
    return { ...old, msgs: [...draft.msgs, ...shown, ...extra], live: '', isBusy: false, isForked, pendingReplay: isForked ? false : old.pendingReplay }
  })
}

async function stop($: EngineInterface) {
  const c = await read($, chat)
  if (!c.isBusy) return
  isStopped = true
  runNo++
  await setChat($, (old): SideChat => ({
    ...old,
    msgs: [...old.msgs, ...(old.live.trim() === '' ? [] : [{ role: 'assistant', text: old.live.trim() } as SideMsg]), { role: 'note', text: 'Stopped.' } as SideMsg],
    live: '',
    isBusy: false,
    isForked: old.isForked || isInitSeen,
    pendingReplay: old.isForked || isInitSeen ? false : old.pendingReplay,
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
  await openPane($, false)
}

// Headless runs draw nothing: leave the built-in commands to Claude Code (and keep a side-of-side from starting).
async function isDrawn($: EngineInterface) {
  return (await $.session.surfaces()).length > 0
}

// ---------- the decision tree: /explain, Explore, Map, Decide ----------

const EMPTY_TREE: TreePane = { tree: null, view: 'node', back: 0, answers: 0 }
const treeState = atom({ plugin: 'bws-sidechat', key: 'tree' } as const, EMPTY_TREE)
const summary = atom({ plugin: 'bws-sidechat', key: 'summary' } as const, null)

// A new /explain or Close bumps `treeNo`, so the forks of an older tree stop writing into it. `exploring` maps a node
// being explored to its fork's session id: at most MAX_FORKS at once. Separate from the side chat's own run state, so an
// Explore never stops a side chat answer, nor the other way round.
let treeNo = 0
const exploring = new Map<string, string>()
let exploreMs = 180_000
let treeDumpFile = ''

async function saveTree($: EngineInterface, change: (p: TreePane) => TreePane) {
  const next = await update($, treeState, change)
  await update($, summary, () => treeSummary(next.tree, exploring.size))
  await publishTab($)
  if (treeDumpFile !== '') {
    const dump = { ...next, exploring: [...exploring.keys()], map: next.tree === null ? '' : mapText(next.tree) }
    await settle($.fs.write(treeDumpFile, JSON.stringify(dump, null, 2)))
  }
  return next
}

async function openTreePane($: EngineInterface) {
  const r = await showTab($, 'tree', true)
  if (!r.isPlaced) $.ui.toast(`Decision tree not shown (${r.reason}).`)
  for (const ms of [10, 250, 800]) $.clock.after(ms, () => void focusTree($).catch(() => undefined))
}

// As the side chat: the keys are asked for only over an empty prompt box, then the ring goes to the first option.
async function focusTree($: EngineInterface) {
  const pane = (await $.ui.panes()).find(p => p.id === DASHBOARD)
  if (pane === undefined || pane.isFocused) return
  if ((await $.prompt.read()).text.trim() !== '') return
  await $.ui.open({ id: DASHBOARD, title: DASH_TITLE, focus: true })
  await settle($.ui.focus({ requestId: DASHBOARD, key: 'bws-sidechat-opt-0' }))
}

async function stopExplores($: EngineInterface) {
  treeNo++
  const ids = [...exploring.values()]
  exploring.clear()
  for (const id of ids) await killChild($, id)
}

// /explain: the options of the last reply (or of the text given) become the root of a new tree.
async function startTree($: EngineInterface, text: string): Promise<DecisionTree | null> {
  const parsed = parseOptions(text)
  if (parsed === null) return null
  await stopExplores($)
  const tree = newTree(await $.session.id(), parsed.question, parsed.options)
  await saveTree($, () => ({ ...EMPTY_TREE, tree }))
  return tree
}

async function closeTree($: EngineInterface) {
  await stopExplores($)
  view = 'chat'
  await saveTree($, () => EMPTY_TREE)
}

// Explore: a fork answers follow-up questions about one option and asks the next decision, if there is one. Each
// Explore forks afresh (the main conversation for the root's options, the parent node's fork below it), so a branch
// never writes into another branch's session. An option already explored is not explored again: it is shown.
async function explore($: EngineInterface, nodeId: string, option: number, cfg: SideConfig & { exe: string }) {
  const st = await read($, treeState)
  const t = st.tree
  const node = t === null ? undefined : nodeOf(t, nodeId)
  if (t === null || node === undefined) return
  const there = childVia(t, nodeId, option)
  if (there !== undefined && there.state !== 'failed') {
    const r = branch(t, nodeId, option)
    if (r.ok) await saveTree($, p => ({ ...p, tree: r.tree, view: 'node', back: 0 }))
    return
  }
  const o = node.options[option]
  if (o === undefined) return
  if (exploring.size >= MAX_FORKS) return void $.ui.toast(`Decision tree: ${MAX_FORKS} explorations are running. Wait for one to finish.`)
  const r = branch(t, nodeId, option)
  if (!r.ok) return void $.ui.toast(r.reason === 'node-cap' ? `Decision tree: full (${MAX_NODES} nodes).` : r.reason === 'depth-cap' ? 'Decision tree: too deep to explore further.' : 'Decision tree: no such option.')
  const childId = r.id
  const base = node.forkId ?? t.mainId
  const sideId = crypto.randomUUID()
  const mine = treeNo
  exploring.set(childId, sideId)
  const message = explorePrompt(t, node, o)
  const exploreCfg = { ...cfg, model: modelOf((await read($, chat)).model, cfg.model) }
  await saveTree($, p => ({ ...p, tree: fillNode(r.tree, childId, { state: 'exploring', note: '' }), view: 'node', back: 0 }))

  let isTimedOut = false
  const timer = $.clock.after(exploreMs, () => {
    isTimedOut = true
    void killChild($, sideId).catch(() => undefined)
  })
  let draft: Draft = { msgs: [], live: '' }
  let pending = ''
  let stderr = ''
  let code: number | null = 0
  try {
    const stream = $.process.spawn({
      argv: [cfg.exe, ...sideArgs({ message, mainId: base, sideId, isFirst: true }, exploreCfg)],
      env: { CLAUDE_CODE_PLUGIN_DIRS: '' }, // no mods in the fork, as the side chat
    })
    try {
      for (;;) {
        const step = await stream.next()
        if (mine !== treeNo) break
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
        for (const line of split.lines) draft = reduceLine(draft, line)
      }
    } finally {
      await settle(stream.return(undefined as never))
    }
  } catch (err) {
    code = -1
    stderr += String(err)
  }
  timer.cancel()
  if (exploring.get(childId) === sideId) exploring.delete(childId)
  if (mine !== treeNo) return // a new tree or a close took over

  const reply = [...draft.msgs].reverse().find(m => m.role === 'assistant')?.text ?? draft.live.trim()
  const error = draft.msgs.find(m => m.role === 'note')?.text ?? null
  const why = isTimedOut ? `no answer within ${Math.round(exploreMs / 1000)} s` : error !== null ? error : reply === '' ? (exitNote(code, stderr) ?? 'no answer') : null
  if (why !== null) {
    $.ui.log(failLine('explore', isTimedOut ? 'timeout' : code !== 0 ? `exit ${code}` : error !== null ? 'error result' : 'empty reply'), { to: 'debug' })
    await saveTree($, p => (p.tree === null ? p : { ...p, tree: fillNode(p.tree, childId, { state: 'failed', note: why.slice(0, 300) }) }))
    return
  }
  const next = parseReply(reply)
  await saveTree($, p =>
    p.tree === null ? p : { ...p, tree: fillNode(p.tree, childId, { state: 'ready', question: next.question, options: next.options, answer: next.answer, forkId: sideId, note: '' }) },
  )
}

// A free answer typed at a node: one more option, explored like the others.
async function exploreOwn($: EngineInterface, nodeId: string, text: string, cfg: SideConfig & { exe: string }) {
  const st = await read($, treeState)
  const added = st.tree === null ? null : addOption(st.tree, nodeId, text)
  if (added === null) return
  await saveTree($, p => ({ ...p, tree: added.tree, answers: p.answers + 1 }))
  await explore($, nodeId, added.option, cfg)
}

// Decide: the one-paragraph summary of the path taken goes into the main session. `$.prompt.submit` inside a command's
// dispatch deadlocks (AGENTS.md), so it is sent once the dispatch has returned.
async function decide($: EngineInterface): Promise<string | null> {
  const st = await read($, treeState)
  const text = st.tree === null ? null : decisionParagraph(st.tree)
  if (text === null) return null
  // Close first: ending a running fork can take seconds, and the send must not fire while the dispatch still waits.
  await closeTree($)
  $.clock.after(10, () => void $.prompt.submit({ text, asUser: true }).catch(() => $.ui.log(failLine('decide', 'not sent'), { to: 'debug' })))
  return text
}

// A button or input in the Side chat tab, or its `/side --<id> [text]` twin: what the pane's controls did. The answers
// and explorations run behind (they stream for a while), so a press never waits on them.
async function act($: EngineInterface, id: string, value: string | undefined, cfg: SideConfig & { exe: string }) {
  const later = (p: Promise<unknown>) => void p.catch(() => $.ui.log(failLine('tab', 'error'), { to: 'debug' }))
  const c = await read($, chat)
  const st = await read($, treeState)
  const t = st.tree
  const node = t === null ? undefined : (currentOf(t) ?? t.nodes[0])
  const treeRows = () => (t === null || node === undefined ? 0 : (st.view === 'map' ? mapPaneRows(t, TAB_COLS) : nodeRows(t, node, TAB_COLS)).length)
  const chatRows = () => transcriptRows(c.msgs, c.live, TAB_COLS, true).length
  let m: RegExpExecArray | null
  if (id === 'new') await newFork($)
  else if (id === 'refresh') await refresh($)
  else if (id === 'pull') later(pull($, '', cfg))
  else if (id === 'end') await closePane($)
  else if (id === 'stop') await stop($)
  else if (id === 'older' || id === 'newer') {
    const back = clampBack(c.back, chatRows(), ROOM)
    await setChat($, old => ({ ...old, back: clampBack(id === 'older' ? back + STEP : back - STEP, chatRows(), ROOM) }))
  } else if ((m = /^model-(.+)$/.exec(id)) && m[1] !== undefined) {
    const text = await setModel($, m[1], cfg.model)
    if (text !== null) $.ui.toast(text)
  } else if ((m = /^send-(\d+)$/.exec(id))) await sendBack($, Number(m[1]))
  else if (/^ask-\d+$/.test(id)) later(send($, value ?? '', cfg))
  else if (id === 'tree' || id === 'chat') {
    view = id
    await publishTab($)
  } else if (id === 'map') await saveTree($, p => ({ ...p, view: p.view === 'map' ? 'node' : 'map', back: 0 }))
  else if (id === 'back') await saveTree($, p => (p.tree === null ? p : { ...p, tree: goBack(p.tree), back: 0 }))
  else if (id === 'decide') await decide($)
  else if (id === 'tree-close') await closeTree($)
  else if (id === 'older-t' || id === 'newer-t') {
    const back = clampBack(st.back, treeRows(), ROOM)
    await saveTree($, p => ({ ...p, back: clampBack(id === 'older-t' ? back + STEP : back - STEP, treeRows(), ROOM) }))
  } else if ((m = /^opt-(\d+)$/.exec(id)) && node !== undefined) later(explore($, node.id, Number(m[1]), cfg))
  else if ((m = /^node-(.+)$/.exec(id)) && m[1] !== undefined) {
    const target = m[1]
    await saveTree($, p => (p.tree === null ? p : { ...p, tree: goTo(p.tree, target), view: 'node', back: 0 }))
  } else if (/^answer-\d+$/.test(id) && node !== undefined) later(exploreOwn($, node.id, value ?? '', cfg))
}

export const register: Register = (on, options) => {
  const cfg = configOf(options as Record<string, unknown>)
  const takesFork = options.takeOverFork !== false
  const takesBtw = options.takeOverBtw !== false
  const action = String(options.chordAction ?? '').trim()
  const seconds = Number(options.exploreTimeoutSeconds ?? 180)
  exploreMs = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : 180_000
  treeDumpFile = typeof options.treeDumpFile === 'string' ? options.treeDumpFile.trim() : ''

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'side',
      description: 'Side chat in the dashboard, forked from this conversation',
      argumentHint: '[new [message] | close | model [name] | refresh | pull [question] | send-back | message]',
      immediate: true,
    })
    await $.command.register({
      name: 'explain',
      description: "Decision tree of the last reply's options: explore each in a fork, go back, map, decide",
      argumentHint: '[decide | close | text with options]',
    })
    return next(e)
  })

  // /explain: the last reply's numbered or lettered options open the tree in the Side chat tab, at its root. Text after it is read
  // instead of the last reply. Headless, the tree is answered as text (nothing can be drawn or explored).
  on('command.run', { command: 'explain' }, async ($, e) => {
    const args = e.args.trim()
    if (/^decide$/i.test(args)) {
      const text = await decide($)
      return text === null ? { text: 'Nothing to decide yet: explore an option first.' } : {}
    }
    if (/^close$/i.test(args)) {
      await closeTree($)
      return {}
    }
    const source = args !== '' ? args : lastReply(await $.session.messages())
    const tree = await startTree($, source)
    if (tree === null) {
      return { text: `No options found in ${args !== '' ? 'that text' : 'the last reply'}. /explain reads numbered (1. 2.) or lettered (a) b)) options; /explain <text> reads the text instead.` }
    }
    if (!(await isDrawn($))) return { text: treeText(tree, mapText(tree, 200)) }
    await openTreePane($)
    return {}
  })

  // /side: show the tab, continue the side chat, start a new fork, or close it.
  on('command.run', { command: 'side' }, async ($, e) => {
    if (!(await isDrawn($))) return { text: 'The side chat needs a terminal or Desktop window to draw in.' }
    // `/side --<id> [text]`: what a button or input in the Side chat tab does.
    const press = pressOf(e.args)
    if (press !== null) {
      await act($, press.id, press.value, cfg)
      return {}
    }
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
    if (cmd.kind === 'model') {
      const text = await setModel($, cmd.name, cfg.model)
      if (text !== null && cmd.name.trim() === '') return { text }
      await openPane($)
      return text === null ? {} : { text }
    }
    if (cmd.kind === 'send-back') {
      const text = await sendBack($)
      return text === null ? { text: 'No answer in the side chat to send back yet.' } : {}
    }
    await openPane($)
    if (cmd.kind === 'refresh') await refresh($)
    if (cmd.kind === 'pull') $.clock.after(60, () => void pull($, cmd.message, cfg))
    if (cmd.kind === 'send') $.clock.after(60, () => void send($, cmd.message, cfg))
    return {}
  })

  // The main conversation's state, for the pane's status line: observed only, never changed. A subagent's own turn
  // is not main's.
  on('turn.start', async ($, e, next) => {
    await settle(setChat($, c => ({ ...c, isMainBusy: true })))
    return next(e)
  })
  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) await settle(setChat($, c => ({ ...c, isMainBusy: false, mainTurns: c.mainTurns + 1 })))
    return next(e)
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

  // A press or a submitted input in the Side chat tab (bws-cockpit writes it).
  on('state.set', { plugin: 'bws-cockpit', key: 'tabEvent' }, async ($, e, next) => {
    const ev = parseEvent(e.value)
    if (ev?.plugin === 'bws-sidechat') await act($, ev.id, ev.value, cfg).catch(() => $.ui.log(failLine('tab', 'error'), { to: 'debug' }))
    return next(e)
  })
}
