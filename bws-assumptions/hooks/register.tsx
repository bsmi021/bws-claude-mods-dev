// bws-assumptions: Claude records each assumption it makes while building through a tool of this mod; a small side
// pane lists them (collapsed to one line until Expand), the person marks each Right or Wrong with a correction, and
// Send hands the verdicts back as one prompt so Claude applies the corrections directly.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { Assumption, PaneView } from '../types'
import {
  active,
  add,
  clip,
  GUIDE,
  listText,
  markSent,
  ready,
  sent,
  setCorrection,
  setVerdict,
  statusText,
  summary,
  TOOL_DESCRIPTION,
  TOOL_NAME,
  TOOL_SCHEMA,
  verdictPrompt,
} from './lib'

const PANE = 'bws-assumptions'
const TOOL = `mcp__bws-assumptions__${TOOL_NAME}`
const items = atom({ plugin: 'bws-assumptions', key: 'items' } as const, [] as Assumption[])
const view = atom({ plugin: 'bws-assumptions', key: 'view' } as const, { isExpanded: false, isClosedByPerson: false } as PaneView)

// Corrections typed but not yet saved with Enter, so Send still carries them. Lost on a reload, by design.
const drafts = new Map<number, string>()

async function refreshStatus($: EngineInterface) {
  $.ui.status(statusText(await read($, items)))
}

// Opens the pane unless the person closed it; asked (the command) it always opens and seats at any width.
async function show($: EngineInterface, isAsked: boolean) {
  const v = await read($, view)
  if (v.isClosedByPerson && !isAsked) return { isPlaced: false as const, reason: 'closed by the person' }
  if (isAsked && v.isClosedByPerson) await update($, view, old => ({ ...old, isClosedByPerson: false }))
  return $.ui.open({ id: PANE, title: 'Assumptions' })
}

async function record($: EngineInterface, text: string, why: string) {
  let added: Assumption | undefined
  await update($, items, list => {
    const r = add(list, text, why)
    added = r.item
    return r.list
  })
  await refreshStatus($)
  try {
    await show($, false)
  } catch {
    // the status line still carries the count
  }
  return added
}

async function mark($: EngineInterface, n: number, verdict: 'right' | 'wrong') {
  await update($, items, list => setVerdict(list, n, verdict))
  await refreshStatus($)
}

async function saveCorrection($: EngineInterface, n: number, text: string) {
  drafts.delete(n)
  await update($, items, list => setCorrection(list, n, text))
}

async function send($: EngineInterface) {
  const batch = ready(await read($, items))
  if (batch.length === 0) {
    $.ui.toast('Assumptions: mark one Right or Wrong first')
    return
  }
  const text = verdictPrompt(batch, drafts)
  const ns = batch.map(a => a.n)
  await update($, items, list => {
    let out = list
    for (const a of batch) {
      const d = drafts.get(a.n)
      if (d !== undefined) out = setCorrection(out, a.n, d)
    }
    return markSent(out, ns)
  })
  for (const n of ns) drafts.delete(n)
  await refreshStatus($)
  // Never submit from inside the press: defer it. The engine runs it once the session is idle.
  $.clock.after(10, () => void $.prompt.submit({ text, asUser: true }))
  $.ui.toast(`Assumptions: ${ns.length} sent to Claude`)
}

