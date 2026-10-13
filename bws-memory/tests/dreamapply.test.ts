import { test, expect, describe } from 'claude-code/testing'
import { backupName, basesOf, combinedSummary, dreamChanges, dreamIndex, dreamSources, dreamStatusText, hashText, IDLE_DREAM, latestBackup, parseEveryTurns, staleFiles } from '../hooks/dreamapply'
import { dreamFiles } from '../hooks/dream'
import type { DreamAction } from '../hooks/dream'
import { IDLE_VIEW, memoryFile } from '../hooks/memory'
import { OLD, PNPM, TABS_A, TABS_B } from './dreamworld'

const FILES = dreamFiles([TABS_A, TABS_B, PNPM, OLD].map(e => ({ file: e.file, text: memoryFile(e) }))).files
const MERGE: DreamAction = { action: 'merge', files: ['tabs-a.md', 'tabs-b.md'], into: 'tabs-a.md', reason: 'dup', name: 'tabs', description: 'Indent with tabs', type: 'feedback', body: 'Use tabs.' }
const REMOVE: DreamAction = { action: 'remove', files: ['old-port.md'], into: 'old-port.md', reason: 'stale', name: '', description: '', type: '', body: '' }
const REWRITE: DreamAction = { action: 'rewrite', files: ['uses-pnpm.md'], into: 'uses-pnpm.md', reason: 'clearer', name: '', description: 'pnpm only', type: '', body: 'Use pnpm.' }

describe('FR-DP-02: what applying a plan does to the files', () => {
  test('merge: the target holds the merged text, the others are emptied; remove empties; rewrite keeps the name and type', () => {
    const c = dreamChanges([MERGE, REMOVE, REWRITE], FILES)
    const by = (f: string) => c.find(x => x.file === f)
    expect(by('tabs-a.md')?.after).toBe(memoryFile({ file: 'tabs-a.md', name: 'tabs', description: 'Indent with tabs', type: 'feedback', body: 'Use tabs.' }))
    expect(by('tabs-a.md')?.role).toBe('merged-into')
    expect(by('tabs-b.md')).toMatchObject({ after: '', role: 'merged-away' })
    expect(by('old-port.md')).toMatchObject({ after: '', role: 'removed' })
    expect(by('uses-pnpm.md')?.after).toBe(memoryFile({ file: 'uses-pnpm.md', name: 'uses-pnpm', description: 'pnpm only', type: 'project', body: 'Use pnpm.' }))
    expect(by('uses-pnpm.md')?.before).toContain('Run pnpm install')
  })

  test('a rewrite with no description keeps the old one', () => {
    const c = dreamChanges([{ ...REWRITE, description: '' }], FILES)
    expect(c[0]?.after).toContain('description: The build uses pnpm')
  })

  test('MEMORY.md: a gone file loses its line, a merged or rewritten file has its line replaced in place', () => {
    const index = '- [tabs-a](tabs-a.md) — old\n- [tabs-b](tabs-b.md) — old b\n- [uses-pnpm](uses-pnpm.md) — pnpm\n- [old-port](old-port.md) — 3000\n'
    const out = dreamIndex(index, dreamChanges([MERGE, REMOVE, REWRITE], FILES))
    expect(out).toBe('- [tabs](tabs-a.md) — Indent with tabs\n- [uses-pnpm](uses-pnpm.md) — pnpm only\n')
    expect(dreamIndex('', dreamChanges([REMOVE], FILES))).toBe('\n')
  })

  test('sources.json: a merged-away file\'s rows move to the target (the union); a removed file\'s rows go; others stay', () => {
    const w = (file: string, session: string) => ({ file, session, at: 1, kind: 'new' as const })
    const out = dreamSources({ writes: [w('tabs-a.md', 'aaaa'), w('tabs-b.md', 'bbbb'), w('old-port.md', 'cccc'), w('uses-pnpm.md', 'dddd')] }, [MERGE, REMOVE])
    expect(out.writes.map(x => `${x.file}:${x.session}`)).toEqual(['tabs-a.md:aaaa', 'tabs-a.md:bbbb', 'uses-pnpm.md:dddd'])
  })
})

