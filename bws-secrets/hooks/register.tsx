// bws-secrets: a secret box. Claude asks for a value with request_secret, the person types it into a masked pane, and
// it is saved outside the project. A Bash command uses it as {{secret:NAME}}: the command is rewritten so the shell
// reads the value from the file at execution time, and the result is scrubbed before the engine stores it, so the value
// never reaches the transcript.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { EntryView } from '../types'
import {
  cancelText,
  FAILED_TEXT,
  listText,
  noScreenText,
  notPlacedText,
  parsePost,
  parseRequest,
  parseSecretsArgs,
  removedText,
  savedText,
  SECRETS_USAGE,
  secretsSummary,
  secretsTab,
  sleeperArgv,
  waitFor,
  waitText,
  type Answer,
} from './request'
import { denyText, touchesSecrets, type GuardInput } from './guard'
import {
  formatEnv,
  holdsSecret,
  injectCommand,
  injectionError,
  parseEnv,
  placeholders,
  removeSecret,
  scrub,
  scrubValue,
  secretsDir,
  secretsFile,
  setSecret,
  valueError,
  type Secret,
} from './secrets'

const SECRETS_PANE = 'bws-secrets'
const ENTRY_KEY = 'secret-entry'
const SLEEPER_TIMEOUT_MS = 5_000
const GUARD_FAILED = 'bws-secrets: the secrets guard failed, so the call was refused. Try again.'
const WITHHELD = 'bws-secrets: the output could not be checked for secrets, so it was withheld.'

const entry = atom({ plugin: 'bws-secrets', key: 'entry' } as const, null as EntryView | null)
const summary = atom({ plugin: 'bws-secrets', key: 'summary' } as const, null)
// The dashboard tab bws-cockpit draws (bws-kit/tab.ts): names only.
const tab = atom({ plugin: 'bws-secrets', key: 'tab' } as const, null as unknown)

// The options, copied in by register on every load.
let dirOption = ''
// The one open request: its name and the person's answer once one arrives (memory only; never the atom).
let pending: { name: string; answer: Answer | null } | null = null

async function paths($: EngineInterface): Promise<{ dir: string; file: string; home: string; cwd: string }> {
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')) ?? ''
  const dir = secretsDir(dirOption, home)
  const cwd = await $.session.cwd()
  return { dir, file: secretsFile(dir, cwd), home, cwd }
}

// FR-SB-03: the refusal for a call that would read the secrets folder, or null.
async function guardText($: EngineInterface, e: GuardInput): Promise<string | null> {
  const p = await paths($)
  return touchesSecrets(e, p.dir, p.cwd, p.home) ? denyText(e.tool, p.dir) : null
}

// The saved names and values; a missing or unreadable file is an empty list.
async function loadSecrets($: EngineInterface, file: string): Promise<Secret[]> {
  try {
    const text = await $.fs.read(file)
    return typeof text === 'string' ? parseEnv(text) : []
  } catch {
    return []
  }
}

// FR-SB-06: the summary atom: how many names are saved for this project, or the request being asked.
async function publish($: EngineInterface) {
  const { file } = await paths($)
  const names = (await loadSecrets($, file)).map(s => s.name)
  await update($, summary, () => secretsSummary(names.length, pending?.name ?? null))
  await update($, tab, () => secretsTab(names, pending?.name ?? null))
}

async function endRequest($: EngineInterface) {
  pending = null
  await update($, entry, () => null)
  await $.ui.close({ id: SECRETS_PANE })
  await publish($)
}

// A result with a saved value in it, rebuilt scrubbed (no `ref`, so core stores this one); else the result as it was.
// An error result is withheld with its text scrubbed. A large output the engine kept in a file is scrubbed there too.
async function scrubResult<R extends { deny?: string; result?: unknown; text?: string; isError?: true; context?: readonly string[] }>(
  $: EngineInterface,
  r: R,
  saved: readonly Secret[],
): Promise<R | { deny: string } | { result: unknown; context?: string[] }> {
  if (r.deny !== undefined) return holdsSecret(r.deny, saved) ? { deny: scrub(r.deny, saved) } : r
  const raw = JSON.stringify([r.result ?? null, r.text ?? '', r.context ?? []])
  const kept = (r.result as { persistedOutputPath?: unknown } | undefined)?.persistedOutputPath
  if (typeof kept === 'string' && kept !== '') {
    const text = await $.fs.read(kept).catch(() => null)
    if (typeof text === 'string' && holdsSecret(text, saved)) await $.fs.write(kept, scrub(text, saved))
  }
  if (!holdsSecret(raw, saved)) return r
  if (r.isError) return { deny: scrub(r.text ?? 'the command failed', saved) }
  const context = r.context?.map(c => scrub(c, saved))
  return { result: scrubValue(r.result, saved), ...(context ? { context } : {}) }
}

