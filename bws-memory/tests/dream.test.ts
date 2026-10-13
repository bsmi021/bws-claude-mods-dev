import { test, expect, describe } from 'claude-code/testing'
import { cleanPlan, dreamFiles, dreamPrompt, MAX_FILE_CHARS, MAX_DREAM_FILES, parseDreamPlan, planText, sessionsByFile, validatePlan } from '../hooks/dream'
import type { DreamAction } from '../hooks/dream'
import { memoryFile } from '../hooks/memory'
import { NEW, OLD, PNPM, TABS_A, TABS_B, MERGE_AB } from './dreamworld'

const FILES = [TABS_A, TABS_B, PNPM, OLD, NEW].map(e => ({ file: e.file, text: memoryFile(e) }))
const known = (n: number) => FILES.slice(0, n).map(f => ({ file: f.file }))
const merge = (files: string[], into = files[0] ?? ''): DreamAction => ({ action: 'merge', files, into, reason: 'dup', name: 'x', description: 'd', type: 'user', body: 'b' })
const remove = (file: string): DreamAction => ({ action: 'remove', files: [file], into: file, reason: 'stale', name: '', description: '', type: '', body: '' })
const rewrite = (file: string): DreamAction => ({ action: 'rewrite', files: [file], into: file, reason: 'clearer', name: '', description: '', type: '', body: 'b' })

describe('FR-DP-01: what the fork is shown', () => {
  test('dreamFiles: every non-empty file with its frontmatter; empty files, over-long files and files past the cap are left out', () => {
    const long = { file: 'long.md', text: 'x'.repeat(MAX_FILE_CHARS + 1) }
    const r = dreamFiles([...FILES, { file: 'emptied.md', text: '' }, { file: 'blank.md', text: ' \n' }, long])
    expect(r.files.map(f => f.file)).toEqual(['new-port.md', 'old-port.md', 'tabs-a.md', 'tabs-b.md', 'uses-pnpm.md'])
    expect(r.skipped).toBe(1)
    expect(r.files[2]).toMatchObject({ name: 'tabs-a', description: 'The user wants tabs, not spaces', type: 'feedback' })
    const many = Array.from({ length: MAX_DREAM_FILES + 3 }, (_, i) => ({ file: `f${String(i).padStart(3, '0')}.md`, text: 'a' }))
    const m = dreamFiles(many)
    expect(m.files.length).toBe(MAX_DREAM_FILES)
    expect(m.skipped).toBe(3)
  })

  test('the prompt carries each file whole, its sessions, the JSON format and the 40% rule', () => {
    const { files } = dreamFiles(FILES)
    const p = dreamPrompt(files, new Map([['tabs-a.md', ['aaaa1111', 'bbbb2222']]]))
    expect(p).toContain('=== tabs-a.md (sessions: aaaa1111, bbbb2222)')
    expect(p).toContain('=== uses-pnpm.md (sessions: unknown)')
    expect(p).toContain('Use tabs.')
    expect(p).toContain('"action":"merge"')
    expect(p).toContain('40%')
  })
})

