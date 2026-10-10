import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { BoardOwn } from '../types'
import {
  BEAT_MS,
  STALE_MS,
  SWEEP_MS,
  TEXT_MAX,
  actError,
  addAct,
  addAsk,
  addClaim,
  addMessage,
  askLine,
  askTarget,
  askViews,
  boardDir,
  cardPath,
  cardText,
  claimHolder,
  denyText,
  dropClaims,
  idFromFile,
  introText,
  isLive,
  livePeers,
  newCard,
  news,
  newsText,
  nextAskId,
  normFile,
  normRole,
  peerLines,
  readBoard,
  redact,
  relTo,
  resolvePeer,
  settleAsks,
  shortId,
  shorten,
  shownAsks,
  statusText,
  summary,
  sweepable,
  taskFrom,
  toSlash,
  tombstone,
  toText,
  unread,
  wakeTargets,
  wakeText,
} from './board'
import type { ActKind, Board, Card, Inbox, Limits, Self } from './board'
import { writeTargets } from './shell'
import type { Dialect } from './shell'

const roleAtom = atom({ plugin: 'bws-board', key: 'role' } as const, null)
const ownAtom = atom({ plugin: 'bws-board', key: 'own' } as const, {})
const summaryAtom = atom({ plugin: 'bws-board', key: 'summary' } as const, null)
const linesAtom = atom({ plugin: 'bws-board', key: 'lines' } as const, [])

const PANE = 'board'
const PENDING_MAX = 20
const OWN_MAX = 4 // sessions' own cards kept in state: this one and the few before it in this process

type Options = { isOn: boolean; lim: Limits; isWake: boolean; wakeMs: number }
type Ctx = { dir: string; folder: string; selfId: string; cwd: string }
type Pending = BoardOwn['pending']

const settle = async <T,>(p: Promise<T>): Promise<T | undefined> => {
  try {
    return await p
  } catch {
    return undefined
  }
}

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err))
const dialectOf = (tool: string): Dialect => (tool === 'PowerShell' ? 'powershell' : 'bash')

// ---------- board I/O ----------
// One folder per repository under <config dir>/bws-board/, one card file per session. Each session
// writes only its own card and keeps it in $.state (keyed by its session id), so no write races
// another. A board that cannot be read or written never blocks work: edits pass and the person is
// told once.

// The config dir and each cwd's folder never change for a process: looked up once.
let configDir: string | null | undefined
const folders = new Map<string, string>()
let failNoted = false
// Sessions that left (session.end): a heartbeat still in flight must not write their card back.
const left = new Set<string>()
// The last good copy of every card, for a read that lands mid-write.
let lastGood: Record<string, Card> = {}

async function boardCtx($: EngineInterface): Promise<Ctx | undefined> {
  if (configDir === undefined) {
    const own = await settle($.env.get('CLAUDE_CONFIG_DIR'))
    const home = own ? undefined : (await settle($.env.get('USERPROFILE'))) || (await settle($.env.get('HOME')))
    configDir = own ? toSlash(own) : home ? `${toSlash(home)}/.claude` : null
  }
  if (configDir === null) return undefined
  const [selfId, cwd] = await Promise.all([$.session.id(), $.session.cwd()])
  let folder = folders.get(cwd)
  if (folder === undefined) {
    // The repo's root (the main tree's, for a worktree), else where the session started.
    const repo = await settle($.session.repo())
    folder = toSlash(repo?.root ?? (await settle($.session.root())) ?? cwd)
    folders.set(cwd, folder)
  }
  return { dir: boardDir(configDir, folder), folder, selfId, cwd }
}

// The role this process goes by: one set with /board role, else BWS_AGENT_ROLE from launch.
async function currentRole($: EngineInterface): Promise<string | null> {
  const set = await read($, roleAtom)
  if (set !== null) return set
  const env = await settle($.env.get('BWS_AGENT_ROLE'))
  if (!env) return null
  const r = normRole(env)
  return 'role' in r ? r.role : null
}

// The map with this session's own card put in, keeping only the newest few sessions.
const keepOwn = (m: Readonly<Record<string, BoardOwn>>, own: BoardOwn): Record<string, BoardOwn> =>
  Object.fromEntries(
    [own, ...Object.values(m).filter(x => x.sessionId !== own.sessionId && !left.has(x.sessionId))]
      .sort((a, b) => (a.sessionId === own.sessionId ? -1 : b.sessionId === own.sessionId ? 1 : b.joinedAt - a.joinedAt))
      .slice(0, OWN_MAX)
      .map(x => [x.sessionId, x]),
  )

