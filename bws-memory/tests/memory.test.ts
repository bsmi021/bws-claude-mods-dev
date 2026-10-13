import { test, expect, describe } from 'claude-code/testing'
import {
  addSources,
  cleanEntries,
  exchangeOf,
  forkPrompt,
  indexLine,
  jsonOf,
  lineDiff,
  memoriesText,
  memoryFile,
  memorySummary,
  parseEntries,
  parseMinWords,
  parseSources,
  parseUndo,
  planWrites,
  readExisting,
  redact,
  resolveDir,
  resultText,
  skipReason,
  slugify,
  undoneText,
  upsertIndex,
  type Entry,
} from '../hooks/memory'

const ENTRY: Entry = { file: 'prefers-tabs.md', name: 'prefers-tabs', description: 'The user wants tabs, not spaces', type: 'feedback', body: 'Use tabs.\n\nWhy: house style.\nHow to apply: every file.' }
const base = { isHeadless: false, agentId: undefined, reason: 'answer', isRunning: false, userWords: 20, tools: 0, minWords: 8 }

describe('FR-MEM-01: what is looked at', () => {
  test('skipReason: headless, subagent, an unfinished turn, a running fork, a short turn with no tools', () => {
    expect(skipReason(base)).toBeNull()
    expect(skipReason({ ...base, isHeadless: true })).toBe('headless')
    expect(skipReason({ ...base, agentId: 'a1' })).toBe('subagent')
    expect(skipReason({ ...base, reason: 'aborted' })).toBe('turn ended aborted')
    expect(skipReason({ ...base, isRunning: true })).toBe('a memory update is running')
    expect(skipReason({ ...base, userWords: 7 })).toBe('short turn, no tools')
    expect(skipReason({ ...base, userWords: 7, tools: 1 })).toBeNull()
    expect(skipReason({ ...base, userWords: 8 })).toBeNull()
  })

  test('exchangeOf: the last typed user message, the tool calls after it, the final answer', () => {
    const rows = [
      { role: 'user', text: 'old question that was long enough', toolUses: [] },
      { role: 'assistant', text: 'old answer', toolUses: [{ tool: 'Read' }] },
      { role: 'user', text: 'always use tabs in this repo please', toolUses: [] },
      { role: 'assistant', text: 'checking', toolUses: [{ tool: 'Read' }, { tool: 'Edit' }] },
      { role: 'user', text: '', toolUses: [] },
      { role: 'assistant', text: 'done', toolUses: [] },
    ]
    const ex = exchangeOf(rows, 'Done, tabs it is.')
    expect(ex.user).toBe('always use tabs in this repo please')
    expect(ex.userWords).toBe(7)
    expect(ex.tools).toBe(2)
    expect(ex.material).toBe('USER: always use tabs in this repo please\n\nASSISTANT: Done, tabs it is.')
    expect(exchangeOf([], 'x')).toMatchObject({ user: '', userWords: 0, tools: 0 })
  })

  test('parseMinWords: a number, a numeric string, else the default', () => {
    expect(parseMinWords(3)).toBe(3)
    expect(parseMinWords('12')).toBe(12)
    expect(parseMinWords(undefined)).toBe(8)
    expect(parseMinWords(-1)).toBe(8)
  })
})

