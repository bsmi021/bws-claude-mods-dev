// bws-enhance: rewrites a rough prompt into a specific one, grounded in this session's instructions and skills,
// puts it in the prompt box, and opens a small pane with Send / Revert.
// Triggers: /enhance <rough prompt>, or the chord bound to the footer button's action on the draft in the box.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { View } from '../types'
import {
  cleanReply,
  commandsText,
  conversationText,
  instructionPaths,
  instructionsText,
  mcpServers,
  SYSTEM,
  TREE_DEPTH,
  TREE_ENTRIES,
  treeEntries,
  treeLine,
  userPrompt,
  type Doc,
} from './lib'

const COMMAND = 'enhance'
const PANE = 'bws-enhance'
const IDLE: View = { phase: 'idle', original: '', enhanced: '', isFilled: false, note: '' }
const view = atom({ plugin: 'bws-enhance', key: 'view' } as const, IDLE)

type Outcome = { ok: true; text: string } | { ok: false; note: string }

// The project map, depth-first, through $.fs.list: TREE_DEPTH levels, at most TREE_ENTRIES lines.
async function walkTree($: EngineInterface, root: string, rel: string, depth: number, lines: string[]) {
  let entries: { name: string; kind: string }[] = []
  try {
    entries = await $.fs.list(`${root}${rel}`)
  } catch {
    return
  }
  for (const e of treeEntries(entries, rel)) {
    if (lines.length >= TREE_ENTRIES) return
    lines.push(treeLine(e, depth))
    if (e.kind === 'dir' && depth + 1 < TREE_DEPTH) await walkTree($, root, `${rel}/${e.name}`, depth + 1, lines)
  }
}

// Everything the rewrite is grounded in. Each source is optional: a failed read leaves that part empty.
async function gather($: EngineInterface, rough: string) {
  const root = await $.session.root()
  const lines: string[] = []
  await walkTree($, root.replace(/[\\/]+$/, ''), '', 0, lines)
  const tree = lines.length === 0 ? '(unavailable)' : lines.length >= TREE_ENTRIES ? `${lines.join('\n')}\n… (cut at ${TREE_ENTRIES} entries)` : lines.join('\n')
  let target = 'unknown'
  try {
    target = await $.session.model()
  } catch {}
  let loaded: string[] = []
  try {
    const usage = await $.session.usage({ breakdown: 'summary' })
    loaded = (usage.context.breakdown?.memoryFiles ?? []).map(f => f.path)
  } catch {}
  const docs: Doc[] = []
  for (const path of instructionPaths(loaded, root)) {
    try {
      docs.push({ path, text: String(await $.fs.read(path)) })
    } catch {}
  }
  let commands = '(unknown)'
  try {
    commands = commandsText(await $.command.list(), COMMAND)
  } catch {}
  let servers: string[] = []
  try {
    servers = mcpServers((await $.tool.list()).map(t => t.name))
  } catch {}
  let conversation = '(unavailable)'
  try {
    const messages = await $.session.messages()
    if (Array.isArray(messages)) conversation = conversationText(messages.map(m => ({ role: m.role, text: m.text ?? '' })))
  } catch {}
  return userPrompt({ rough, target, root, tree, instructions: instructionsText(docs), commands, servers, conversation })
}

async function enhance($: EngineInterface, rough: string, model: string, signal?: AbortSignal): Promise<Outcome> {
  const prompt = await gather($, rough)
  const r = await $.model.complete({ model, system: SYSTEM, prompt, maxTokens: 2000, timeoutMs: 90000 }, { signal })
  if (!r.isAnswered) {
    const why = r.reason === 'api-error' ? `API error ${r.status ?? ''}`.trim() : r.reason
    return { ok: false, note: why }
  }
  const text = cleanReply(r.text)
  return text ? { ok: true, text } : { ok: false, note: 'empty reply' }
}

let stop = new AbortController()

// Runs after the trigger has returned, so the box is free to take the result.
async function finish($: EngineInterface, rough: string, model: string) {
  stop = new AbortController()
  const mine = stop
  const r = await enhance($, rough, model, mine.signal)
  if (mine.signal.aborted) return
  if (!r.ok) {
    await update($, view, () => ({ ...IDLE, phase: 'error', original: rough, note: r.note }))
    return
  }
  // The box still holds nothing or the rough draft: replace it. Anything else was typed meanwhile: keep it.
  const box = (await $.prompt.read()).text.trim()
  if (box !== '' && box !== rough) {
    await update($, view, () => ({ ...IDLE, phase: 'ready', original: rough, enhanced: r.text, isFilled: false }))
    return
  }
  await update($, view, () => ({ ...IDLE, phase: 'ready', original: rough, enhanced: r.text, isFilled: true }))
  // The pane gets the keys only when opened fresh over an empty composer (re-opening an open id only retitles it),
  // so: clear the box, close and reopen with focus (s / r / d, Enter on Send), then fill.
  if (box !== '') await $.prompt.fill({ text: '' })
  await $.ui.close({ id: PANE })
  await placed($, await $.ui.open({ id: PANE, title: 'Enhanced prompt', focus: true }))
  const isFilled = (await $.prompt.fill({ text: r.text })).isFilled
  if (!isFilled) await update($, view, old => ({ ...old, isFilled: false }))
}

// A pane that waits undrawn (a narrow terminal) would hide Send: say so; Enter in the box still sends.
async function placed($: EngineInterface, r: { isPlaced: true } | { isPlaced: false; reason: string }) {
  if (!r.isPlaced) $.ui.toast(`Enhance: pane not shown (${r.reason}). Enter in the box sends.`)
}

