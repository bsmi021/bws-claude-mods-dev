import { test, expect, describe } from 'claude-code/testing'
import { parseSecretsArgs } from '../hooks/request'
import { FILE, PANE, settle, world } from './world'

const VALUE_A = 'aaaa-secret-1111'
const VALUE_B = 'bbbb-secret-2222'
const SAVED = { [FILE]: `A_KEY=${VALUE_A}\nB_KEY=${VALUE_B}\n` }
const run = async ($: { command: { run: (i: never) => Promise<unknown> } }, args = '') =>
  ((await $.command.run({ command: 'secrets', args } as never)) as { text: string }).text

describe('FR-SB-05: /secrets lists names only and removes one', () => {
  test('arguments', () => {
    expect(parseSecretsArgs('')).toEqual({ kind: 'list' })
    expect(parseSecretsArgs(' list ')).toEqual({ kind: 'list' })
    expect(parseSecretsArgs('remove A_KEY')).toEqual({ kind: 'remove', name: 'A_KEY' })
    expect(parseSecretsArgs('rm A_KEY')).toEqual({ kind: 'remove', name: 'A_KEY' })
    expect(parseSecretsArgs('show A_KEY')).toEqual({ kind: 'usage' })
  })

  test('the list: names and their placeholders, never a value', async ($, on) => {
    world(on, { files: SAVED })
    const text = await run($)
    expect(text).toContain('2 secrets saved for this project (values not shown;')
    expect(text).toContain('A_KEY  ->  {{secret:A_KEY}}')
    expect(text).toContain('B_KEY  ->  {{secret:B_KEY}}')
    expect(text).not.toContain(VALUE_A)
    expect(text).not.toContain(VALUE_B)
  })

  test('nothing saved', async ($, on) => {
    world(on)
    expect(await run($)).toContain('No secrets saved for this project')
  })

  test('remove: the name and its value leave the file; the others stay', async ($, on) => {
    const { files } = world(on, { files: SAVED })
    const text = await run($, 'remove A_KEY')
    expect(text).toBe('Removed A_KEY. Commands that use {{secret:A_KEY}} are now refused.')
    expect(files.get(FILE)).toBe(`B_KEY=${VALUE_B}\n`)
    expect(await run($, 'remove A_KEY')).toBe('No saved secret named A_KEY.')
    expect(((await $.tool.call({ tool: 'Bash', command: 'echo {{secret:A_KEY}}' } as never)) as { deny: string }).deny).toContain('no saved secret')
  })

  test('usage for anything else; does not answer other commands', async ($, on) => {
    world(on, { files: SAVED })
    expect(await run($, 'show A_KEY')).toBe('Usage: /secrets (list the saved names) | /secrets remove NAME')
  })

  test('the entry pane never shows a saved value, even when one is kept', async ($, on) => {
    const { seen } = world(on, { files: SAVED })
    const call = $.tool.call({ tool: 'mcp__bws-secrets__request_secret', name: 'A_KEY' } as never) as Promise<unknown>
    await settle(() => seen.sleeps > 0)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    const drawn = JSON.stringify(await ui.drawn())
    expect(drawn).toContain('Keep the saved value')
    expect(drawn).not.toContain(VALUE_A)
    expect(JSON.stringify(await ui.drawn({ in: 'secret-entry' }))).not.toContain(VALUE_A)
    await ui.press({ key: 'cancel' })
    await call
    await ui.unmount()
  })
})