describe('FR-DP-01: parsing the plan', () => {
  test('a merge, a remove and a rewrite become flat actions; names are normalised', () => {
    const r = parseDreamPlan(JSON.stringify({ actions: [MERGE_AB, { action: 'remove', file: 'old-port', reason: 'contradicted by new-port' }, { action: 'rewrite', file: 'uses-pnpm.md', description: 'pnpm', body: 'Use pnpm.', reason: 'clearer' }] }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.actions.map(a => a.action)).toEqual(['merge', 'remove', 'rewrite'])
    expect(r.actions[0]).toMatchObject({ files: ['tabs-a.md', 'tabs-b.md'], into: 'tabs-a.md', name: 'tabs-a', type: 'feedback' })
    expect(r.actions[1]).toMatchObject({ files: ['old-port.md'], into: 'old-port.md', reason: 'contradicted by new-port' })
    expect(r.actions[2]).toMatchObject({ files: ['uses-pnpm.md'], description: 'pnpm', body: 'Use pnpm.', type: '' })
  })

  test('a fenced reply is read; "into" left out defaults to the first file', () => {
    const body = { ...MERGE_AB, into: undefined }
    const r = parseDreamPlan('Here you go:\n```json\n' + JSON.stringify([body]) + '\n```')
    expect(r.ok && r.actions[0]?.into).toBe('tabs-a.md')
  })

  test('an empty plan is a plan', () => {
    expect(parseDreamPlan('{"actions":[]}')).toEqual({ ok: true, actions: [] })
  })

  test('refused: not JSON, no list, no reason, unknown action, malformed merge, bad type, more than 20 actions', () => {
    const bad = (v: unknown) => {
      const r = parseDreamPlan(typeof v === 'string' ? v : JSON.stringify(v))
      return r.ok ? 'ok' : r.error
    }
    expect(bad('sure, merging now')).toContain('no actions')
    expect(bad({ nope: 1 })).toContain('no actions')
    expect(bad({ actions: [{ action: 'remove', file: 'a.md' }] })).toContain('no reason')
    expect(bad({ actions: [{ action: 'burn', file: 'a.md', reason: 'x' }] })).toContain('unknown action')
    expect(bad({ actions: [{ ...MERGE_AB, files: ['tabs-a.md'] }] })).toContain('two or more')
    expect(bad({ actions: [{ ...MERGE_AB, files: ['tabs-a.md', 'tabs-a.md'] }] })).toContain('twice')
    expect(bad({ actions: [{ ...MERGE_AB, into: 'uses-pnpm.md' }] })).toContain('"into"')
    expect(bad({ actions: [{ ...MERGE_AB, body: '' }] })).toContain('lacks')
    expect(bad({ actions: [{ ...MERGE_AB, type: 'secret' }] })).toContain('lacks')
    expect(bad({ actions: [{ action: 'rewrite', file: 'a.md', body: 'x', type: 'weird', reason: 'r' }] })).toContain('unknown type')
    expect(bad({ actions: [{ action: 'rewrite', file: 'a.md', body: '', reason: 'r' }] })).toContain('no body')
    expect(bad({ actions: Array.from({ length: 21 }, () => ({ action: 'remove', file: 'a.md', reason: 'r' })) })).toContain('more than 20')
    expect(bad({ actions: [{ action: 'remove', file: '../up.md', reason: 'r' }] })).toContain('no file')
  })
})

describe('FR-DP-01: validating the plan', () => {
  test('the two-file near-duplicate merge passes (a merge is not a deletion)', () => {
    expect(validatePlan([merge(['tabs-a.md', 'tabs-b.md'])], known(2)).ok).toBe(true)
  })

  test('refused: a plan that removes more than 40% of the files; exactly 40% passes', () => {
    const three = validatePlan([remove('tabs-a.md'), remove('tabs-b.md')], known(3))
    expect(three.ok).toBe(false)
    expect(!three.ok && three.error).toContain('2 of 3')
    expect(validatePlan([remove('tabs-a.md'), remove('tabs-b.md')], known(5)).ok).toBe(true) // 40%
    expect(validatePlan([remove('tabs-a.md'), remove('tabs-b.md'), remove('uses-pnpm.md')], known(5)).ok).toBe(false)
    expect(validatePlan([remove('tabs-a.md')], known(2)).ok).toBe(false) // 50% of two
  })

  test('refused: an unknown file anywhere in an action, a file used twice', () => {
    const u = validatePlan([remove('ghost.md')], known(5))
    expect(!u.ok && u.error).toContain('unknown file: ghost.md')
    expect(validatePlan([merge(['tabs-a.md', 'ghost.md'])], known(5)).ok).toBe(false)
    expect(validatePlan([rewrite('MEMORY.md')], known(5)).ok).toBe(false)
    const twice = validatePlan([merge(['tabs-a.md', 'tabs-b.md']), rewrite('tabs-b.md')], known(5))
    expect(!twice.ok && twice.error).toContain('in two actions')
  })

  test('an empty plan is valid, even for an empty folder', () => {
    expect(validatePlan([], known(0))).toEqual({ ok: true, actions: [] })
  })
})

describe('FR-DP-01: redaction and plan text', () => {
  test('a secret in a merged body is [redacted]; a body of only secrets rejects the plan', () => {
    const r = cleanPlan([{ ...merge(['tabs-a.md', 'tabs-b.md']), body: 'Deploy with API_KEY=abc12345xyz please.' }])
    expect(r.ok && r.actions[0]?.body).toBe('Deploy with API_KEY=[redacted] please.')
    const only = cleanPlan([{ ...rewrite('a.md'), body: 'sk-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH' }])
    expect(only.ok).toBe(false)
    expect(cleanPlan([remove('a.md')]).ok).toBe(true)
  })

  test('planText: one line per action, the reasons, the skipped note; empty says tidy', () => {
    expect(planText([])).toBe('Nothing to consolidate: the memory is already tidy.')
    const t = planText([merge(['a.md', 'b.md']), remove('c.md'), rewrite('d.md')], 2)
    expect(t).toContain('Dream plan: 3 actions.')
    expect(t).toContain('- merge a.md + b.md into a.md: dup')
    expect(t).toContain('- remove c.md: stale')
    expect(t).toContain('- rewrite d.md: clearer')
    expect(t).toContain('2 files were too long')
  })

  test('sessionsByFile: distinct sessions per file, shortened, in order', () => {
    const m = sessionsByFile({
      writes: [
        { file: 'a.md', session: 'aaaa1111-x', at: 1, kind: 'new' },
        { file: 'a.md', session: 'bbbb2222-y', at: 2, kind: 'update' },
        { file: 'a.md', session: 'aaaa1111-x', at: 3, kind: 'update' },
        { file: 'b.md', session: 'cccc3333', at: 4, kind: 'new' },
      ],
    })
    expect(m.get('a.md')).toEqual(['aaaa1111', 'bbbb2222'])
    expect(m.get('b.md')).toEqual(['cccc3333'])
    expect(m.get('z.md')).toBeUndefined()
  })
})
