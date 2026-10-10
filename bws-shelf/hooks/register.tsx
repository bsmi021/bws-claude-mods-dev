// bws-shelf: an idea shelf for tangents. /idea <text> parks one without touching the conversation; Claude parks its own
// through mcp__bws-shelf__shelve_idea; /shelf lists this project's open ideas with Resume / Done / Drop.
// One JSON file under the Claude config folder holds every project's ideas, so any session sees the same shelf.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { ShelfView } from '../types'
import {
  addIdea,
  contextLine,
  ideaLine,
  isAllScope,
  listText,
  openIdeas,
  parseShelf,
  projectName,
  resumePrompt,
  serializeShelf,
  setStatus,
  shelfPath,
  slash,
  type By,
  type Idea,
  type Shelf,
  type Status,
} from './lib'

const PANE = 'bws-shelf'
const SHOWN = 8
const TOOL_SHELVE = 'mcp__bws-shelf__shelve_idea'
const TOOL_LIST = 'mcp__bws-shelf__list_ideas'
const TOOL_CLOSE = 'mcp__bws-shelf__close_idea'
const IDLE: ShelfView = { isAll: false, root: '', ideas: [], now: 0, note: '' }
const view = atom({ plugin: 'bws-shelf', key: 'view' } as const, IDLE)

let pathOption = ''

