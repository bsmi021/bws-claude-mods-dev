import { describe, expect, test } from 'claude-code/testing'

import { makeSummary } from '../hooks/kit/summary'
import { makeTab, text } from '../hooks/kit/tab'
import { DEFAULT_MODS, focusKeyOf, isRaised, modKey, modOfKey, modTabs, parseMods, tabLabel } from '../hooks/modtabs'

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
      'bws-direction',
      'bws-summary',
      'bws-agents',
      'bws-inventory',
      'bws-mask',
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

  test('the focused input key: the first input marked isFocused, inside cards too; none: null', () => {
    const ask = makeTab('Side chat', [text('x'), { kind: 'input', id: 'ask-3', placeholder: 'p', isFocused: true }])
    expect(focusKeyOf('bws-sidechat', ask)).toBe('bws-sidechat-ask-3')
    const inCard = makeTab('Better', [{ kind: 'card', title: 'Q', body: [{ kind: 'input', id: 'other-input-1', placeholder: 'p', isFocused: true }] }])
    expect(focusKeyOf('bws-better', inCard)).toBe('bws-better-other-input-1')
    expect(focusKeyOf('bws-notify', makeTab('Notify', [{ kind: 'input', id: 'note', placeholder: 'p' }]))).toBeNull()
    expect(focusKeyOf('bws-notify', null)).toBeNull()
    const send = makeTab('Enhance', [{ kind: 'buttons', items: [{ id: 'send', label: 'Send', isFocused: true }, { id: 'revert', label: 'Revert' }] }])
    expect(focusKeyOf('bws-enhance', send)).toBe('bws-enhance-send')
  })
})
