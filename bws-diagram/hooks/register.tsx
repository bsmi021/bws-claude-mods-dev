// bws-diagram: after a big turn a small model decides whether it is worth a diagram; if so a fork draws what happened
// in its bws-cockpit dashboard tab. Mermaid blocks Claude writes are pinned there too. The only file that uses `$`.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { Board, Entry } from '../types'
import { classifyGate, runFork } from './kit/classify-fork'
import type { KitModel } from './kit/classify-fork'
import {
  addEntry,
  addPin,
  boardSummary,
  CLASSIFY_QUESTION,
  CLASSIFY_TIMEOUT_MS,
  classifyMaterial,
  diagramEntry,
  EMPTY_BOARD,
  heading,
  keepBoard,
  keptBoard,
  footerOf,
  move,
  failLine,
  pinsFrom,
  FORK_TIMEOUT_MS,
  forkPrompt,
  shownEntry,
  skipReason,
  statusText,
  turnCounts,
  turnNumber,
  type Row,
} from './diagram'
import { DASHBOARD, parseEvent } from './kit/tab'
import { legendOf, textRows } from './render'
import { parseDiagramReply } from './spec'
import { diagramTab } from './tab'

const board = atom({ plugin: 'bws-diagram', key: 'board' } as const, EMPTY_BOARD)
const summary = atom({ plugin: 'bws-diagram', key: 'summary' } as const, null)
// The dashboard tab bws-cockpit draws (bws-kit/tab.ts).
const tab = atom({ plugin: 'bws-diagram', key: 'tab' } as const, null as unknown)

// Count up to bring the tab up: `raise` for a new diagram, `show` when the person asked (/diagram show).
let raiseCount = 0
let showCount = 0

// The options, copied in by register on every load.
let autoDiagram = true
let classifierModel = 'haiku'
let dumpFile = ''

// The running-fork guard and the conversation it belongs to. `generation` moves on /clear, /resume and a changed
// session id (/branch), so a fork that started before cannot add its diagram after.
let running = false
let generation = 0
let lastSession = ''
// Set by session.end 'resume': the next session id seen is a resumed conversation, not a branch.
let pendingResume = false

const STORE_KEY = 'boards'

// The adapter classify-fork runs on: the mods API calls and nothing else.
function kitModel($: EngineInterface): KitModel {
  return {
    classify: (text, labels, options) => $.model.classify(text, labels, options),
    complete: (request, options) => $.model.complete(request, options),
    fork: request => $.model.fork(request),
    messages: async () => (await $.session.messages()).map(m => ({ role: m.role, text: m.text ?? '', toolUses: m.toolUses.map(t => ({ tool: t.tool })) })),
    sessionModel: () => $.session.model(),
    after: (ms, fn) => $.clock.after(ms, fn),
  }
}

// Writes the board, its summary chip, the copy kept for this conversation and the diagnostic dump. `isKept` false
// (after /clear) leaves the ended conversation's kept copy as it was.
async function setBoard($: EngineInterface, f: (b: Board) => Board, isKept = true) {
  const b = await update($, board, f)
  await update($, summary, () => boardSummary(b))
  await update($, tab, () => diagramTab(b, { raise: raiseCount, show: showCount }))
  if (isKept) {
    const id = lastSession || (await $.session.id())
    await $.store.set(STORE_KEY, keepBoard(await $.store.get(STORE_KEY), id, b, await $.clock.now()))
  }
  if (dumpFile) await $.fs.write(dumpFile, JSON.stringify(b, null, 2)).catch(() => $.ui.log(failLine('dump', 'not written'), { to: 'debug' }))
}

async function publishTab($: EngineInterface) {
  const b = await read($, board)
  await update($, tab, () => diagramTab(b, { raise: raiseCount, show: showCount }))
}

// The dashboard (bws-cockpit) is loaded when its command is: the tab shows the diagram. Without it the diagram is
// written into the transcript, so it is seen either way.
async function hasDashboard($: EngineInterface): Promise<boolean> {
  return (await $.command.list()).some(c => c.name === 'dashboard')
}

// A new diagram: bring its tab up (cockpit decides whether that is fine now), or write it into the transcript.
async function announce($: EngineInterface, entry: Entry | null) {
  if (await hasDashboard($)) {
    raiseCount += 1
    await publishTab($)
    return
  }
  if (entry) $.ui.log(transcriptText(entry, 'bws-cockpit is not loaded, so there is no dashboard tab for diagrams.'))
}

// The shown entry as lines for the transcript: title, legend, the drawing at 100 columns, the footer.
function transcriptText(e: Entry, note: string): string {
  const d = e.diagram
  const body = d ? textRows(d, 100).rows : ['(not a flowchart this pane can draw)', ...e.source.split('\n').slice(0, 12)]
  return [e.title, ...(d ? [legendOf(d)] : []), ...body, footerOf(e), note].join('\n')
}