async function filePath($: EngineInterface) {
  const path = shelfPath(pathOption, await $.env.get('CLAUDE_CONFIG_DIR'), (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')))
  if (path === '') throw new Error('no home folder: set the shelfPath option')
  return path
}

// Always from disk: another session may have written since.
async function load($: EngineInterface): Promise<Shelf> {
  const path = await filePath($)
  if (!(await $.fs.exists(path))) return parseShelf(undefined)
  return parseShelf(String(await $.fs.read(path)))
}

// Read, change, write back at once, so concurrent sessions lose nothing but a same-instant race.
async function change<T>($: EngineInterface, fn: (s: Shelf, now: number) => { shelf: Shelf; idea: T }) {
  const now = await $.clock.now()
  const r = fn(await load($), now)
  await $.fs.write(await filePath($), serializeShelf(r.shelf))
  return r.idea
}

async function root($: EngineInterface) {
  return slash(await $.session.root())
}

async function shelve($: EngineInterface, text: string, detail: string | undefined, by: By) {
  const project = await root($)
  return change($, (s, now) => addIdea(s, { text, detail, by, project, now }))
}

async function close($: EngineInterface, id: number, status: Status) {
  return change($, (s, now) => setStatus(s, id, status, now))
}

async function refreshView($: EngineInterface, isAll: boolean, note = '') {
  const r = await root($)
  const ideas = openIdeas(await load($), isAll ? '' : r)
  const now = await $.clock.now()
  await update($, view, () => ({ isAll, root: r, ideas, now, note }))
}

async function isOpen($: EngineInterface) {
  return (await $.ui.panes()).some(p => p.id === PANE)
}

// Focus is asked for only over an empty box (the engine refuses it over text anyway), and only a fresh open grants
// it, so an open pane is closed first. Runs after the command has returned, when the composer is clear.
async function openPane($: EngineInterface, isAll: boolean) {
  await refreshView($, isAll)
  const isEmpty = (await $.prompt.read()).text.trim() === ''
  if (isEmpty && (await isOpen($))) await $.ui.close({ id: PANE })
  const title = isAll ? 'Idea shelf · all projects' : 'Idea shelf'
  const r = await $.ui.open(isEmpty ? { id: PANE, title, focus: true, closeOnEscape: true } : { id: PANE, title })
  if (!r.isPlaced) $.ui.toast(`Shelf: pane not shown (${r.reason}). /shelf in a wider window, or ask Claude to list ideas.`)
}

// A change from a command or a tool redraws an open pane.
async function redrawIfOpen($: EngineInterface) {
  if (await isOpen($)) await refreshView($, (await read($, view)).isAll)
}

async function onClose($: EngineInterface, idea: Idea, status: Status) {
  await close($, idea.id, status)
  await refreshView($, (await read($, view)).isAll, `#${idea.id} ${status === 'done' ? 'done' : 'dropped'}`)
}

async function onResume($: EngineInterface, idea: Idea) {
  const box = (await $.prompt.read()).text.trim()
  if (box !== '') {
    await update($, view, old => ({ ...old, note: 'The prompt box has text: send or clear it first.' }))
    return
  }
  const filled = await $.prompt.fill({ text: resumePrompt(idea) })
  if (!filled.isFilled) {
    await update($, view, old => ({ ...old, note: 'Could not fill the prompt box.' }))
    return
  }
  await $.ui.close({ id: PANE })
  $.ui.toast(`#${idea.id} is in the prompt box. Mark it done from /shelf when finished.`)
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

export const register: Register = (on, options) => {
  pathOption = String(options.shelfPath ?? '')
  const isNudge = options.nudge !== false

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'idea',
      description: 'Shelve an idea for later without sending it to Claude',
      argumentHint: '<idea>',
      immediate: true,
    })
    await $.command.register({
      name: 'shelf',
      description: "Show this project's idea shelf (Resume / Done / Drop); /shelf all for every project",
      argumentHint: '[all]',
      immediate: true,
    })
    await $.tool.register({
      name: 'shelve_idea',
      description:
        "Park an idea on the user's idea shelf instead of acting on it now. Use it for tangents that would sidetrack the " +
        'current task: an improvement you notice, a follow-up, an aside the user mentions. The shelf persists per project ' +
        'across sessions; the user resumes ideas from /shelf. After shelving, continue the current task.',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The idea in one line (under 300 characters).' },
          detail: { type: 'string', description: 'Optional context to resume it later: files, findings, why it matters.' },
        },
        required: ['text'],
      },
      isDeferred: false,
    })
    await $.tool.register({
      name: 'list_ideas',
      description: "List the open ideas on the user's idea shelf, for this project or all projects, with their ids and details.",
      inputSchema: {
        type: 'object',
        properties: { scope: { type: 'string', enum: ['project', 'all'], description: 'project (default) or all.' } },
      },
    })
    await $.tool.register({
      name: 'close_idea',
      description: 'Mark a shelved idea done (it was carried out) or dropped (no longer wanted), by its id.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'number', description: 'The idea id, as list_ideas shows it (#12 → 12).' },
          status: { type: 'string', enum: ['done', 'dropped', 'open'], description: 'done, dropped, or open to reopen it.' },
        },
        required: ['id', 'status'],
      },
    })
    return next(e)
  })

  on('command.run', { command: 'idea' }, async ($, e) => {
    const text = e.args.trim()
    if (text === '') return { text: 'Usage: /idea <idea>. It goes on this project\'s shelf; /shelf shows it.' }
    const isHeadless = (await $.session.surfaces()).length === 0
    try {
      const idea = await shelve($, text, undefined, 'user')
      await redrawIfOpen($)
      if (isHeadless) return { text: `Shelved #${idea.id}: ${idea.text}` }
      $.ui.toast(`Shelved #${idea.id}`)
      return {}
    } catch (err) {
      return { text: `Shelf: could not save (${String(err)})`, exitCode: 1 }
    }
  })

  on('command.run', { command: 'shelf' }, async ($, e) => {
    const isAll = isAllScope(e.args)
    try {
      if ((await $.session.surfaces()).length === 0) {
        const ideas = openIdeas(await load($), isAll ? '' : await root($))
        const now = await $.clock.now()
        return { text: ideas.length === 0 ? 'The shelf is empty.' : listText(ideas, now, isAll, true) }
      }
      $.clock.after(10, () => void openPane($, isAll).catch(err => $.ui.toast(`Shelf: could not open (${String(err)})`)))
      return {}
    } catch (err) {
      return { text: `Shelf: could not read (${String(err)})`, exitCode: 1 }
    }
  })

  on('tool.call', { tool: TOOL_SHELVE }, async ($, e) => {
    const input = e as unknown as { text?: unknown; detail?: unknown }
    const text = str(input.text).trim()
    if (text === '') return { deny: 'shelve_idea needs text: the idea in one line.' }
    try {
      const idea = await shelve($, text, str(input.detail) || undefined, 'claude')
      await redrawIfOpen($)
      $.ui.toast(`Claude shelved #${idea.id}: ${idea.text}`)
      return { result: `Shelved as #${idea.id}. Don't pursue it now; continue the current task.` }
    } catch (err) {
      return { deny: `Could not save the idea: ${String(err)}` }
    }
  })

  on('tool.call', { tool: TOOL_LIST }, async ($, e) => {
    const isAll = str((e as unknown as { scope?: unknown }).scope) === 'all'
    try {
      const ideas = openIdeas(await load($), isAll ? '' : await root($))
      const now = await $.clock.now()
      if (ideas.length === 0) return { result: isAll ? 'The shelf is empty.' : 'No open ideas for this project.' }
      return { result: listText(ideas, now, isAll, true) }
    } catch (err) {
      return { deny: `Could not read the shelf: ${String(err)}` }
    }
  })

  on('tool.call', { tool: TOOL_CLOSE }, async ($, e) => {
    const input = e as unknown as { id?: unknown; status?: unknown }
    const id = Number(String(input.id ?? '').replace(/^#/, ''))
    const status = str(input.status)
    if (!Number.isInteger(id) || id < 1) return { deny: 'close_idea needs the numeric id of an idea.' }
    if (status !== 'done' && status !== 'dropped' && status !== 'open') return { deny: 'status must be done, dropped or open.' }
    try {
      const idea = await close($, id, status)
      if (!idea) return { deny: `No idea #${id} on the shelf.` }
      await redrawIfOpen($)
      return { result: `#${id} is ${status}: ${idea.text}` }
    } catch (err) {
      return { deny: `Could not update the shelf: ${String(err)}` }
    }
  })

  // One line in an attended conversation's first-message context: the open count and the tool, so tangents get shelved, not followed.
  on('prompt.context', async ($, e, next) => {
    const result = await next(e)
    if (!isNudge) return result
    try {
      if ((await $.session.surfaces()).length === 0) return result
      const count = openIdeas(await load($), await root($)).length
      return { ...result, blocks: [...result.blocks, { name: 'ideaShelf', text: contextLine(count, TOOL_SHELVE) }] }
    } catch {
      return result
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const v = await read($, view)
    const { Box, Button, Text } = $.ui.resolve(e)
    const shown = v.ideas.slice(0, SHOWN)
    const more = v.ideas.length - shown.length
    const where = v.isAll ? 'all projects' : projectName(v.root)

    return (
      <Box flexDirection="column">
        <Text bold>
          💡 {v.ideas.length} open idea{v.ideas.length === 1 ? '' : 's'} · {where}
        </Text>
        {v.ideas.length === 0 && <Text dimColor>Nothing shelved. /idea &lt;text&gt; adds one; Claude adds its own tangents.</Text>}
        {shown.map(i => (
          <Box key={`idea-${i.id}`} flexDirection="row" gap={1}>
            <Button key={`resume-${i.id}`} plain label="▶" onPress={() => onResume($, i)} />
            <Button key={`done-${i.id}`} plain label="✓" onPress={() => onClose($, i, 'done')} />
            <Button key={`drop-${i.id}`} plain label="✗" onPress={() => onClose($, i, 'dropped')} />
            <Box flexGrow={1} flexShrink={1}>
              <Text wrap="wrap">{ideaLine(i, v.now, v.isAll)}</Text>
            </Box>
          </Box>
        ))}
        {more > 0 && <Text dimColor>…{more} more: ask Claude to list ideas.</Text>}
        {v.note !== '' && <Text color="yellow">{v.note}</Text>}
        <Box flexDirection="row" gap={1}>
          <Button key="scope" label={v.isAll ? 'This project' : 'All projects'} hotkey="a" onPress={() => refreshView($, !v.isAll)} />
          <Button key="close" label="Close" hotkey="c" onPress={() => $.ui.close({ id: PANE })} />
        </Box>
        {e.props.isFocused && <Text dimColor>▶ resume (fills the prompt box) · ✓ done · ✗ drop</Text>}
      </Box>
    )
  })
}