async function start($: EngineInterface, rough: string, model: string) {
  stop.abort()
  await update($, view, () => ({ ...IDLE, phase: 'working', original: rough }))
  await placed($, await $.ui.open({ id: PANE, title: 'Enhance' }))
  $.clock.after(10, () => void finish($, rough, model).catch(err => update($, view, () => ({ ...IDLE, phase: 'error', original: rough, note: String(err) }))))
}

async function closeAll($: EngineInterface) {
  await update($, view, () => IDLE)
  await $.ui.close({ id: PANE })
}

async function send($: EngineInterface) {
  const v = await read($, view)
  const box = await $.prompt.read()
  // The box wins when it holds our text, so edits made there are what gets sent.
  const text = v.isFilled && box.text.trim() !== '' ? box.text : v.enhanced
  if (text.trim() === '') return
  if (v.isFilled) await $.prompt.fill({ text: '' })
  await closeAll($)
  $.clock.after(10, () => void $.prompt.submit({ text, asUser: true }))
}

async function putInBox($: EngineInterface) {
  const v = await read($, view)
  const filled = await $.prompt.fill({ text: v.enhanced })
  await update($, view, old => ({ ...old, isFilled: filled.isFilled }))
}

async function revert($: EngineInterface) {
  const v = await read($, view)
  if (v.isFilled) await $.prompt.fill({ text: v.original })
  await closeAll($)
}

async function cancel($: EngineInterface) {
  stop.abort()
  await closeAll($)
}

// The footer button's chord: enhance whatever is in the box now.
async function enhanceDraft($: EngineInterface, model: string) {
  const draft = (await $.prompt.read()).text.trim()
  if (draft === '') {
    $.ui.toast('Enhance: type a rough prompt first')
    return
  }
  if (draft.startsWith('/')) {
    $.ui.toast('Enhance: the box holds a slash command')
    return
  }
  await start($, draft, model)
}

export const register: Register = (on, options) => {
  const model = String(options.model ?? '').trim() || 'haiku'
  const action = String(options.chordAction ?? '').trim()

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: "Rewrite a rough prompt into a specific one using this project's instructions and skills, then Send",
      argumentHint: '<rough prompt>',
      immediate: true,
    })
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const rough = e.args.trim()
    if (rough === '') return { text: 'Usage: /enhance <rough prompt>. The rewrite replaces the prompt box; Send (or Enter) submits it.' }
    // Headless (claude -p): no box and no pane, so answer with the rewrite itself.
    if ((await $.session.surfaces()).length === 0) {
      const r = await enhance($, rough, model).catch((err): Outcome => ({ ok: false, note: String(err) }))
      return r.ok ? { text: r.text } : { text: `Enhance failed: ${r.note}`, exitCode: 1 }
    }
    try {
      await start($, rough, model)
      return {}
    } catch (err) {
      return { text: `Enhance failed: ${String(err)}` }
    }
  })

  // The person sent the box themselves: the pane has done its job.
  on('prompt.submit', async ($, e, next) => {
    try {
      const v = await read($, view)
      if (e.origin.kind === 'composer' && (v.phase === 'ready' || v.phase === 'error')) await closeAll($)
    } catch {
      // never hold up a prompt over the pane
    }
    return next(e)
  })

  // Closed by the person (Esc, ctrl+x x, its mark) while working: stop the call.
  on('ui.close', async ($, e, next) => {
    if (e.id === PANE && e.origin.kind === 'person') {
      stop.abort()
      await update($, view, () => IDLE)
    }
    return next(e)
  })

  // A small footer button, so the chord bound to `chordAction` presses it from the prompt.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    if (action === '' || e.surface !== 'terminal') return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" gap={1}>
        {e.props.modes.length > 0 && <Text dimColor>{e.props.modes.join(' & ')}</Text>}
        <Button key="enhance" plain dimColor label="✦ enhance" action={action} onPress={() => enhanceDraft($, model)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const v = await read($, view)
    const { Box, Button, Text } = $.ui.resolve(e)

    if (v.phase === 'working') {
      return (
        <Box flexDirection="column">
          <Text color="cyan">✦ Enhancing…</Text>
          <Text dimColor wrap="truncate-end">{v.original}</Text>
          <Button key="cancel" label="Cancel" hotkey="c" onPress={() => cancel($)} />
        </Box>
      )
    }

    if (v.phase === 'error') {
      return (
        <Box flexDirection="column">
          <Text color="red">✦ Enhance failed: {v.note}</Text>
          <Button key="dismiss" label="Dismiss" hotkey="d" onPress={() => cancel($)} />
        </Box>
      )
    }

    if (v.phase === 'idle') return <Text dimColor>Nothing to enhance. Run /enhance &lt;rough prompt&gt;.</Text>

    return (
      <Box flexDirection="column">
        <Text>
          {v.isFilled ? '✦ The enhanced prompt is in the box.' : '✦ Enhanced prompt ready. The box had other text, so it was left alone.'}
        </Text>
        {e.props.isFocused && <Text dimColor>s send · r revert · d dismiss · Esc to edit in the box</Text>}
        {!v.isFilled && <Text dimColor>{v.enhanced}</Text>}
        <Box flexDirection="row" gap={1}>
          <Button key="send" label="Send" hotkey="s" variant="primary" autoFocus onPress={() => send($)} />
          {v.isFilled ? (
            <Button key="revert" label="Revert" hotkey="r" onPress={() => revert($)} />
          ) : (
            <Button key="put" label="Put in box" hotkey="p" onPress={() => putInBox($)} />
          )}
          <Button key="dismiss" label="Dismiss" hotkey="d" onPress={() => cancel($)} />
        </Box>
      </Box>
    )
  })
}