const freshOwn = (ctx: Ctx, now: number, role: string | null): BoardOwn => ({
  sessionId: ctx.selfId,
  joinedAt: now,
  seq: 0,
  card: newCard(ctx.selfId, ctx.cwd, now, role),
  cursors: {},
  seen: {},
  lastWake: {},
  pending: { lines: [], messages: [] },
  known: null,
})

async function readFolder($: EngineInterface, ctx: Ctx): Promise<Board> {
  const entries = (await settle($.fs.list(ctx.dir))) ?? []
  const ids = entries.filter(e => e.kind === 'file').flatMap(e => idFromFile(e.name) ?? [])
  const files = await Promise.all(ids.map(async id => ({ id, text: await settle($.fs.read(cardPath(ctx.dir, id))) })))
  const b = readBoard(ctx.folder, files, lastGood)
  lastGood = b.cards
  return b
}

function noteFailure($: EngineInterface, err: unknown) {
  if (failNoted) return
  failNoted = true
  $.ui.toast(`bws-board: the board is unavailable (${errText(err)}); edits are not checked for other sessions' claims`)
}

// The pane's lines: who is here and the asks worth showing.
function paneLines(b: Board, self: Self, now: number, lim: Limits): string[] {
  const asks = shownAsks(askViews(b, now, lim.staleMs), now)
  const me = b.cards[self.id]
  return [
    `This session: ${self.role ?? 'no role'} (${shortId(self.id)}) · ${me?.task || 'no task recorded'}`,
    ...peerLines(b, self.id, now, lim),
    ...(asks.length > 0 ? ['Asks:', ...asks.map(v => askLine(v, b))] : ['No asks on the board.']),
  ]
}

// Reads the board, changes this session's own card, and writes it. Returns the board with the new card.
async function sync(
  $: EngineInterface,
  ctx: Ctx,
  lim: Limits,
  change: (own: BoardOwn, b: Board, now: number) => BoardOwn,
): Promise<{ own: BoardOwn; board: Board; now: number }> {
  if (left.has(ctx.selfId)) throw new Error('this session left the board')
  const now = await $.clock.now()
  const role = await currentRole($)
  const b0 = await readFolder($, ctx)
  const all = await update($, ownAtom, m => {
    const c = change(m[ctx.selfId] ?? freshOwn(ctx, now, role), b0, now)
    return keepOwn(m, { ...c, card: { ...c.card, seenAt: now, cwd: ctx.cwd, role } })
  })
  const own = all[ctx.selfId]
  if (own === undefined) throw new Error('board state was not written')
  if (left.has(ctx.selfId)) throw new Error('this session left the board')
  await $.fs.write(cardPath(ctx.dir, ctx.selfId), cardText(own.card))
  const board: Board = { ...b0, cards: { ...b0.cards, [ctx.selfId]: own.card } }
  lastGood = board.cards
  const self = { id: ctx.selfId, role }
  await update($, summaryAtom, () => summary(board, self, now, lim.staleMs))
  await update($, linesAtom, () => paneLines(board, self, now, lim))
  return { own, board, now }
}

async function boardUpdate($: EngineInterface, lim: Limits, change: (own: BoardOwn, b: Board, now: number) => BoardOwn) {
  const ctx = await boardCtx($)
  if (ctx === undefined) return undefined
  return { ctx, ...(await sync($, ctx, lim, change)) }
}