describe('FR-MEM-02: the fork prompt, its JSON, and the write plan', () => {
  test('the fork prompt lists the existing files by name and description, and asks for JSON only', () => {
    const p = forkPrompt([{ file: 'a.md', name: 'a', description: 'about a', text: '' }])
    expect(p).toContain('- a.md: a - about a')
    expect(p).toContain('Reply with JSON only')
    expect(p).toContain('reuse its exact file name')
    expect(forkPrompt([])).toContain('(none yet)')
    expect(forkPrompt([], 'use tabs')).toContain('<remember>use tabs</remember>')
  })

  test('jsonOf and parseEntries: bare, fenced, wrapped in prose, an array, and garbage', () => {
    const json = JSON.stringify({ entries: [{ file: 'Prefers Tabs.md', name: 'prefers-tabs', description: 'The  user wants\ntabs', type: 'Feedback', body: ' Use tabs. ' }] })
    for (const text of [json, '```json\n' + json + '\n```', `Here you go:\n${json}\nDone.`]) {
      const p = parseEntries(text)
      expect(p?.entries).toEqual([{ file: 'prefers-tabs.md', name: 'prefers-tabs', description: 'The user wants tabs', type: 'feedback', body: 'Use tabs.' }])
    }
    expect(parseEntries('[{"name":"x","description":"d","type":"user","body":"b"}]')?.entries[0]?.file).toBe('x.md')
    expect(parseEntries('{"entries":[]}')).toEqual({ entries: [], rejected: 0 })
    expect(parseEntries('no json here')).toBeNull()
    expect(parseEntries('{"foo":1}')).toBeNull()
    expect(jsonOf('')).toBeUndefined()
  })

  test('parseEntries drops entries with no body, a bad type or a repeated file, and caps the count', () => {
    const e = (o: object) => ({ name: 'n', description: 'd', type: 'user', body: 'b', ...o })
    const p = parseEntries(JSON.stringify({ entries: [e({}), e({ body: '' }), e({ type: 'mood' }), e({ file: 'n' }), e({ name: 'two', file: 'two' })] }))
    expect(p?.entries.map(x => x.file)).toEqual(['n.md', 'two.md'])
    expect(p?.rejected).toBe(3)
    const many = Array.from({ length: 9 }, (_, i) => e({ name: `n${i}`, file: `n${i}` }))
    expect(parseEntries(JSON.stringify(many))?.entries.length).toBe(5)
  })

  test('slugify: never the index name, never a path', () => {
    expect(slugify('Memory')).toBe('memory-note')
    expect(slugify('../Evil Name!.md')).toBe('evil-name')
    expect(slugify('')).toBe('')
  })

  test('memoryFile uses the repo memory frontmatter; readExisting reads it back', () => {
    const text = memoryFile(ENTRY)
    expect(text).toBe('---\nname: prefers-tabs\ndescription: The user wants tabs, not spaces\nmetadata:\n  type: feedback\n---\n\nUse tabs.\n\nWhy: house style.\nHow to apply: every file.\n')
    expect(readExisting('prefers-tabs.md', text)).toMatchObject({ file: 'prefers-tabs.md', name: 'prefers-tabs', description: 'The user wants tabs, not spaces' })
    expect(readExisting('plain.md', 'no frontmatter')).toMatchObject({ name: 'plain', description: '' })
  })

  test('planWrites: new, update by file name, update by name under another file name, duplicate refused', () => {
    const old = memoryFile(ENTRY)
    const existing = [readExisting('prefers-tabs.md', old)]
    const full = new Map([['prefers-tabs.md', old]])
    const fresh = planWrites([{ ...ENTRY, file: 'other.md', name: 'other', description: 'o', body: 'x' }], existing, full)
    expect(fresh).toMatchObject([{ file: 'other.md', kind: 'new', before: null }])
    expect(fresh[0]?.added).toBe(lineDiff(null, fresh[0]!.after).added)

    const same = planWrites([ENTRY], existing, full)
    expect(same).toMatchObject([{ file: 'prefers-tabs.md', kind: 'duplicate', added: 0, removed: 0 }])

    const changed = planWrites([{ ...ENTRY, body: 'Use tabs.\n\nWhy: house style and the linter.' }], existing, full)
    expect(changed[0]).toMatchObject({ file: 'prefers-tabs.md', kind: 'update', added: 1, removed: 2 })

    const byName = planWrites([{ ...ENTRY, file: 'tabs-note.md', body: 'Different.' }], existing, full)
    expect(byName[0]).toMatchObject({ file: 'prefers-tabs.md', kind: 'update' }) // matched by name: never a second file

    const twice = planWrites([ENTRY, { ...ENTRY, body: 'again' }], [], new Map())
    expect(twice.length).toBe(1)
  })

  test('lineDiff counts lines added and removed as multisets', () => {
    expect(lineDiff(null, 'a\nb\n')).toEqual({ added: 2, removed: 0 })
    expect(lineDiff('a\nb\nc', 'a\nc\nd\ne')).toEqual({ added: 2, removed: 1 })
    expect(lineDiff('a\na', 'a')).toEqual({ added: 0, removed: 1 })
    expect(lineDiff('a\r\nb', 'a\nb')).toEqual({ added: 0, removed: 0 })
  })

  test('the index: one line per file, replaced in place when the file is already listed', () => {
    const line = indexLine({ file: 'a.md', name: 'a', description: 'about   a' })
    expect(line).toBe('- [a](a.md) — about a')
    expect(upsertIndex('', [{ file: 'a.md', line }])).toBe(`${line}\n`)
    const two = upsertIndex(`${line}\n`, [{ file: 'b.md', line: '- [b](b.md) — about b' }])
    expect(two).toBe(`${line}\n- [b](b.md) — about b\n`)
    expect(upsertIndex(two, [{ file: 'a.md', line: '- [a](a.md) — new words' }])).toBe('- [a](a.md) — new words\n- [b](b.md) — about b\n')
  })

  test('resolveDir: the default folder, a relative option, an absolute one, backslashes', () => {
    expect(resolveDir('', 'C:\\proj\\')).toBe('C:/proj/.claude/bws-memory')
    expect(resolveDir('mem', 'C:\\proj')).toBe('C:/proj/mem')
    expect(resolveDir('./mem/', '/home/me/proj')).toBe('/home/me/proj/mem')
    expect(resolveDir('D:\\notes\\memory\\', 'C:\\proj')).toBe('D:/notes/memory')
    expect(resolveDir('/tmp/m', '/home/me')).toBe('/tmp/m')
  })
})