describe('FR-DP-02: fingerprints and backups', () => {
  test('hashText: stable, line-ending blind, changes with the text', () => {
    expect(hashText('a\nb')).toBe(hashText('a\r\nb'))
    expect(hashText('a\nb')).not.toBe(hashText('a\nc'))
  })

  test('staleFiles: a changed, emptied or missing file is stale; an unchanged one is not', () => {
    const bases = basesOf([MERGE], FILES)
    expect(Object.keys(bases)).toEqual(['tabs-a.md', 'tabs-b.md'])
    expect(staleFiles(bases, FILES)).toEqual([])
    const changed = FILES.map(f => (f.file === 'tabs-b.md' ? { ...f, text: `${f.text}more` } : f))
    expect(staleFiles(bases, changed)).toEqual(['tabs-b.md'])
    expect(staleFiles(bases, FILES.filter(f => f.file !== 'tabs-a.md'))).toEqual(['tabs-a.md'])
  })

  test('backupName: UTC, sortable, no colons; latestBackup is the newest', () => {
    expect(backupName(1_700_000_000_000)).toBe('20231114-221320-000')
    expect(backupName(1_700_000_000_000 + 1500)).toBe('20231114-221321-500')
    expect(latestBackup(['20231114-221320-000', '20231114-221321-500', '20231113-000000-000'])).toBe('20231114-221321-500')
    expect(latestBackup([])).toBeNull()
  })

  test('dreamStatusText', () => {
    expect(dreamStatusText(IDLE_DREAM, 20, 3)).toBe('Dream: nothing waiting. Automatic: every 20 turns (3 so far) and before a compaction.')
    expect(dreamStatusText({ ...IDLE_DREAM, due: true }, 0, 0)).toBe('Dream: due: run /dream. Automatic: off.')
    expect(dreamStatusText({ ...IDLE_DREAM, phase: 'preview', actions: [MERGE] }, 20, 0)).toContain('a plan is waiting (1 action)')
  })
})

describe('FR-DP-05: the summary atom', () => {
  const dream = (o: Partial<typeof IDLE_DREAM>) => ({ ...IDLE_DREAM, ...o })
  const view = (o: Partial<typeof IDLE_VIEW>) => ({ ...IDLE_VIEW, ...o })

  test('dream due: when the trigger fired and nothing is waiting yet, and while the plan waits', () => {
    expect(combinedSummary(IDLE_VIEW, dream({ due: true }))).toEqual({ state: 'ok', label: 'dream due' })
    const waiting = combinedSummary(IDLE_VIEW, dream({ phase: 'preview', due: true, actions: [MERGE] }))
    expect(waiting?.label).toBe('dream due')
    expect(waiting?.state).toBe('ok')
    expect(waiting?.detail).toContain('merge tabs-a.md + tabs-b.md')
  })

  test('a plan asked for with /dream is a preview, not "due"', () => {
    expect(combinedSummary(IDLE_VIEW, dream({ phase: 'preview', actions: [MERGE] }))?.label).toBe('dream preview')
  })

  test('dreaming while the fork plans; a failure is a warning; applied says what changed', () => {
    expect(combinedSummary(IDLE_VIEW, dream({ phase: 'working', due: true }))).toEqual({ state: 'busy', label: 'dreaming' })
    expect(combinedSummary(IDLE_VIEW, dream({ phase: 'error', note: 'fork: error' }))).toEqual({ state: 'warn', label: 'dream failed', detail: 'fork: error' })
    expect(combinedSummary(IDLE_VIEW, dream({ phase: 'applied', actions: [MERGE, REMOVE] }))).toEqual({ state: 'ok', label: 'dream applied', detail: '1 merged, 1 removed, 0 rewritten' })
  })

  test('nothing when idle and not due; the memory chip keeps its place; dreaming outranks it', () => {
    expect(combinedSummary(IDLE_VIEW, IDLE_DREAM)).toBeNull()
    const memory = view({ phase: 'done', written: [{ file: 'a.md', kind: 'new', added: 1, removed: 0 }] })
    expect(combinedSummary(memory, dream({ due: true }))?.label).toBe('memory: 1 file')
    expect(combinedSummary(view({ phase: 'working' }), dream({ phase: 'working' }))?.label).toBe('dreaming')
    expect(combinedSummary(view({ phase: 'working' }), dream({ due: true }))?.label).toBe('memory updating')
  })
})