// Folds what changed on the board into this session's card: outcomes of its own asks, new asks for
// it, messages, peers that joined. What the model has not been told yet is queued in `pending`.
function withNews(own: BoardOwn, b: Board, now: number, lim: Limits, out: { fresh: Pending }): BoardOwn {
  const self = { id: own.sessionId, role: own.card.role }
  const board: Board = { ...b, cards: { ...b.cards, [own.sessionId]: own.card } }
  const views = askViews(board, now, lim.staleMs)
  const settled = settleAsks(own.card.asks, views)
  const n = news(views, self, own.seen, now, board)
  const u = unread(board, own.sessionId, own.joinedAt, own.cursors)
  const peers = livePeers(board, own.sessionId, now, lim.staleMs)
  const known = own.known
  const joined =
    known === null
      ? []
      : peers
          .filter(p => !known.includes(p.sessionId))
          .map(p => `- ${p.role ? `${p.role} (${shortId(p.sessionId)})` : shortId(p.sessionId)} joined the board${p.task ? `; its task: "${p.task}"` : ''}`)
  out.fresh = { lines: [...joined, ...n.lines], messages: u.messages }
  return {
    ...own,
    card: settled ? { ...own.card, asks: settled } : own.card,
    seen: n.seen,
    cursors: u.cursors,
    known: peers.map(p => p.sessionId),
    pending: {
      lines: [...own.pending.lines, ...out.fresh.lines].slice(-PENDING_MAX),
      messages: [...own.pending.messages, ...out.fresh.messages].slice(-PENDING_MAX),
    },
  }
}

// The heartbeat: keeps this session's card live and picks up news for it.
async function beat($: EngineInterface, lim: Limits) {
  try {
    const out: { fresh: Pending } = { fresh: { lines: [], messages: [] } }
    await boardUpdate($, lim, (own, b, now) => withNews(own, b, now, lim, out))
    const first = out.fresh.lines[0] ?? out.fresh.messages[0]?.text
    const count = out.fresh.lines.length + out.fresh.messages.length
    if (first !== undefined) $.ui.toast(`board: ${shorten(first.replace(/^- /, ''), 90)}${count > 1 ? ` (+${count - 1} more)` : ''}`, { timeoutMs: 8000 })
  } catch (err) {
    if (!left.has((await settle($.session.id())) ?? '')) noteFailure($, err)
  }
}

// Takes the queued news for the model, once.
async function takePending($: EngineInterface): Promise<Pending | undefined> {
  const id = await $.session.id()
  const cur = (await read($, ownAtom))[id]
  if (cur === undefined || (cur.pending.lines.length === 0 && cur.pending.messages.length === 0)) return undefined
  let taken: Pending | undefined
  await update($, ownAtom, m => {
    const v = m[id]
    if (v === undefined) return m
    taken = v.pending
    return { ...m, [id]: { ...v, pending: { lines: [], messages: [] } } }
  })
  return taken
}

const pendingText = (p: Pending, b: Board) => newsText(p.lines, p.messages, b)

// Files a tool call is about to write. `claim`: whether the write also claims the file. Edit, Write
// and NotebookEdit claim their file; a shell write claims a file inside the board's folder that it
// plainly names (not cp/mv's guess at dest/<name>), so logs in /tmp claim nothing.
type Write = { path: string; claim: boolean; isShell: boolean }

function writesOf(e: Record<string, unknown>): Write[] {
  if (e.tool === 'Edit' || e.tool === 'Write') return typeof e.file_path === 'string' ? [{ path: e.file_path, claim: true, isShell: false }] : []
  if (e.tool === 'NotebookEdit') return typeof e.notebook_path === 'string' ? [{ path: e.notebook_path, claim: true, isShell: false }] : []
  if ((e.tool === 'Bash' || e.tool === 'PowerShell') && typeof e.command === 'string') {
    return writeTargets(e.command, dialectOf(e.tool)).map(t => ({ path: t.path, claim: t.isGuess !== true, isShell: true }))
  }
  return []
}

// The run folder a written file sits in (runs/<date>-<slug>/), relative to the board's folder.
const runOf = (file: string, folder: string) => /^runs\/(\d{4}-\d{2}-\d{2}-[^/]+)\//.exec(relTo(file, folder))?.[1]

