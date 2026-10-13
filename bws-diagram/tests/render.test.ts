import { test, expect, describe } from 'claude-code/testing'
import type { Diagram } from '../types'
import { legendOf, textRows } from '../hooks/render'

type Kind = 'file' | 'new' | 'step' | 'decision'
const n = (id: string, kind: Kind = 'file', label = id) => ({ id, label, kind })
const d = (nodes: ReturnType<typeof n>[], edges: Diagram['edges'], now?: string): Diagram => ({ title: 't', nodes, edges, ...(now ? { now } : {}) })

describe('FR-DG-02: drawn top to bottom as text rows', () => {
  test('a chain: boxes one over the other, a stem and a head between', async () => {
    expect(textRows(d([n('A', 'file', 'one.ts'), n('B', 'file', 'two.ts')], [{ from: 'A', to: 'B' }]), 60).rows).toEqual([
      ' ┌────────┐',
      ' │ one.ts │',
      ' └────────┘',
      '      │',
      '      ▼',
      ' ┌────────┐',
      ' │ two.ts │',
      ' └────────┘',
    ])
  })

  test('a fan-out: three heads under one bus, each labelled where it fits', async () => {
    const g = d([n('A', 'step', 'start'), n('B', 'file', 'b.ts'), n('C', 'new', 'C'), n('D', 'decision', 'D?')], [
      { from: 'A', to: 'B', label: 'one' },
      { from: 'A', to: 'C', label: 'two' },
      { from: 'A', to: 'D' },
    ])
    expect(textRows(g, 60).rows).toEqual([
      '            ╔═══════╗',
      '            ║ start ║',
      '            ╚═══════╝',
      '              │ │ │',
      '     ┌────────┘ │ └────────┐',
      '     ▼ one      ▼ two      ▼',
      ' ┌───────┐  ╭───────╮  ╱───────╲',
      ' │ b.ts  │  │   C   │  │  D?   │',
      ' └───────┘  ╰───────╯  ╲───────╱',
    ])
  })

  test('a fan-in: two lines meet one node, a head and a label each', async () => {
    const g = d([n('A', 'file', 'a.ts'), n('B', 'file', 'b.ts'), n('C', 'step', 'merge')], [
      { from: 'A', to: 'C', label: 'x' },
      { from: 'B', to: 'C', label: 'y' },
    ])
    expect(textRows(g, 60).rows).toEqual([
      ' ┌───────┐  ┌───────┐',
      ' │ a.ts  │  │ b.ts  │',
      ' └───────┘  └───────┘',
      '     │          │',
      '   ┌─┘ ┌────────┘',
      '   ▼ x ▼ y',
      ' ╔═══════╗',
      ' ║ merge ║',
      ' ╚═══════╝',
    ])
  })

  test('an edge that skips a layer runs down beside the middle one, its label at the head', async () => {
    const g = d([n('A'), n('B'), n('C')], [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }, { from: 'A', to: 'C', label: 'direct' }])
    const rows = textRows(g, 60).rows
    expect(rows.some(r => r.includes('▼ direct'))).toBe(true)
    expect(rows.filter(r => r.includes('▼')).length).toBe(2)
    expect(rows.some(r => /^\s+│\s+│$/.test(r))).toBe(true) // the long edge beside the middle box's rows
    expect(rows.join('\n')).toContain('┌┘')
  })

  test('a cycle: the back edge shares the forward line and puts its head at the upper end', async () => {
    const g = d([n('A', 'step', 'draft'), n('B', 'step', 'review')], [{ from: 'A', to: 'B' }, { from: 'B', to: 'A', label: 'redo' }])
    expect(textRows(g, 60).rows).toEqual([
      ' ╔════════╗',
      ' ║ draft  ║',
      ' ╚════════╝',
      '      ▲ redo',
      '      ▼',
      ' ╔════════╗',
      ' ║ review ║',
      ' ╚════════╝',
    ])
  })

  test('each kind has its own corners: file, component, step, decision', async () => {
    const rows = textRows(d([n('A', 'file'), n('B', 'new'), n('C', 'step'), n('D', 'decision')], []), 80).rows
    for (const ch of ['┌', '╭', '╔', '╱']) expect(rows[0]).toContain(ch)
    for (const ch of ['└', '╰', '╚', '╲']) expect(rows[2]).toContain(ch)
  })

  test('the now node carries a head in its label; the legend names it only then', async () => {
    const g = d([n('A', 'step', 'first'), n('B', 'step', 'last')], [{ from: 'A', to: 'B' }], 'B')
    expect(textRows(g, 60).rows.join('\n')).toContain('▶ last')
    const plain: Diagram = { title: g.title, nodes: g.nodes, edges: g.edges }
    expect(textRows(plain, 60).rows.join('\n')).not.toContain('▶')
    expect(legendOf(g)).toBe('┌ file   ╭ component   ╔ step   ╱ decision   ▶ now')
    expect(legendOf(plain)).toBe('┌ file   ╭ component   ╔ step   ╱ decision')
  })

  test('narrow: nodes shrink and labels are cut with an ellipsis; too narrow draws on and says how wide it wants', async () => {
    const g = d([n('A', 'file', 'a-very-long-label-indeed'), n('B', 'file', 'another-long-label-here'), n('C', 'file', 'third-long-label-here')], [{ from: 'A', to: 'B' }, { from: 'A', to: 'C' }])
    const fit = textRows(g, 20)
    expect(fit.isCut).toBe(false)
    expect(fit.rows.join('\n')).toContain('a-v…')
    expect(Math.max(...fit.rows.map(r => Array.from(r).length))).toBeLessThanOrEqual(20)
    const cut = textRows(g, 10)
    expect(cut.isCut).toBe(true)
    expect(cut.needed).toBe(20)
    expect(cut.rows.length).toBeGreaterThan(5)
  })

  test('one node alone is just its box; 24 nodes in one chain draw without throwing', async () => {
    expect(textRows(d([n('A', 'file', 'solo')], []), 40).rows).toEqual([' ┌──────┐', ' │ solo │', ' └──────┘'])
    const ids = Array.from({ length: 24 }, (_, i) => `n${i}`)
    const big = d(ids.map(id => n(id)), ids.slice(1).map((id, i) => ({ from: ids[i]!, to: id })))
    expect(textRows(big, 40).rows.filter(r => r.includes('▼')).length).toBe(23)
  })
})
