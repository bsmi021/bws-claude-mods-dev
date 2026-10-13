// bws-diagram: after a big turn a small model decides whether it is worth a diagram; if so a fork draws what happened
// in a side pane. Mermaid blocks Claude writes are pinned there too. The only file that uses `$`.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { Board, Diagram } from '../types'
import { classifyGate, runFork } from './kit/classify-fork'
import type { KitModel } from './kit/classify-fork'
import {
  addEntry,
  boardSummary,
  CLASSIFY_QUESTION,
  CLASSIFY_TIMEOUT_MS,
  classifyMaterial,
  diagramEntry,
  EMPTY_BOARD,
  failLine,
  pinsFrom,
  FORK_TIMEOUT_MS,
  forkPrompt,
  shownEntry,
  skipReason,
  statusText,
  turnCounts,
  type Row,
} from './diagram'
import { drawKind } from './draw'
import { layered } from './layout'
import { edgeLines, outline, rasterOf, svgOf } from './render'
import { parseDiagramReply } from './spec'

const PANE = 'bws-diagram'
const board = atom({ plugin: 'bws-diagram', key: 'board' } as const, EMPTY_BOARD)
const summary = atom({ plugin: 'bws-diagram', key: 'summary' } as const, null)

// The options, copied in by register on every load.
let autoDiagram = true
let classifierModel = 'haiku'
let dumpFile = ''

// The running-fork guard and the conversation it belongs to. `generation` moves on /clear, /resume and a changed
// session id (/branch), so a fork that started before cannot add its diagram after.
let running = false
let generation = 0
let lastSession = ''

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

async function setBoard($: EngineInterface, f: (b: Board) => Board) {
  const b = await update($, board, f)
  await update($, summary, () => boardSummary(b))
  if (dumpFile) await $.fs.write(dumpFile, JSON.stringify(b, null, 2)).catch(() => $.ui.log(failLine('dump', 'not written'), { to: 'debug' }))
}

// Opens the pane fresh: close first, so it is never mounted twice. An open the person did not ask for may not be placed.
async function openPane($: EngineInterface) {
  await $.ui.close({ id: PANE })
  const r = await $.ui.open({ id: PANE, title: 'Diagram', columns: 100 })
  if (!r.isPlaced) $.ui.toast(`Diagram ready, pane not shown (${r.reason}). /diagram show opens it.`)
}

// /clear, /resume, a new session id: work in flight is dropped and the guard released.
async function resetWork($: EngineInterface) {
  generation++
  running = false
  await setBoard($, b => ({ ...b, phase: 'idle', note: '' }))
}

async function syncSession($: EngineInterface) {
  const id = await $.session.id()
  if (lastSession !== '' && lastSession !== id) await resetWork($)
  lastSession = id
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
    await setBoard($, b => ({ ...addEntry(b, diagramEntry(scope === 'turn' ? 'auto' : 'session', spec.diagram, at)), phase: 'idle', note: '' }))
    await openPane($)
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
  const pins = pinsFrom(answer, await $.clock.now(), b.entries)
  if (pins.length === 0) return
  await setBoard($, x => pins.reduce(addEntry, x))
  await openPane($)
}

// /diagram: the whole session, no classifier. Headless the process may end once the command returns, so it is awaited.
async function drawSession($: EngineInterface): Promise<string> {
  await syncSession($)
  if (running) return 'A diagram is already being drawn; try again in a moment.'
  const isHeadless = (await $.session.surfaces()).length === 0
  if (isHeadless) return (await draw($, 'session', '')).text
  running = true
  $.clock.after(10, () => void draw($, 'session', '').catch(() => undefined))
  return 'Drawing the session... the pane shows it when done.'
}

async function diagramCommand($: EngineInterface, args: string): Promise<string> {
  const sub = args.trim().toLowerCase()
  if (sub === 'status') return statusText(await read($, board), autoDiagram)
  if (sub === 'show') {
    const r = await $.ui.open({ id: PANE, title: 'Diagram', columns: 100, focus: true })
    return r.isPlaced ? '' : `Pane not shown (${r.reason}).`
  }
  if (sub === '') return drawSession($)
  return 'Usage: /diagram (draw the whole session), /diagram status, /diagram show'
}

export const register: Register = (on, options) => {
  autoDiagram = options.autoDiagram !== false
  classifierModel = String(options.model ?? '').trim() || 'haiku'
  dumpFile = typeof options.dumpFile === 'string' ? options.dumpFile.trim() : ''
  running = false
  lastSession = ''

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'diagram', description: 'Diagram the whole session in the side pane: /diagram, /diagram status, /diagram show', argumentHint: '[status|show]' })
    const b = await read($, board)
    await update($, summary, () => boardSummary(b))
    return next(e)
  })

  on('command.run', { command: 'diagram' }, async ($, e) => ({ text: await diagramCommand($, e.args).catch(() => 'No diagram. (error)') }))

  // The one turn.complete hook. Pins first (cheap, so the turn barely waits); the classify-then-fork work starts after it returns.
  on('turn.complete', async ($, e, next) => {
    if (!e.agentId && e.reason === 'answer') await pin($, e.answer).catch(() => $.ui.log(failLine('pin', 'error'), { to: 'debug' }))
    $.clock.after(10, () => void afterTurn($, e).catch(() => $.ui.log(failLine('turn', 'error'), { to: 'debug' })))
    return next(e)
  })

  // /clear and /resume end the conversation: no work for it continues and the guard resets.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear' || e.reason === 'resume') await resetWork($).catch(() => undefined)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const b = await read($, board)
    const entry = shownEntry(b)
    const table = $.ui.resolve(e)
    const { Box, Text } = table
    if (!entry) return <Text dimColor>No diagrams yet.</Text>
    const d: Diagram | null = entry.diagram
    if (!d) {
      return (
        <Box flexDirection="column">
          <Text bold>{entry.title}</Text>
          <Text>{entry.source}</Text>
        </Box>
      )
    }
    const l = layered(d)
    const kind = drawKind(e.surface, { raster: 'Raster' in table, svg: 'Svg' in table })
    const notes = edgeLines(d, false)
    if (kind === 'raster' && 'Raster' in table) {
      const { Raster } = table
      const art = rasterOf(d, e.props.bodyColumns, l)
      if (art) {
        return (
          <Box flexDirection="column">
            <Text bold>{d.title}</Text>
            <Raster key="diagram" columns={art.columns} rows={art.rows} cells={art.cells} />
            {notes.map((n, i) => <Text key={`n${i}`} dimColor wrap="truncate-end">{n}</Text>)}
          </Box>
        )
      }
    }
    if (kind === 'svg' && 'Svg' in table) {
      const { Svg } = table
      const art = svgOf(d, l)
      return (
        <Box flexDirection="column">
          <Text bold>{d.title}</Text>
          <Svg source={art.source} alt={art.alt} width={art.width} />
          {notes.map((n, i) => <Text key={`n${i}`} dimColor>{n}</Text>)}
        </Box>
      )
    }
    return (
      <Box flexDirection="column">
        <Text bold>{d.title}</Text>
        {outline(d, l).map((line, i) => <Text key={`o${i}`} wrap="truncate-end">{line}</Text>)}
      </Box>
    )
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE && e.origin.kind === 'person') await setBoard($, b => (b.phase === 'error' ? { ...b, phase: 'idle', note: '' } : b))
    return next(e)
  })

}