// The write check: a file another live session claimed is refused; otherwise this session claims
// the files it writes. Returns the refusal text, or undefined to let the call go on.
async function claimWrites($: EngineInterface, lim: Limits, writes: readonly Write[]): Promise<string | undefined> {
  const ctx = await boardCtx($)
  if (ctx === undefined) return undefined
  const inFolder = `${normFile(ctx.folder, ctx.cwd)}/`
  const files = [...new Map(writes.map(w => [normFile(w.path, ctx.cwd), w] as const))]
  const now = await $.clock.now()
  const claims = (await read($, ownAtom))[ctx.selfId]?.card.claims ?? []
  const b = await readFolder($, ctx)
  for (const [file, w] of files) {
    const holder = claimHolder(b, ctx.selfId, file, now, lim, claims.find(c => c.path === file))
    if (holder === undefined) continue
    const text = denyText(holder, file, ctx.folder, now, lim)
    return w.isShell ? `${text} (This command writes it: ${w.path}.)` : text
  }
  const toClaim = files.filter(([file, w]) => w.claim && (!w.isShell || file.startsWith(inFolder))).map(([file]) => file)
  const last = toClaim[toClaim.length - 1]
  if (last === undefined) return undefined
  const run = toClaim.map(f => runOf(f, ctx.folder)).find(r => r !== undefined)
  await sync($, ctx, lim, (own, f, t) => ({
    ...own,
    card: { ...own.card, lastFile: last, run: run ?? own.card.run, claims: toClaim.reduce((cs, file) => addClaim(cs, file, t, lim.claimMs), own.card.claims) },
  }))
  return undefined
}

// The opening block for a conversation: shown when a peer is live or an ask waits for this session.
async function intro($: EngineInterface, lim: Limits): Promise<string | undefined> {
  const r = await boardUpdate($, lim, (own, b, now) => {
    const out: { fresh: Pending } = { fresh: { lines: [], messages: [] } }
    // Everything on the board now is in the intro: mark it told, queue nothing.
    const w = withNews(own, b, now, lim, out)
    return { ...w, pending: own.pending }
  })
  if (r === undefined) return undefined
  const self = { id: r.own.sessionId, role: r.own.card.role }
  const asksForMe = summary(r.board, self, r.now, lim.staleMs).askedOfMe
  if (livePeers(r.board, self.id, r.now, lim.staleMs).length === 0 && asksForMe === 0) return undefined
  return introText(r.board, self, r.now, lim)
}

// Leaves a tombstone at exit, /clear, resume or branch, inside session.end's short bound.
async function leave($: EngineInterface, sessionId: string) {
  left.add(sessionId)
  const ctx = await boardCtx($)
  if (ctx === undefined) return
  const now = await $.clock.now()
  const card = (await read($, ownAtom))[sessionId]?.card ?? newCard(sessionId, ctx.cwd, now, null)
  await update($, ownAtom, m => Object.fromEntries(Object.entries(m).filter(([k]) => k !== sessionId)))
  await $.fs.write(cardPath(ctx.dir, sessionId), cardText(tombstone(card, now)))
}

