import { test, expect, describe } from 'claude-code/testing'
import { drawKind, fitLayers, fitNodeWidth, layoutRows, layoutWidth, MIN_NODE_W, wantedNodeWidth } from '../hooks/draw'

describe('FR-DG-01: what each surface draws, and the legible budget', () => {
  test('the terminal draws a Raster, the remote surfaces an Svg, anything else text', async () => {
    expect(drawKind('terminal', { raster: true, svg: false })).toBe('raster')
    expect(drawKind('desktop', { raster: false, svg: true })).toBe('svg')
    expect(drawKind('vscode', { raster: false, svg: true })).toBe('svg')
    expect(drawKind('mobile', { raster: false, svg: true })).toBe('svg')
    expect(drawKind('terminal', { raster: false, svg: false })).toBe('text')
    expect(drawKind('desktop', { raster: false, svg: false })).toBe('text')
  })

  test('the budget table in DECISIONS.md: layers that fit at node width 10 and 16', async () => {
    const table: [number, number, number][] = [
      [40, 2, 2],
      [60, 4, 3],
      [80, 5, 4],
      [120, 8, 5],
    ]
    for (const [cols, at10, at16] of table) {
      expect(fitLayers(cols, 10)).toBe(at10)
      expect(fitLayers(cols, 16)).toBe(at16)
    }
  })

  test('node width: longest label plus padding, more with a step, clamped to 10..20', async () => {
    expect(wantedNodeWidth(['A', 'B'], false)).toBe(MIN_NODE_W)
    expect(wantedNodeWidth(['writer.ts', 'Parse request'], false)).toBe(15)
    expect(wantedNodeWidth(['writer.ts', 'Parse request'], true)).toBe(19)
    expect(wantedNodeWidth(['a very long label that will not fit'], false)).toBe(20)
    expect(wantedNodeWidth([], false)).toBe(MIN_NODE_W)
  })

  test('the node width shrinks toward 10 to fit, and is null when even 10 does not', async () => {
    expect(layoutWidth(3, 16, [5, 5])).toBe(59)
    expect(layoutWidth(3, 16, [7, 5])).toBe(61)
    expect(fitNodeWidth(60, 3, [5, 5], 16)).toBe(16)
    expect(fitNodeWidth(60, 3, [7, 5], 16)).toBe(15)
    expect(fitNodeWidth(40, 3, [5, 5], 16)).toBe(null) // 3 x 10 + 10 + 1 = 41
    expect(fitNodeWidth(41, 3, [5, 5], 16)).toBe(10)
  })

  test('rows: three per node, one between, one above and below', async () => {
    expect(layoutRows(1)).toBe(5)
    expect(layoutRows(3)).toBe(2 + 3 * 4 - 1)
    expect(layoutRows(0)).toBe(5)
  })
})
