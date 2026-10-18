import { describe, expect, test } from 'claude-code/testing'

import { buttons, card, makeTab, parseEvent, parseTab, tabText, text } from '../tab'

describe('tab', () => {
  test('a well-formed tab survives the parse unchanged', () => {
    const t = makeTab('Diagram', [text('A dashed box', { color: 'accent', isBold: true }), buttons({ id: 'redraw', label: 'Redraw', isPrimary: true }), card('Last', [text('two', { isDim: true })], 'ok')], {
      badge: '2',
      tone: 'warn',
      raise: 3,
    })
    expect(parseTab(JSON.parse(JSON.stringify(t)))).toEqual(t)
  })

  test('malformed tabs are null; malformed nodes are skipped, not fatal', () => {
    expect(parseTab(null)).toBeNull()
    expect(parseTab({ title: '' })).toBeNull()
    expect(parseTab([1])).toBeNull()
    const t = parseTab({
      title: 'X',
      tone: 'loud',
      body: [{ kind: 'nope' }, { kind: 'text', text: 'ok', color: 'pink' }, { kind: 'buttons', items: [{ id: 'bad id!', label: 'x' }] }, { kind: 'raster', columns: 0, rows: 1, cells: 'a' }],
    })
    expect(t).toEqual({ title: 'X', badge: '', tone: 'idle', body: [{ kind: 'text', text: 'ok' }], raise: 0 })
  })

  test('cards nest one level only; titles and badges are one short line', () => {
    const t = parseTab({ title: 'A\n  very   long title that keeps going on', badge: 'x'.repeat(40), body: [{ kind: 'card', title: 'outer', body: [{ kind: 'card', title: 'inner', body: [] }] }] })
    expect(t?.title).toBe('A very long title that k')
    expect(t?.badge.length).toBe(16)
    expect(t?.body).toEqual([{ kind: 'card', title: 'outer', body: [] }])
  })

  test('events: a press and a submit; junk is null', () => {
    expect(parseEvent({ seq: 1, plugin: 'bws-diagram', id: 'redraw' })).toEqual({ seq: 1, plugin: 'bws-diagram', id: 'redraw' })
    expect(parseEvent({ seq: 2, plugin: 'bws-sidechat', id: 'ask', value: 'hi' })).toEqual({ seq: 2, plugin: 'bws-sidechat', id: 'ask', value: 'hi' })
    expect(parseEvent({ seq: 'x', plugin: 'p', id: 'a' })).toBeNull()
    expect(parseEvent({ seq: 1, plugin: 'p', id: '' })).toBeNull()
  })

  test('text form for headless and mobile', () => {
    const t = makeTab('Notify', [text('on'), card('Last toasts', [text('turn done')]), buttons({ id: 'a', label: 'On' }, { id: 'b', label: 'Off' })], { badge: '3' })
    expect(tabText(t)).toBe('Notify (3)\non\nLast toasts\n  turn done\n[On] [Off]')
  })
})
