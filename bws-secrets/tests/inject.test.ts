import { test, expect, describe } from 'claude-code/testing'
import { injectionError } from '../hooks/secrets'
import { FILE, world } from './world'

const VALUE = 'sk-live-9f8e7d6c5b4a'
const B64 = 'c2stbGl2ZS05ZjhlN2Q2YzViNGE='
const SAVED = { [FILE]: `API_KEY=${VALUE}\nOTHER=zzzz-1234\n` }
type R = { result?: { stdout?: string; stderr?: string; persistedOutputPath?: string }; deny?: string; ref?: number; text?: string }
const bash = ($: { tool: { call: (i: never) => Promise<unknown> } }, command: string, more: object = {}) =>
  $.tool.call({ tool: 'Bash', command, ...more } as never) as Promise<R>

describe('FR-SB-04: {{secret:NAME}} runs with the value in its environment', () => {
  test('the command the tool runs reads the value from the file; its text never holds the value', async ($, on) => {
    const { seen } = world(on, { files: SAVED })
    await bash($, 'curl -H "Authorization: Bearer {{secret:API_KEY}}" https://api.example.com')
    const ran = seen.reached[0]?.command ?? ''
    expect(ran).toBe(
      `export API_KEY="$(sed -n 's/^API_KEY=//p' '${FILE}' | head -n 1 | tr -d '\\r')"; ` +
        'curl -H "Authorization: Bearer ${API_KEY}" https://api.example.com',
    )
    expect(ran).not.toContain(VALUE)
  })

  test('echo test: the value printed comes back as the placeholder, and so does its base64', async ($, on) => {
    world(on, {
      files: SAVED,
      bottom: () => ({ result: { stdout: `B=[${VALUE}]\n${B64}\n`, stderr: `warn ${VALUE}`, interrupted: false }, ref: 7, text: `B=[${VALUE}]` }),
    })
    const r = await bash($, 'echo "B=[{{secret:API_KEY}}]"; printf %s "{{secret:API_KEY}}" | base64')
    expect(r.result?.stdout).toBe('B=[{{secret:API_KEY}}]\n{{secret:API_KEY}}\n')
    expect(r.result?.stderr).toBe('warn {{secret:API_KEY}}')
    expect(r.ref).toBeUndefined()
    expect(JSON.stringify(r)).not.toContain(VALUE)
    expect(JSON.stringify(r)).not.toContain(B64)
  })

  test('any Bash output that holds a saved value is scrubbed, placeholder or not', async ($, on) => {
    world(on, { files: SAVED, bottom: () => ({ result: { stdout: `OTHER=zzzz-1234 API_KEY=${VALUE}`, stderr: '', interrupted: false }, ref: 3 }) })
    const r = await bash($, 'env | grep -E "KEY|OTHER"')
    expect(r.result?.stdout).toBe('OTHER={{secret:OTHER}} API_KEY={{secret:API_KEY}}')
  })

  test('an error result that holds the value is withheld with its text scrubbed', async ($, on) => {
    world(on, { files: SAVED, bottom: () => ({ isError: true, result: `bad token ${VALUE}`, text: `Exit code 1\nbad token ${VALUE}` }) })
    const r = await bash($, 'curl -u x:{{secret:API_KEY}} https://api.example.com')
    expect(r.deny).toBe('Exit code 1\nbad token {{secret:API_KEY}}')
  })

  test('a large output the engine kept in a file is scrubbed in that file too', async ($, on) => {
    const kept = 'C:/Users/me/.claude/tool-results/abc.txt'
    const { files } = world(on, {
      files: { ...SAVED, [kept]: `line\n${VALUE}\n` },
      bottom: () => ({ result: { stdout: `preview ${VALUE}`, stderr: '', interrupted: false, persistedOutputPath: kept }, ref: 1 }),
    })
    const r = await bash($, 'cat big.log')
    expect(files.get(kept)).toBe('line\n{{secret:API_KEY}}\n')
    expect(r.result?.stdout).toBe('preview {{secret:API_KEY}}')
  })
})

describe('FR-SB-04: refusals, and results left alone', () => {
  test('an unsaved name, a bad name, or a background run is refused before anything runs', async ($, on) => {
    const { seen } = world(on, { files: SAVED })
    expect((await bash($, 'echo {{secret:NOPE}}')).deny).toContain('no saved secret for {{secret:NOPE}}. Call request_secret')
    expect((await bash($, 'echo {{secret:api_key}}')).deny).toContain('is not a usable name')
    expect((await bash($, 'echo {{secret:API_KEY}}', { run_in_background: true })).deny).toContain('cannot run in the background')
    expect(seen.reached).toEqual([])
    expect(injectionError(['API_KEY'], [{ name: 'API_KEY', value: VALUE }], false)).toBe(null)
  })

  test('a placeholder with nothing saved at all is refused', async ($, on) => {
    world(on)
    expect((await bash($, 'echo {{secret:API_KEY}}')).deny).toContain('no saved secret')
  })

  test('output without a saved value is returned as the engine made it (ref kept)', async ($, on) => {
    world(on, { files: SAVED, bottom: () => ({ result: { stdout: 'ok', stderr: '', interrupted: false }, ref: 5, text: 'ok' }) })
    const r = await bash($, 'echo {{secret:API_KEY}} > /dev/null; echo ok')
    expect(r.ref).toBe(5)
    expect(r.result?.stdout).toBe('ok')
  })

  test('with no secrets saved, a plain command passes through untouched', async ($, on) => {
    const { seen } = world(on, { bottom: () => ({ result: { stdout: 'x', stderr: '', interrupted: false }, ref: 9 }) })
    const r = await bash($, 'git status')
    expect(seen.reached[0]?.command).toBe('git status')
    expect(r.ref).toBe(9)
  })
})