// The person dismissed a failure in the tab: the diagrams stay listed.
async function acknowledge($: EngineInterface) {
  const b = await read($, board)
  if (b.phase === 'error') await setBoard($, x => ({ ...x, phase: 'idle', note: '' }))
}

// Work in flight belongs to a conversation that is gone: drop it and release the guard.
function dropWork() {
  generation++
  running = false
}

// A changed session id is a new conversation. After /resume it gets the board it left (kept in the store); otherwise
// (/branch copies the transcript, /clear already emptied the board) the board carries over to the new id.
async function syncSession($: EngineInterface) {
  const id = await $.session.id()
  if (lastSession === '' || lastSession === id) {
    lastSession = id
    return
  }
  dropWork()
  const isResume = pendingResume
  pendingResume = false
  lastSession = id
  const now = isResume ? keptBoard(await $.store.get(STORE_KEY), id) : { ...(await read($, board)), phase: 'idle' as const, note: '' }
  await setBoard($, () => now)
}

async function rows($: EngineInterface): Promise<Row[]> {
  return (await $.session.messages()).map(m => ({
    role: m.role,
    text: m.text ?? '',
    toolUses: m.toolUses.map(t => ({ tool: t.tool, input: t.input })),
    hasToolResults: (m.toolResults?.length ?? 0) > 0,
  }))
}

type DrawResult = { text: string; isDrawn: boolean }

// One drawing. `scope` turn: classify the counts first; session (/diagram): no classifier. Never throws: a failure
// leaves the board's diagrams as they were, logs one debug line and shows a warning chip.
async function draw($: EngineInterface, scope: 'turn' | 'session', material: string): Promise<DrawResult> {
  const gen = generation
  running = true
  const fail = async (step: string, reason: string): Promise<DrawResult> => {
    $.ui.log(failLine(step, reason), { to: 'debug' })
    if (gen === generation) await setBoard($, b => ({ ...b, phase: 'error', note: `${step}: ${reason}` }))
    return { text: `No diagram. (${step}: ${reason})`, isDrawn: false }
  }
  try {
    if (scope === 'turn') {
      const g = await classifyGate(kitModel($), { question: CLASSIFY_QUESTION, material, model: classifierModel, timeoutMs: CLASSIFY_TIMEOUT_MS })
      if (!g.ok) return await fail('classify', g.reason)
      if (!g.verdict) return { text: 'The turn was not big enough to diagram.', isDrawn: false }
    }
    if (gen !== generation) return { text: 'No diagram. (the conversation changed)', isDrawn: false }
    await setBoard($, b => ({ ...b, phase: 'working', note: '' }))
    const f = await runFork(kitModel($), { prompt: forkPrompt(scope), timeoutMs: FORK_TIMEOUT_MS })
    if (!f.ok) return await fail('fork', f.reason)
    const reply = f.text
    if (gen !== generation) {
      $.ui.log(failLine('show', 'the conversation changed'), { to: 'debug' })
      return { text: 'No diagram. (the conversation changed)', isDrawn: false }
    }
    const spec = parseDiagramReply(reply)
    if (!spec.ok) return await fail('validate', spec.error)
    const at = await $.clock.now()
    const turn = turnNumber(await rows($))
    await setBoard($, b => ({ ...addEntry(b, diagramEntry(scope === 'turn' ? 'auto' : 'session', spec.diagram, at, turn)), phase: 'idle', note: '' }))
    await announce($, shownEntry(await read($, board)))
    return { text: `Diagram drawn: ${spec.diagram.title} (${spec.diagram.nodes.length} nodes).`, isDrawn: true }
  } catch (err) {
    return await fail('draw', err instanceof Error ? err.message.slice(0, 80) : 'error')
  } finally {
    if (gen === generation) running = false
  }
}

// Looks at the turn that just ended and draws it when the classifier says it is big. Runs after turn.complete returned.
async function afterTurn($: EngineInterface, e: { answer: string; reason: string; agentId?: string; durationMs: number }) {
  await syncSession($)
  const isHeadless = (await $.session.surfaces()).length === 0
  const base = { autoDiagram, isHeadless, agentId: e.agentId, reason: e.reason, isRunning: running, toolCalls: 1 }
  if (skipReason(base) !== null) return
  const counts = turnCounts(await rows($), e.durationMs, e.answer)
  if (skipReason({ ...base, isRunning: running, toolCalls: counts.toolCalls }) !== null) return
  await draw($, 'turn', classifyMaterial(counts))
}