async function clearReviewed($: EngineInterface) {
  await update($, items, list => list.filter(a => !a.isSent))
  await refreshStatus($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.tool.register({ name: TOOL_NAME, description: TOOL_DESCRIPTION, inputSchema: TOOL_SCHEMA, isDeferred: false })
    await $.command.register({
      name: 'assumptions',
      description: 'Show the assumptions Claude made in this session, to confirm or correct them',
      immediate: true,
    })
    await refreshStatus($)
    return next(e)
  })

  // Tell the model when to call the tool, only where the request offers it (not subagents without it).
  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    if (!e.tools.includes(TOOL)) return r
    return { sections: [...r.sections, { id: 'bws-assumptions:guide', text: GUIDE, scope: 'session' as const }] }
  })

  on('tool.call', { tool: 'mcp__bws-assumptions__record_assumption' }, async ($, e) => {
    const input = e as unknown as { assumption?: unknown; why?: unknown }
    const text = typeof input.assumption === 'string' ? input.assumption.trim() : ''
    const why = typeof input.why === 'string' ? input.why.trim() : ''
    if (text === '') return { deny: 'record_assumption needs `assumption`: the assumption as one plain claim.' }
    const item = await record($, text, why)
    return { result: `Recorded as A${item?.n ?? '?'}. Keep working on this assumption; the user will confirm or correct it from the assumptions pane.` }
  })

  on('command.run', { command: 'assumptions' }, async $ => {
    const list = await read($, items)
    if ((await $.session.surfaces()).length === 0) return { text: listText(list) }
    await update($, view, old => ({ ...old, isExpanded: true }))
    const r = await show($, true)
    return r.isPlaced ? {} : { text: listText(list) }
  })

  // Closed by its mark or key: stop reopening it for each new assumption; the status line keeps the count.
  on('ui.close', async ($, e, next) => {
    if (e.id === PANE && e.origin.kind === 'person') await update($, view, old => ({ ...old, isClosedByPerson: true }))
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Box, Button, Text } = table
    const Input = e.surface !== 'mobile' && 'Input' in table ? table.Input : null
    const list = await read($, items)
    const v = await read($, view)
    const width = Math.max(20, (e.props.bodyColumns ?? 60) - 2)
    const toggle = () => update($, view, old => ({ ...old, isExpanded: !old.isExpanded }))

    if (!v.isExpanded) {
      return (
        <Box flexDirection="row" gap={1}>
          <Text color={active(list).length > 0 ? 'warning' : undefined} dimColor={active(list).length === 0}>
            {summary(list)}
          </Text>
          <Button key="expand" label="Expand" hotkey="e" onPress={toggle} />
        </Box>
      )
    }

    const open = active(list)
    const done = sent(list)
    const toSend = ready(list).length
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Text bold>{summary(list)}</Text>
          <Button key="collapse" label="Collapse" hotkey="e" onPress={toggle} />
        </Box>
        {open.length === 0 && <Text dimColor>Nothing to review. Claude records assumptions here as it builds.</Text>}
        {open.map(a => (
          <Box key={`a-${a.n}`} flexDirection="column">
            <Text wrap="wrap" color={a.verdict === 'wrong' ? 'error' : a.verdict === 'right' ? 'success' : undefined}>
              {`A${a.n} ${a.text}`}
            </Text>
            {a.why !== '' && <Text dimColor wrap="wrap">{`   ${a.why}`}</Text>}
            <Box flexDirection="row" gap={1}>
              <Button key={`right-${a.n}`} label={a.verdict === 'right' ? '✓ Right' : 'Right'} onPress={() => mark($, a.n, 'right')} />
              <Button key={`wrong-${a.n}`} label={a.verdict === 'wrong' ? '✗ Wrong' : 'Wrong'} onPress={() => mark($, a.n, 'wrong')} />
            </Box>
            {a.verdict === 'wrong' &&
              (Input ? (
                <Input
                  key={`fix-${a.n}`}
                  label="Instead: "
                  placeholder="what it should be (empty: Claude asks you)"
                  value={drafts.get(a.n) ?? a.correction}
                  submitLabel="save"
                  onInput={(text: string) => void drafts.set(a.n, text)}
                  onSubmit={(text: string) => void saveCorrection($, a.n, text)}
                />
              ) : (
                <Text dimColor wrap="wrap">{'   Claude will ask you what it should be.'}</Text>
              ))}
          </Box>
        ))}
        {done.length > 0 && (
          <Text dimColor wrap="truncate-end">
            {clip(`${done.length} sent: ${done.slice(-4).map(a => `A${a.n} ${a.verdict}`).join(', ')}`, width)}
          </Text>
        )}
        <Box flexDirection="row" gap={1}>
          <Button key="send" variant="primary" label={`Send ${toSend} to Claude`} hotkey="s" onPress={() => send($)} />
          {done.length > 0 && <Button key="clear" label="Clear sent" hotkey="c" onPress={() => clearReviewed($)} />}
        </Box>
      </Box>
    )
  })
}
