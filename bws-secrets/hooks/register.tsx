// bws-secrets: a secret box. Claude asks for a value with request_secret, the person types it into a masked pane, and
// it is saved outside the project. A Bash command uses it as {{secret:NAME}}: the command is rewritten so the shell
// reads the value from the file at execution time, and the result is scrubbed before the engine stores it, so the value
// never reaches the transcript (runs/2026-10-13-mods-m8-secrets/DECISIONS.md).
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { EntryView } from '../types'
import {
  cancelText,
  FAILED_TEXT,
  noScreenText,
  notPlacedText,
  parsePost,
  parseRequest,
  savedText,
  sleeperArgv,
  waitFor,
  waitText,
  type Answer,
} from './request'
import { denyText, touchesSecrets, type GuardInput } from './guard'
import { formatEnv, parseEnv, secretsDir, secretsFile, setSecret, valueError, type Secret } from './secrets'

const SECRETS_PANE = 'bws-secrets'
const ENTRY_KEY = 'secret-entry'
const SLEEPER_TIMEOUT_MS = 5_000
const GUARD_FAILED = 'bws-secrets: the secrets guard failed, so the call was refused. Try again.'

const entry = atom({ plugin: 'bws-secrets', key: 'entry' } as const, null as EntryView | null)

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

async function endRequest($: EngineInterface) {
  pending = null
  await update($, entry, () => null)
  await $.ui.close({ id: SECRETS_PANE })
}

function answer(a: Answer) {
  if (pending && pending.answer === null) pending.answer = a
}

export const register: Register = (on, options) => {
  dirOption = typeof options.secretsDir === 'string' ? options.secretsDir : ''
  pending = null

  on('session.start', async ($, e, next) => {
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
      const opened = await $.ui.open({ id: SECRETS_PANE, title: `Secret ${args.name}`, focus: true })
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
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const no = await guardText($, e)
    return no ? { deny: no } : next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: GUARD_FAILED }))

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