// Pins the reply's mermaid blocks. Pure work and one state write, so it runs inside turn.complete (headless too).
async function pin($: EngineInterface, answer: string) {
  if (!answer.includes('mermaid')) return
  await syncSession($)
  const b = await read($, board)
  const pins = pinsFrom(answer, await $.clock.now(), b.entries, turnNumber(await rows($)))
  if (pins.length === 0) return
  await setBoard($, x => pins.reduce(addPin, x))
  await announce($, shownEntry(await read($, board)))
}

// /diagram: the whole session, no classifier. Headless the process may end once the command returns, so it is awaited.
async function drawSession($: EngineInterface): Promise<string> {
  await syncSession($)
  if (running) return 'A diagram is already being drawn; try again in a moment.'
  const isHeadless = (await $.session.surfaces()).length === 0
  if (isHeadless) return (await draw($, 'session', '')).text
  running = true
  $.clock.after(10, () => void draw($, 'session', '').catch(() => undefined))
  return 'Drawing the session... the Diagram tab shows it when done.'
}

async function diagramCommand($: EngineInterface, args: string): Promise<string> {
  const sub = args.trim().toLowerCase()
  await syncSession($)
  if (sub === 'status') return statusText(await read($, board), autoDiagram)
  if (sub === 'show') {
    if (!(await hasDashboard($))) {
      const entry = shownEntry(await read($, board))
      return entry ? transcriptText(entry, '') : 'No diagrams yet. /diagram draws the session.'
    }
    // Asked for: switch the dashboard to this tab and open it as the person's own open.
    showCount += 1
    await publishTab($)
    const r = await $.ui.open({ id: DASHBOARD, title: 'Dashboard', focus: true })
    return r.isPlaced ? '' : `Dashboard not shown (${r.reason}).`
  }
  if (sub === '') return drawSession($)
  return 'Usage: /diagram (draw the whole session), /diagram status, /diagram show (the Diagram tab)'
}

export const register: Register = (on, options) => {
  autoDiagram = options.autoDiagram !== false
  classifierModel = String(options.model ?? '').trim() || 'haiku'
  dumpFile = typeof options.dumpFile === 'string' ? options.dumpFile.trim() : ''
  running = false
  lastSession = ''
  pendingResume = false

  // Runs at start and after a reload. The board atom outlives a reload as it is; a new process (claude --resume)
  // starts with an empty atom, so it takes the board this conversation left in the store.
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'diagram', description: 'Diagram the whole session in the Diagram tab of the dashboard: /diagram, /diagram status, /diagram show', argumentHint: '[status|show]' })
    lastSession = await $.session.id()
    const b = await read($, board)
    if (b.entries.length === 0) {
      const kept = keptBoard(await $.store.get(STORE_KEY), lastSession)
      if (kept.entries.length > 0) await update($, board, () => kept)
    }
    const now = await read($, board)
    await update($, summary, () => boardSummary(now))
    await publishTab($)
    return next(e)
  })

  on('command.run', { command: 'diagram' }, async ($, e) => ({ text: await diagramCommand($, e.args).catch(() => 'No diagram. (error)') }))

  // The one turn.complete hook. Pins first (cheap, so the turn barely waits); the classify-then-fork work starts after it returns.
  on('turn.complete', async ($, e, next) => {
    if (!e.agentId && e.reason === 'answer') await pin($, e.answer).catch(() => $.ui.log(failLine('pin', 'error'), { to: 'debug' }))
    $.clock.after(10, () => void afterTurn($, e).catch(() => $.ui.log(failLine('turn', 'error'), { to: 'debug' })))
    return next(e)
  })

  // /clear: the conversation's diagrams go with it (its kept copy stays for a later resume), no work for it continues.
  // /resume: work stops; the next session id seen loads that conversation's board.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear' || e.reason === 'resume') {
      dropWork()
      if (e.reason === 'clear') await setBoard($, () => EMPTY_BOARD, false).catch(() => undefined)
      else pendingResume = true
    }
    return next(e)
  })

  // A press in the Diagram tab (bws-cockpit writes it): Prev / Next, draw the session, dismiss a failure.
  on('state.set', { plugin: 'bws-cockpit', key: 'tabEvent' }, async ($, e, next) => {
    const ev = parseEvent(e.value)
    if (ev?.plugin === 'bws-diagram') {
      const act =
        ev.id === 'prev' ? setBoard($, x => move(x, -1))
        : ev.id === 'next' ? setBoard($, x => move(x, 1))
        : ev.id === 'dismiss' ? acknowledge($)
        : ev.id === 'draw' ? drawSession($).then(() => undefined)
        : Promise.resolve()
      await act.catch(() => $.ui.log(failLine('tab', 'error'), { to: 'debug' }))
    }
    return next(e)
  })
}