describe('FR-MEM-03: redaction', () => {
  test('keys, tokens and passwords become [redacted]', () => {
    const cases: [string, string][] = [
      ['key sk-ant-api03-AbCdEf1234567890xyz here', 'key [redacted] here'],
      ['token ghp_abcdefghijklmnopqrstuvwxyz0123456789 ok', 'token [redacted] ok'],
      ['aws AKIAABCDEFGHIJKLMNOP end', 'aws [redacted] end'],
      ['Authorization: Bearer abcdefghijklmnop1234567890', 'Authorization: [redacted]'],
      ['password: hunter22 and more', 'password: [redacted] and more'],
      ['API_KEY=abc12345', 'API_KEY=[redacted]'],
      ['the password is swordfish1', 'the password is [redacted]'],
      ['postgres://admin:s3cret@db.example.com/x', '[redacted]db.example.com/x'],
      ['jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkw.SflKxwRJSMeKKF2QT4fwpM end', 'jwt [redacted] end'],
      ['hash ab12CD34ef56GH78ij90KL12mn34OP56qr78 x', 'hash [redacted] x'],
    ]
    for (const [input, out] of cases) expect(redact(input).text).toBe(out)
    expect(redact('-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----').text).toBe('[redacted]')
  })

  test('ordinary prose, paths, versions and short ids are left alone', () => {
    const text = 'Use tabs. See docs/SPEC-VIDEO-MODS.md, version 2.1.296, commit e847f94, the token budget and the password policy.'
    expect(redact(text)).toEqual({ text, hits: 0, chars: 0 })
  })

  test('cleanEntries redacts every field before writing', () => {
    const c = cleanEntries([{ ...ENTRY, description: 'uses sk-abcdefghijklmnopqrstuv', body: 'Set password: hunter22 once.\nLong prose line that is plainly not a secret at all, just text.' }])
    expect(c.entries[0]?.description).toBe('uses [redacted]')
    expect(c.entries[0]?.body).toContain('password: [redacted] once.')
    expect(c.hits).toBe(2)
    expect(c.mostlySecrets).toBe(false)
  })

  test('a reply that is mostly secrets is dropped', () => {
    const mostly = cleanEntries([{ ...ENTRY, body: 'sk-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH' }])
    expect(mostly.mostlySecrets).toBe(true)
    const bare = cleanEntries([{ ...ENTRY, body: 'password: hunter22' }])
    expect(bare.mostlySecrets).toBe(false) // the key word stays; only the value goes
    const marker = cleanEntries([{ ...ENTRY, body: '[redacted]' }])
    expect(marker.mostlySecrets).toBe(true)
  })
})