function answer(a: Answer) {
  if (pending && pending.answer === null) pending.answer = a
}

export const register: Register = (on, options) => {
  dirOption = typeof options.secretsDir === 'string' ? options.secretsDir : ''
  pending = null

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'secrets', description: 'List the saved secret names (never the values), or remove one', argumentHint: '[remove NAME]' })
    await $.tool.register({
      name: 'request_secret',
      description:
        'Ask the user for a secret (API key, token, password) without it entering the conversation. A masked entry pane ' +
        'opens; the user types the value; it is saved outside the project. The result is `saved as NAME; use ' +
        '{{secret:NAME}}`. Then write {{secret:NAME}} in a Bash command where the value goes: it is filled in when the ' +
        'command runs and redacted from the output. Never ask the user to paste a secret into the chat, and never try to ' +
        'read the saved file.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Variable name: an upper-case letter, then upper-case letters, digits or _ (GITHUB_TOKEN).' },
          purpose: { type: 'string', description: 'What the secret is for, in a few words; the user sees it in the pane.' },
        },
        required: ['name'],
      },
      isDeferred: false,
    })
    await publish($)
    return next(e)
  })

  // FR-SB-02: request_secret opens the masked entry and waits for the person; the value goes to the file, never back.
  on('tool.call', { tool: 'mcp__bws-secrets__request_secret' }, async ($, e, next) => {
    const args = parseRequest(e)
    if ('error' in args) return { deny: args.error }
    if (pending) return { deny: `request_secret: the user is still being asked for ${pending.name}; wait for that answer first.` }
    const { file } = await paths($)
    const hasSaved = (await loadSecrets($, file)).some(s => s.name === args.name)
    const surfaces = await $.session.surfaces()
    if (!surfaces.includes('terminal') && !surfaces.includes('desktop')) {
      return hasSaved ? { result: savedText(args.name) } : { deny: noScreenText(args.name) }
    }
    pending = { name: args.name, answer: null }
    try {
      await update($, entry, () => ({ name: args.name, purpose: args.purpose, hasSaved, note: '' }))
      await publish($)
      const opened = await $.ui.open({ id: SECRETS_PANE, title: `Secret ${args.name}`, focus: true, closeOnEscape: true })
      if (!opened.isPlaced) return { deny: notPlacedText(opened.reason) }
      const argv = sleeperArgv((await $.env.get('OS')) === 'Windows_NT')
      for (;;) {
        const outcome = await waitFor({
          sleep: async () => {
            await $.process.run(argv, { timeoutMs: SLEEPER_TIMEOUT_MS })
          },
          now: () => $.clock.now(),
          isAnswered: () => pending?.answer != null,
          isAborted: () => next.signal.aborted,
        })
        if (outcome !== 'answered') return { deny: waitText(outcome, args.name) }
        const a = pending?.answer ?? { kind: 'cancel' as const }
        if (pending) pending.answer = null
        if (a.kind === 'cancel') return { deny: cancelText(args.name) }
        if (a.kind === 'keep') {
          if (hasSaved) return { result: savedText(args.name) }
          continue
        }
        const bad = valueError(a.value)
        if (bad) {
          await update($, entry, v => (v ? { ...v, note: `${bad} Type it again.` } : v))
          continue
        }
        const latest = await loadSecrets($, file)
        await $.fs.write(file, formatEnv(setSecret(latest, args.name, a.value)))
        return { result: savedText(args.name) }
      }
    } finally {
      await endRequest($)
    }
  }).catch(async ($, e, next) => {
    pending = null
    await $.ui.close({ id: SECRETS_PANE })
    return { deny: FAILED_TEXT }
  })

  // FR-SB-05: /secrets lists names only and removes one; no value is ever read into a reply.
  on('command.run', { command: 'secrets' }, async ($, e) => {
    const a = parseSecretsArgs(e.args)
    if (a.kind === 'usage') return { text: SECRETS_USAGE }
    const { file } = await paths($)
    const saved = await loadSecrets($, file)
    if (a.kind === 'list') return { text: listText(saved.map(s => s.name), file) }
    const isFound = saved.some(s => s.name === a.name)
    if (isFound) await $.fs.write(file, formatEnv(removeSecret(saved, a.name)))
    if (isFound) await publish($)
    return { text: removedText(a.name, isFound) }
  })

  // FR-SB-03: Read, Grep, Glob and Bash calls that would read the secrets folder are refused. A guard that fails
  // refuses (fail closed) unless the call already went on.
  on('tool.call', { tool: 'Read' }, async ($, e, next) => {
    const no = await guardText($, e)
    return no ? { deny: no } : next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: GUARD_FAILED }))
  on('tool.call', { tool: 'Grep' }, async ($, e, next) => {
    const no = await guardText($, e)
    return no ? { deny: no } : next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: GUARD_FAILED }))
  on('tool.call', { tool: 'Glob' }, async ($, e, next) => {
    const no = await guardText($, e)
    return no ? { deny: no } : next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: GUARD_FAILED }))
  // FR-SB-04: a command with {{secret:NAME}} runs with NAME read from the file by the shell; every Bash result is
  // scrubbed of saved values and their encodings before the engine stores it (DECISIONS.md D1, D5). Fails closed.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const no = await guardText($, e)
    if (no) return { deny: no }
    const p = await paths($)
    const saved = await loadSecrets($, p.file)
    const names = placeholders(e.command)
    let r
    if (names.length > 0) {
      const bad = injectionError(names, saved, e.run_in_background === true)
      if (bad) return { deny: bad }
      r = await next({ ...e, command: injectCommand(e.command, names, p.file) })
    } else {
      r = await next(e)
    }
    return saved.length === 0 ? r : await scrubResult($, r, saved)
  }).catch(($, e, next) => ({ deny: next.called ? WITHHELD : GUARD_FAILED }))

  // The entry posts the typed value here, and only here: handled completely, so it goes no further.
  on('ui.message', { requestId: SECRETS_PANE }, async ($, e, next) => {
    if (e.element !== ENTRY_KEY) return next(e)
    const value = parsePost(e.data)
    if (value !== null) answer({ kind: 'submit', value })
    return {}
  })

  // The person closing the pane cancels the request.
  on('ui.close', async ($, e, next) => {
    if (e.id === SECRETS_PANE && e.origin.kind === 'person') answer({ kind: 'cancel' })
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: SECRETS_PANE }, async ($, e) => {
    const v = await read($, entry)
    const { Box, Button, Text } = $.ui.resolve(e)
    if (!v) return <Text dimColor>No secret is being asked for.</Text>
    const table = $.ui.resolve(e)
    const entryBox =
      (e.surface === 'terminal' || e.surface === 'desktop') && 'Client' in table ? (
        <table.Client key={ENTRY_KEY} module="./entry.ts" />
      ) : (
        <Text color="yellow">This app cannot draw the masked entry; Cancel and use a terminal.</Text>
      )
    return (
      <Box flexDirection="column">
        <Text bold>Claude asks for the secret {v.name}</Text>
        {v.purpose ? <Text wrap="wrap">For: {v.purpose}</Text> : null}
        <Text dimColor wrap="wrap">
          Click the box, type the value (each character shows as a dot) and press Enter. It is saved outside the project;
          Claude only ever sees {`{{secret:${v.name}}}`}.
        </Text>
        {entryBox}
        {v.note ? <Text color="yellow">{v.note}</Text> : null}
        <Box flexDirection="row" gap={2}>
          {v.hasSaved ? <Button key="keep" label="Keep the saved value" hotkey="k" onPress={() => answer({ kind: 'keep' })} /> : null}
          <Button key="cancel" label="Cancel" hotkey="x" onPress={() => answer({ kind: 'cancel' })} />
        </Box>
      </Box>
    )
  })
}