// Deletes card files untouched for a day: the folder has no other way to shrink.
async function sweep($: EngineInterface, ctx: Ctx) {
  const now = await $.clock.now()
  const names = sweepable((await settle($.fs.list(ctx.dir))) ?? [], ctx.selfId, now, SWEEP_MS)
  const isWin = /^[a-z]:\//i.test(ctx.dir)
  for (const name of names) {
    const path = `${ctx.dir}/${name}`
    const argv = isWin ? ['cmd', '/d', '/c', 'del', '/q', path.split('/').join(String.fromCharCode(92))] : ['rm', '-f', path]
    await settle($.process.run(argv, { timeoutMs: 10_000 }))
  }
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const clean = (v: unknown, max: number) => shorten(redact(str(v).replace(/\s+/g, ' ')), max)

// take, done, decline: one act on someone else's ask.
async function act($: EngineInterface, o: Options, kind: ActKind, rawId: unknown, rawNote: unknown) {
  const id = str(rawId)
  const note = clean(rawNote, 300)
  try {
    const ctx = await boardCtx($)
    if (ctx === undefined) return { result: 'The board is off here: no Claude config folder found.' }
    const b = await readFolder($, ctx)
    const now = await $.clock.now()
    const self = { id: ctx.selfId, role: await currentRole($) }
    const v = askViews(b, now, o.lim.staleMs).find(x => x.id === id)
    const err = actError(v, id, self, kind, b)
    if (err !== undefined) return { result: err }
    await sync($, ctx, o.lim, (own, f, t) => ({ ...own, card: { ...own.card, acts: addAct(own.card.acts, { askId: id, kind, at: t, ...(note ? { note } : {}) }) } }))
    const asker = v ? toText(`session:${v.from}`, b) : 'the asker'
    const said = { take: `Took ask ${id}.`, done: `Marked ask ${id} done.`, decline: `Declined ask ${id}.` }[kind]
    return { result: `${said} ${asker} hears about it after their next tool call or prompt.` }
  } catch (err) {
    return { result: `The board could not be written (${errText(err)}).` }
  }
}


export const register: Register = (on, options) => {
  const o: Options = {
    isOn: options.board !== false,
    lim: { staleMs: STALE_MS, claimMs: Math.max(1, Number(options.claimMinutes ?? 30)) * 60_000 },
    isWake: options.urgentWake !== false,
    wakeMs: Math.max(1, Number(options.wakeMinutes ?? 5)) * 60_000,
  }
  if (!o.isOn) return

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'board', description: 'Show the board of Claude Code sessions in this repo; /board role <name> sets this session\'s role; /board pane opens it live', argumentHint: '[role <name> | pane]' })
    await $.tool.register({
      name: 'board_status',
      description:
        'Board: list the other Claude Code sessions live in this repository (role, what each works on, busy or idle, the files it claimed), ' +
        'the open asks, and your unread messages. Pass "task" to record what this session is working on, so the others see it. ' +
        'Call it before a large edit when other sessions are here.',
      inputSchema: { type: 'object', properties: { task: { type: 'string', description: 'Optional: one line on what this session is working on now.' } } },
    })
    await $.tool.register({
      name: 'board_ask',
      description:
        'Board: ask the other sessions for something you need (a review, a fix in a file they hold, a test run). "to" is a role (api, tests, ...), ' +
        'a session id, or "anyone". The ask stays on the board until someone takes it and marks it done; you hear back after a tool result or your next prompt. ' +
        '"urgent" also wakes a named idle session (at most once per few minutes per session); use it only when you are blocked.',
      inputSchema: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'A role, a session id (or its first 8 characters), or "anyone".' },
          text: { type: 'string', description: 'What you need, in a sentence or two.' },
          urgent: { type: 'boolean', description: 'Wake the named session now if it is idle. Default false.' },
        },
        required: ['to', 'text'],
      },
    })
    await $.tool.register({
      name: 'board_take',
      description: 'Board: take an ask (by its id from board_status) so the others know you are on it.',
      inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'The ask id, like 1a2b3c4d-3.' } }, required: ['id'] },
    })
    await $.tool.register({
      name: 'board_done',
      description: 'Board: mark an ask done, with a short note on the outcome the asker reads.',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string', description: 'The ask id.' }, note: { type: 'string', description: 'What was done, or where to look.' } },
        required: ['id'],
      },
    })
    await $.tool.register({
      name: 'board_decline',
      description: 'Board: decline an ask (or give back one you took), with a short reason.',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string', description: 'The ask id.' }, note: { type: 'string', description: 'Why, or who could do it instead.' } },
        required: ['id'],
      },
    })
    await $.tool.register({
      name: 'board_withdraw',
      description: 'Board: withdraw one of your own asks that is no longer needed.',
      inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'The ask id.' } }, required: ['id'] },
    })
    await $.tool.register({
      name: 'board_send',
      description:
        'Board: send a short message to another session live in this repository, or to all of them, e.g. to ask it to release a file it claimed. ' +
        'It reaches them after their next tool call or prompt. For something you need done, prefer board_ask.',
      inputSchema: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'A role, a session id (or its first 8 characters), or "all".' },
          text: { type: 'string', description: 'The message.' },
        },
        required: ['to', 'text'],
      },
    })
    await $.tool.register({
      name: 'board_release',
      description: 'Board: give up files this session claimed, so another session can edit them. No paths: release every claim.',
      inputSchema: { type: 'object', properties: { paths: { type: 'array', items: { type: 'string' }, description: 'Files to release; empty for all.' } } },
    })
    const ctx = await settle(boardCtx($))
    if (ctx !== undefined) {
      try {
        await sync($, ctx, o.lim, own => own)
      } catch (err) {
        noteFailure($, err)
      }
      void settle(sweep($, ctx))
    }
    $.clock.every(BEAT_MS, () => void beat($, o.lim))
    return next(e)
  })

  // A new conversation (also after /clear and resume, which start no session.start) gets who is here.
  on('prompt.context', async ($, e, next) => {
    const result = await next(e)
    const text = await settle(intro($, o.lim))
    return text === undefined ? result : { ...result, blocks: [...result.blocks, { name: 'bwsBoard', text }] }
  })

  // The person's prompt says what this session works on; news for the model rides along.
  on('prompt.submit', async ($, e, next) => {
    const isPerson = e.origin.kind === 'composer' || e.origin.kind === 'bridge' || e.origin.kind === 'sdk'
    const task = isPerson ? taskFrom(e.text) : undefined
    let b: Board | undefined
    try {
      b = (await boardUpdate($, o.lim, own => ({ ...own, card: { ...own.card, status: 'busy', task: task ?? own.card.task } })))?.board
    } catch (err) {
      noteFailure($, err)
    }
    const p = await settle(takePending($))
    if (p === undefined) return next(e)
    return next({ ...e, context: [...(e.context ?? []), `bws-board: ${pendingText(p, b ?? { folder: '', cards: lastGood })}`] })
  })

  // The main loop's turn ended, so this session is idle (a subagent's turn is not).
  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) void settle(boardUpdate($, o.lim, own => ({ ...own, card: { ...own.card, status: 'idle' } })))
    return next(e)
  })

  // A write to a file another live session claimed is refused: Edit, Write, NotebookEdit, and a Bash
  // or PowerShell command that writes one (redirect, tee, sed -i, cp/mv, the PowerShell write
  // cmdlets; command position only). Otherwise the written files are claimed.
  on('tool.call', { tool: ['Edit', 'Write', 'NotebookEdit', 'Bash', 'PowerShell'] }, async ($, e, next) => {
    const writes = writesOf(e as unknown as Record<string, unknown>)
    if (writes.length > 0) {
      let refusal: string | undefined
      try {
        refusal = await claimWrites($, o.lim, writes)
      } catch (err) {
        noteFailure($, err)
      }
      if (refusal !== undefined) {
        $.ui.toast(`board: refused ${e.tool === 'Bash' || e.tool === 'PowerShell' ? 'a command that writes' : 'an edit of'} a file another session claimed`, { timeoutMs: 6000 })
        return { deny: refusal }
      }
    }
    return next(e)
  })

  // News from other sessions reaches the model after the next tool result.
  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    if (r.deny !== undefined || (e as { agentId?: string }).agentId !== undefined) return r
    const p = await settle(takePending($))
    return p === undefined ? r : { ...r, context: [...(r.context ?? []), `bws-board: ${pendingText(p, { folder: '', cards: lastGood })}`] }
  })

  on('session.end', async ($, e, next) => {
    await settle(leave($, e.sessionId))
    return next(e)
  })

  // ---------- tools ----------

  on('tool.call', { tool: 'mcp__bws-board__board_status' }, async ($, e) => {
    const task = clean(e.task, 100)
    try {
      const out: { fresh: Pending } = { fresh: { lines: [], messages: [] } }
      let p: Pending = { lines: [], messages: [] }
      const r = await boardUpdate($, o.lim, (own, b, now) => {
        const w = withNews({ ...own, card: { ...own.card, task: task || own.card.task } }, b, now, o.lim, out)
        p = w.pending
        return { ...w, pending: { lines: [], messages: [] } }
      })
      if (r === undefined) return { result: 'The board is off here: no Claude config folder found.' }
      const self = { id: r.own.sessionId, role: r.own.card.role }
      const status = statusText(r.board, self, r.now, o.lim, { task: r.own.card.task, claims: r.own.card.claims }, p.messages)
      return { result: p.lines.length > 0 ? `${status}\nNew since you last heard:\n${p.lines.join('\n')}` : status }
    } catch (err) {
      return { result: `The board could not be read: ${errText(err)}` }
    }
  })

  on('tool.call', { tool: 'mcp__bws-board__board_ask' }, async ($, e) => {
    const text = redact(str(e.text)).slice(0, TEXT_MAX)
    if (text.length === 0) return { result: 'Nothing posted: "text" is empty.' }
    try {
      const ctx = await boardCtx($)
      if (ctx === undefined) return { result: 'Nothing posted: the board is off here (no Claude config folder found).' }
      const b = await readFolder($, ctx)
      const target = askTarget(b, ctx.selfId, str(e.to), await $.clock.now(), o.lim.staleMs)
      if ('error' in target) return { result: `Nothing posted. ${target.error}` }
      const isUrgent = e.urgent === true
      let id = ''
      const r = await sync($, ctx, o.lim, (own, f, now) => {
        id = nextAskId(own.sessionId, own.card.asks)
        return { ...own, card: { ...own.card, asks: addAsk(own.card.asks, { id, to: target.to, text, urgent: isUrgent, at: now, state: 'open' }) } }
      })
      const parts = [`Posted ask ${id} to ${toText(target.to, r.board)}.`]
      if (target.note) parts.push(target.note)
      if (isUrgent && o.isWake) {
        const self = { id: ctx.selfId, role: r.own.card.role }
        const w = wakeTargets(r.board, self, target.to, r.own.lastWake, r.now, { ...o.lim, wakeMs: o.wakeMs })
        const ask = r.own.card.asks.find(a => a.id === id)
        const woke: string[] = []
        const failed: string[] = []
        for (const sid of w.wake) {
          if (ask === undefined) break
          const sent = await settle($.session.send({ to: { sessionId: sid }, text: wakeText(ask, self) }))
          if (sent?.isDelivered) woke.push(sid)
          else failed.push(`${shortId(sid)} (${sent?.reason ?? 'send failed'})`)
        }
        if (woke.length > 0) await sync($, ctx, o.lim, (own, f, now) => ({ ...own, lastWake: { ...own.lastWake, ...Object.fromEntries(woke.map(s => [s, now])) } }))
        if (woke.length > 0) parts.push(`Woke ${woke.map(shortId).join(', ')}.`)
        if (w.held.length > 0) parts.push(`Not woken again (woken in the last ${Math.round(o.wakeMs / 60_000)} min): ${w.held.map(shortId).join(', ')}.`)
        if (failed.length > 0) parts.push(`Could not wake: ${failed.join(', ')}.`)
        if (w.wake.length === 0 && w.held.length === 0) parts.push(target.to === 'anyone' ? 'An ask to anyone wakes nobody.' : 'Nobody live to wake.')
      } else if (isUrgent) parts.push('Urgent wake is off (urgentWake option); the ask waits on the board.')
      parts.push('You hear back after a tool result or with the next prompt.')
      return { result: parts.join(' ') }
    } catch (err) {
      return { result: `Nothing posted: the board could not be written (${errText(err)}).` }
    }
  })

  on('tool.call', { tool: 'mcp__bws-board__board_take' }, async ($, e) => act($, o, 'take', e.id, undefined))
  on('tool.call', { tool: 'mcp__bws-board__board_done' }, async ($, e) => act($, o, 'done', e.id, e.note))
  on('tool.call', { tool: 'mcp__bws-board__board_decline' }, async ($, e) => act($, o, 'decline', e.id, e.note))

  on('tool.call', { tool: 'mcp__bws-board__board_withdraw' }, async ($, e) => {
    const id = str(e.id)
    try {
      const ctx = await boardCtx($)
      if (ctx === undefined) return { result: 'The board is off here: no Claude config folder found.' }
      const b = await readFolder($, ctx)
      const now = await $.clock.now()
      const self = { id: ctx.selfId, role: await currentRole($) }
      const err = actError(askViews(b, now, o.lim.staleMs).find(x => x.id === id), id, self, 'withdraw', b)
      if (err !== undefined) return { result: err }
      await sync($, ctx, o.lim, own => ({ ...own, card: { ...own.card, asks: own.card.asks.map(a => (a.id === id ? { ...a, state: 'withdrawn' as const } : a)) } }))
      return { result: `Withdrew ask ${id}.` }
    } catch (err) {
      return { result: `The board could not be written (${errText(err)}).` }
    }
  })

  on('tool.call', { tool: 'mcp__bws-board__board_send' }, async ($, e) => {
    const text = redact(str(e.text)).slice(0, TEXT_MAX)
    if (text.length === 0) return { result: 'Nothing sent: "text" is empty.' }
    try {
      const ctx = await boardCtx($)
      if (ctx === undefined) return { result: 'Nothing sent: the board is off here (no Claude config folder found).' }
      const b = await readFolder($, ctx)
      const target = resolvePeer(b, ctx.selfId, str(e.to), await $.clock.now(), o.lim.staleMs)
      if ('error' in target) return { result: `Nothing sent. ${target.error}` }
      const r = await sync($, ctx, o.lim, (own, f, now) => ({
        ...own,
        seq: own.seq + 1,
        card: { ...own.card, outbox: addMessage(own.card.outbox, { seq: own.seq + 1, to: target.id, text, at: now }, now) },
      }))
      const whom = target.id === 'all' ? 'every other live session on the board' : toText(`session:${target.id}`, r.board)
      return { result: `Sent to ${whom} (message ${r.own.seq}). It reaches them after their next tool call or prompt; their reply comes back the same way.` }
    } catch (err) {
      return { result: `Nothing sent: the board could not be written (${errText(err)}).` }
    }
  })

  on('tool.call', { tool: 'mcp__bws-board__board_release' }, async ($, e) => {
    const raw = Array.isArray(e.paths) ? e.paths.filter((p): p is string => typeof p === 'string' && p.trim().length > 0) : []
    try {
      const ctx = await boardCtx($)
      if (ctx === undefined) return { result: 'The board is off here: no Claude config folder found.' }
      const files = raw.map(p => normFile(p, ctx.cwd))
      const r = await sync($, ctx, o.lim, own => ({ ...own, card: { ...own.card, claims: dropClaims(own.card.claims, files) } }))
      const held = r.own.card.claims.map(c => relTo(c.path, ctx.folder))
      return { result: `Released ${files.length === 0 ? 'every claim' : files.map(f => relTo(f, ctx.folder)).join(', ')}. Still claimed: ${held.length > 0 ? held.join(', ') : 'nothing'}.` }
    } catch (err) {
      return { result: `Nothing released: the board could not be written (${errText(err)}).` }
    }
  })

  // ---------- /board ----------

  on('command.run', { command: 'board' }, async ($, e) => {
    const [verb = '', ...rest] = e.args.trim().split(/\s+/)
    if (verb === 'role') {
      const name = rest.join(' ')
      if (name === '') return { text: `This session's role: ${(await currentRole($)) ?? 'none'}. /board role <name> sets it; /board role clear removes it.` }
      if (name === 'clear') {
        await update($, roleAtom, () => null)
        await settle(boardUpdate($, o.lim, own => own))
        return { text: `Role cleared${(await currentRole($)) ? ` (BWS_AGENT_ROLE still gives ${await currentRole($)})` : ''}.` }
      }
      const r = normRole(name)
      if ('error' in r) return { text: r.error }
      await update($, roleAtom, () => r.role)
      await settle(boardUpdate($, o.lim, own => own))
      return { text: `This session is now "${r.role}" on the board. Asks to ${r.role} reach it.` }
    }
    if (verb === 'pane') {
      await settle(boardUpdate($, o.lim, own => own))
      const opened = await $.ui.open({ id: PANE, title: 'Board' })
      return opened.isPlaced ? {} : { text: 'The board pane is open but not shown here (too narrow, or no pane on this surface). /board prints it as text.' }
    }
    try {
      const r = await boardUpdate($, o.lim, own => own)
      if (r === undefined) return { text: 'The board is off here: no Claude config folder found.' }
      const self = { id: r.own.sessionId, role: r.own.card.role }
      const live = Object.values(r.board.cards).filter(c => isLive(c, r.now, o.lim.staleMs)).length
      return { text: `Board for ${r.board.folder} · ${live} live session(s)\n${statusText(r.board, self, r.now, o.lim, { task: r.own.card.task, claims: r.own.card.claims }, [])}` }
    } catch (err) {
      return { text: `The board could not be read: ${errText(err)}` }
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const lines = await read($, linesAtom)
    const s = await read($, summaryAtom)
    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Text bold>
          Board · {s?.agents ?? 0} agent{s?.agents === 1 ? '' : 's'} · {s?.openAsks ?? 0} open ask{s?.openAsks === 1 ? '' : 's'}
          {s && s.askedOfMe > 0 ? ` · ${s.askedOfMe} for you` : ''}
        </Text>
        {lines.map((l, i) => (
          <Text key={`l-${i}`} wrap="wrap" dimColor={l.startsWith('  claims')}>
            {l}
          </Text>
        ))}
        <Box flexDirection="row" gap={1}>
          <Button key="close" label="Close" hotkey="c" onPress={() => $.ui.close({ id: PANE })} />
        </Box>
      </Box>
    )
  })
}
