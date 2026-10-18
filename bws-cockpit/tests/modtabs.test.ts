import { describe, expect, test } from 'claude-code/testing'

import { makeSummary } from '../hooks/kit/summary'
import { makeTab, text } from '../hooks/kit/tab'
import { DEFAULT_MODS, isRaised, modKey, modOfKey, modTabs, parseMods, tabLabel } from '../hooks/modtabs'

describe('mod tabs', () => {
  test('the option names the mods, in order; unknown names and repeats drop', () => {
    expect(parseMods(DEFAULT_MODS)).toEqual([
      'bws-memory',
      'bws-diagram',
      'bws-enhance',
      'bws-better',
      'bws-sidechat',
      'bws-secrets',
      'bws-skillgate',
      'bws-notify',
      'bws-shell-lint',
      'bws-interview',
    ])
    expect(parseMods(' BWS-Secrets ; bws-memory, nope, bws-memory ')).toEqual(['bws-secrets', 'bws-memory'])
    expect(parseMods('')).toEqual([])
  })

  test('a published tab wins over the summary; a summary alone makes a small tab', () => {
    const own = makeTab('Diagram', [text('box')], { badge: '2', tone: 'ok' })
    const views = modTabs(['bws-secrets', 'bws-diagram'], { 'bws-diagram': own }, { 'bws-secrets': makeSummary('ok', '3 secrets', 'in the vault'), 'bws-diagram': makeSummary('warn', 'ignored') })
    expect(views.map(v => v.key)).toEqual(['mod:bws-secrets', 'mod:bws-diagram'])
    expect(views[0]?.tab).toEqual({
      title: 'Secrets',
      badge: '●',
      tone: 'ok',
      body: [{ kind: 'text', text: '3 secrets', isBold: true }, { kind: 'text', text: 'in the vault', isDim: true }],
      raise: 0,
    })
    expect(views[1]?.tab).toEqual(own)
  })

  test('not loaded (no atoms) or malformed: no tab; an idle summary still shows the mod is loaded', () => {
    expect(modTabs(['bws-memory', 'bws-notify'], {}, {})).toEqual([])
    expect(modTabs(['bws-memory'], { 'bws-memory': { title: '' } }, { 'bws-memory': 'junk' })).toEqual([])
    const idle = modTabs(['bws-skillgate'], {}, { 'bws-skillgate': makeSummary('idle', 'gate off') })
    expect(idle.map(v => tabLabel(v.tab))).toEqual(['Skillgate'])
  })

  test('tab keys, labels and raise', () => {
    expect(modKey('bws-shell-lint')).toBe('mod:bws-shell-lint')
    expect(modOfKey('mod:bws-shell-lint')).toBe('bws-shell-lint')
    expect(modOfKey('mod:nope')).toBeNull()
    expect(modOfKey('board')).toBeNull()
    expect(tabLabel(makeTab('Notify', [], { badge: '4' }))).toBe('Notify 4')
    expect(isRaised(undefined, 3)).toBe(false)
    expect(isRaised(3, 3)).toBe(false)
    expect(isRaised(3, 4)).toBe(true)
  })
})