describe('FR-MEM-04 and FR-MEM-05: texts, sources, undo record', () => {
  test('memorySummary: the chip while working, the count when done, a warning on failure, nothing when idle', () => {
    expect(memorySummary({ phase: 'idle', written: [], note: '' })).toBeNull()
    expect(memorySummary({ phase: 'working', written: [], note: '' })).toEqual({ state: 'busy', label: 'memory updating' })
    expect(memorySummary({ phase: 'done', written: [{ file: 'a.md', kind: 'new', added: 3, removed: 0 }], note: '' })).toEqual({ state: 'ok', label: 'memory: 1 file', detail: 'a.md (new) +3 -0' })
    expect(memorySummary({ phase: 'error', written: [], note: 'fork: timeout' })).toEqual({ state: 'warn', label: 'memory not saved', detail: 'fork: timeout' })
  })

  test('sources: parse, add a batch, keep the cap, list the last 20 newest first with the session', () => {
    expect(parseSources('not json')).toEqual({ writes: [] })
    expect(parseSources({ writes: [{ file: 'a.md', session: 's', at: 1, kind: 'new' }, { file: 1 }, null] }).writes.length).toBe(1)
    let s = parseSources('')
    for (let i = 0; i < 25; i++) s = addSources(s, [{ file: `f${i}.md`, kind: 'new', added: 1, removed: 0 }], `session-${i}-long-id`, Date.UTC(2026, 9, 13, 12, i))
    const text = memoriesText(s)
    expect(text.split('\n').length).toBe(21)
    expect(text).toContain('The last 20 memory writes, newest first:')
    expect(text.split('\n')[1]).toBe('- f24.md: new, session session-, 2026-10-13 12:24')
    expect(text).not.toContain('f4.md')
    expect(memoriesText({ writes: [] })).toBe('No memories written yet.')
    expect(addSources({ writes: Array.from({ length: 200 }, () => ({ file: 'x.md', session: 's', at: 1, kind: 'new' as const })) }, [{ file: 'y.md', kind: 'update', added: 0, removed: 0 }], 's', 2).writes.length).toBe(200)
  })

  test('the undo record parses; the undo text says what was restored and what was only emptied', () => {
    expect(parseUndo('garbage')).toBeNull()
    expect(parseUndo({ at: 1 })).toBeNull()
    const rec = parseUndo({ at: 1, files: [{ file: 'a.md', before: 'x' }, { file: 'b.md', before: null }, { nope: 1 }], index: 'i', sources: null })
    expect(rec).toEqual({ at: 1, files: [{ file: 'a.md', before: 'x' }, { file: 'b.md', before: null }], index: 'i', sources: null })
    expect(undoneText(rec!)).toBe('Undid the last memory write: 1 file restored, 1 new file emptied (a mod cannot delete files; its index line is gone).')
  })

  test('resultText', () => {
    expect(resultText([], 0)).toBe('Nothing was worth saving.')
    expect(resultText([], 2)).toBe('Nothing new: that is already in memory.')
    expect(resultText([{ file: 'a.md', kind: 'update', added: 1, removed: 2 }], 0)).toBe('Memory updated: a.md (update) +1 -2.')
  })
})
