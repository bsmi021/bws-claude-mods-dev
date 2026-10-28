import { test, expect, describe } from 'claude-code/testing'
import { add, deckOrder, judge, noteEdit, parseDeckPost, shortPath } from '../hooks/assumptions'
import { bar, current, flyOffset, keyStep, nextOpen, place, START, tickStep, FLY_FRAMES, GLOW_MS } from '../hooks/deck'
import type { Card } from '../hooks/deck'
import type { Assumption } from '../types'

const card = (n: number, o: Partial<Card> = {}): Card => ({ n, text: `t${n}`, why: '', verdict: 'open', correction: '', edits: 0, files: [], bumped: 0, ...o })

describe('blast radius', () => {
  test('an edit lands on every unsent assumption, files deduped newest last', () => {
    let list: Assumption[] = add(add([], 'a', '').list, 'b', '').list
    list = list.map(a => (a.n === 2 ? { ...a, isSent: true } : a))
    list = noteEdit(list, 'C:\\x\\src\\a.ts', 5)
    list = noteEdit(list, 'C:/x/src/b.ts', 6)
    list = noteEdit(list, 'C:/x/src/a.ts', 7)
    expect(list[0]).toMatchObject({ edits: 3, files: ['src/b.ts', 'src/a.ts'], bumped: 7 })
    expect(list[1]?.edits).toBeUndefined()
    expect(shortPath('/a/b/c/d.ts')).toBe('c/d.ts')
  })

  test('the deck leads with what is still to judge, heaviest first', () => {
    let list: Assumption[] = []
    for (const t of ['a', 'b', 'c']) list = add(list, t, '').list
    list = list.map(a => ({ ...a, edits: a.n === 3 ? 5 : 1 }))
    list = judge(list, 3, 'right')
    expect(deckOrder(list).map(a => a.n)).toEqual([1, 2, 3])
    list = judge(list, 3, 'open')
    expect(deckOrder(list).map(a => a.n)).toEqual([3, 1, 2])
  })

  test('posts are checked', () => {
    expect(parseDeckPost({ op: 'judge', n: 2, verdict: 'wrong' })).toEqual({ op: 'judge', n: 2, verdict: 'wrong' })
    expect(parseDeckPost({ op: 'judge', n: 2, verdict: 'maybe' })).toBeNull()
    expect(parseDeckPost({ op: 'fix', n: 1.5, text: 'x' })).toBeNull()
    expect(parseDeckPost('send')).toBeNull()
    expect(parseDeckPost({ op: 'send' })).toEqual({ op: 'send' })
  })
})

describe('deck steps', () => {
  const cards = [card(1), card(2, { verdict: 'right' }), card(3)]

  test('current and nextOpen go round the cards still to judge', () => {
    expect(current(cards, null)?.n).toBe(1)
    expect(current(cards, 2)?.n).toBe(2)
    expect(nextOpen(cards, 1)).toBe(3)
    expect(nextOpen(cards, 3)).toBe(1)
    expect(nextOpen([card(1)], 1)).toBeNull()
  })

  test('→ judges right and flies right; ← opens the editor, Enter posts the fix and flies left', () => {
    const r = keyStep(START, { key: 'right' }, cards)
    expect(r.post).toEqual({ op: 'judge', n: 1, verdict: 'right' })
    expect(r.s.fly?.dir).toBe(1)
    expect(r.s.cur).toBe(3)
    let w = keyStep(START, { key: 'left' }, cards)
    expect(w.post).toEqual({ op: 'judge', n: 1, verdict: 'wrong' })
    expect(w.s.edit).toBe('')
    // In the editor, letters are text, not keys.
    w = keyStep(w.s, { key: 's' }, cards)
    w = keyStep(w.s, { key: 'space' }, cards)
    w = keyStep(w.s, { key: 'x' }, cards)
    w = keyStep(w.s, { key: 'backspace' }, cards)
    expect(w.s.edit).toBe('s ')
    expect(w.post).toBeUndefined()
    const done = keyStep(w.s, { key: 'return' }, cards)
    expect(done.post).toEqual({ op: 'fix', n: 1, text: 's' })
    expect(done.s.fly?.dir).toBe(-1)
    expect(done.s.edit).toBeNull()
  })

  test('the clock flies the card out, then rests unless a card glows', () => {
    let s = keyStep(START, { key: 'right' }, cards).s
    for (let i = 0; i < FLY_FRAMES; i++) s = tickStep(s, cards, 0) ?? s
    expect(s.fly).toBeNull()
    expect(tickStep(s, cards, 10_000)).toBeNull()
    expect(tickStep(s, [card(1, { bumped: 9_000 })], 9_000 + GLOW_MS - 1)).not.toBeNull()
  })

  test('placing and drawing', () => {
    expect(place(80, 0)).toEqual({ left: 8, width: 64 })
    expect(place(80, -20)).toEqual({ left: 0, width: 52 })
    expect(place(80, 20)).toEqual({ left: 28, width: 52 })
    expect(flyOffset(3, -1)).toBe(-10)
    expect(bar(0, 4)).toBe('░'.repeat(12))
    expect(bar(2, 4)).toBe('▓'.repeat(6) + '░'.repeat(6))
  })
})
