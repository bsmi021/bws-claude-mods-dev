import { test, expect, describe } from 'claude-code/testing'
import {
  addedBlock,
  ADDED_HEAD,
  classifyPrompt,
  cutListing,
  explainText,
  failLine,
  gateSummary,
  hashText,
  keepGate,
  KEPT_GATES,
  mergeEntries,
  namedSkills,
  parseGates,
  parseListing,
  parseMode,
  parsePicks,
  parseTopK,
  savedChars,
  statusText,
  tokens,
  type LastPick,
} from '../hooks/gate'
import { LISTING, NAMES } from './listing'


describe('FR-SG-01: the listing, parsed and cut', () => {
  test('parse: the head, one entry per skill, continuation lines stay with their entry, plugin:skill names', () => {
    const l = parseListing(LISTING)!
    expect(l.head).toEqual(['The following skills are available for use with the Skill tool:', ''])
    expect(l.entries.map(x => x.name)).toEqual(NAMES)
    expect(l.entries[2]?.text).toBe('- claude-api: Reference for the Claude API.\nTRIGGER - read BEFORE opening the target file.\nSKIP only when another provider is being worked on.')
  })

  test('parse: text with no entries is null', () => {
    expect(parseListing('The following skills are available for use with the Skill tool:\n')).toBeNull()
    expect(parseListing('')).toBeNull()
  })

  test('cut: the head and the kept entries in the listing order, whatever order the picks came in', () => {
    const l = parseListing(LISTING)!
    expect(cutListing(l, ['simplify', 'claude-api'])).toBe(
      [
        'The following skills are available for use with the Skill tool:',
        '',
        '- claude-api: Reference for the Claude API.',
        'TRIGGER - read BEFORE opening the target file.',
        'SKIP only when another provider is being worked on.',
        '- simplify: Review the changed code for reuse, then apply the fixes.',
      ].join('\n'),
    )
  })

  test('cut: keeping every skill gives the listing back byte for byte; keeping none leaves the head', () => {
    const l = parseListing(LISTING)!
    expect(cutListing(l, NAMES)).toBe(LISTING)
    expect(cutListing(l, [])).toBe('The following skills are available for use with the Skill tool:\n')
  })

  test('the block a later prompt carries is in the listing format', () => {
    const l = parseListing(LISTING)!
    expect(addedBlock([l.entries[1]!])).toBe(`${ADDED_HEAD}\n\n- dataviz: Use this skill whenever you are about to create ANY chart.`)
  })
})

describe('FR-SG-02: modes, the classifier call and its answer', () => {
  test('mode: off or on, case and spaces ignored; anything else is null', () => {
    expect(parseMode(' On ')).toBe('on')
    expect(parseMode('off')).toBe('off')
    expect(parseMode('always')).toBeNull()
    expect(parseMode(undefined)).toBeNull()
  })

  test('topK: a whole number from 1, at most 20; anything else is 5', () => {
    expect(parseTopK(3)).toBe(3)
    expect(parseTopK('7')).toBe(7)
    expect(parseTopK(50)).toBe(20)
    expect(parseTopK(0)).toBe(5)
    expect(parseTopK('x')).toBe(5)
    expect(parseTopK(undefined)).toBe(5)
  })

  test('the classifier prompt: every skill with its description on one line, the limit, the request as data', () => {
    const p = classifyPrompt('draw a chart of sales', parseListing(LISTING)!.entries, 5)
    expect(p).toContain('- claude-api: Reference for the Claude API. TRIGGER - read BEFORE opening the target file. SKIP only')
    expect(p).toContain('Pick at most 5 skills')
    expect(p).toMatch(/<request>\ndraw a chart of sales\n<\/request>$/)
  })

  test('picks: the JSON array in the answer, known names only, a leading / dropped, no repeats, at most topK', () => {
    expect(parsePicks('["dataviz", "simplify"]', NAMES, 5)).toEqual(['dataviz', 'simplify'])
    expect(parsePicks('Sure:\n```json\n["/simplify", "nope", "simplify", 3, "dataviz"]\n```', NAMES, 5)).toEqual(['simplify', 'dataviz'])
    expect(parsePicks('["dataviz", "simplify", "claude-api"]', NAMES, 2)).toEqual(['dataviz', 'simplify'])
    expect(parsePicks('[]', NAMES, 5)).toEqual([])
  })

  test('picks: no readable array is null', () => {
    expect(parsePicks('dataviz, simplify', NAMES, 5)).toBeNull()
    expect(parsePicks('["dataviz"', NAMES, 5)).toBeNull()
    expect(parsePicks('{"skills": "dataviz"}', NAMES, 5)).toBeNull()
  })

  test('/name in the prompt: known skills only, plugin:skill names, trailing punctuation dropped, listing order', () => {
    expect(namedSkills('use /simplify. then /dataviz, and /nope', NAMES)).toEqual(['dataviz', 'simplify'])
    expect(namedSkills('/pil-agent-plugin:image-analysis the render', NAMES)).toEqual(['pil-agent-plugin:image-analysis'])
    expect(namedSkills('see src/dataviz/x.ts and a/b', NAMES)).toEqual([])
  })
})

describe('FR-SG-03: the same input gives the same bytes', () => {
  test('a row hash is stable and tells rows apart', () => {
    expect(hashText(LISTING)).toBe(hashText(`${LISTING}`))
    expect(hashText(LISTING)).not.toBe(hashText(`${LISTING} `))
    expect(hashText('')).toMatch(/^[0-9a-f]{8}$/)
  })

  test('the same picks cut the same listing to identical text', () => {
    const a = cutListing(parseListing(LISTING)!, ['dataviz', 'simplify'])
    const b = cutListing(parseListing(LISTING)!, ['simplify', 'dataviz'])
    expect(a).toBe(b)
  })

  test('records: a new row merges its skills; the store keeps at most 20 conversations, the newest last', () => {
    const l = parseListing(LISTING)!
    expect(mergeEntries(l.entries.slice(0, 2), l.entries.slice(1, 3)).map(x => x.name)).toEqual(['mods-harness', 'dataviz', 'claude-api'])
    const recs = Array.from({ length: KEPT_GATES }, (_, i) => ({ session: `s${i}`, rows: [], entries: [], shown: [] }))
    const kept = keepGate(recs, { session: 's0', rows: [], entries: [], shown: ['x'] })
    expect(kept.length).toBe(KEPT_GATES)
    expect(kept[KEPT_GATES - 1]).toEqual({ session: 's0', rows: [], entries: [], shown: ['x'] })
    expect(keepGate(recs, { session: 'new', rows: [], entries: [], shown: [] })[0]?.session).toBe('s1')
  })

  test('the store is read back defensively: malformed records are dropped', () => {
    const good = { session: 's', rows: [{ hash: 'h', sent: 't' }], entries: [{ name: 'a', text: '- a: x' }], shown: ['a'] }
    expect(parseGates([good, { session: 1 }, null, 'x', { ...good, shown: [1] }])).toEqual([good])
    expect(parseGates(undefined)).toEqual([])
  })
})

describe('FR-SG-05: what the cut saved, explain and the summary atom', () => {
  const PICK: LastPick = { step: 'listing', picks: ['dataviz', 'simplify'], named: [], added: ['dataviz', 'simplify'], shown: 2, total: 5, savedTokens: 40, failed: null }

  test('saved characters are the entries not shown, each with its newline; tokens are characters / 4', () => {
    const l = parseListing(LISTING)!
    const notShown = l.entries.filter(x => x.name !== 'dataviz').reduce((n, x) => n + x.text.length + 1, 0)
    expect(savedChars(l.entries, ['dataviz'])).toBe(notShown)
    expect(savedChars(l.entries, NAMES)).toBe(0)
    expect(tokens(10)).toBe(3)
    expect(tokens(-4)).toBe(0)
  })

  test('explain: the picks in order, the /names, the cut, shown of total and the tokens saved', () => {
    expect(explainText(PICK)).toBe(
      [
        'Picks for the last prompt, most relevant first: dataviz, simplify.',
        'Named with /name: none.',
        'The listing was cut to: dataviz, simplify.',
        'Shown to the model: 2 of 5 skills. Tokens saved: about 40 (characters / 4).',
      ].join('\n'),
    )
    expect(explainText({ ...PICK, step: 'added', added: [] })).toContain('Added for this prompt: none.')
    expect(explainText(null)).toMatch(/^No prompt gated yet/)
    expect(explainText({ ...PICK, failed: 'timeout' })).toBe('The last prompt kept the full skill listing: timeout.')
  })

  test('summary atom shape: none when off; the share and the saving while on; warn after a fail-open', () => {
    expect(gateSummary('off', PICK)).toBeNull()
    expect(gateSummary('on', null)).toEqual({ state: 'ok', label: 'skills: gate on' })
    expect(gateSummary('on', PICK)).toEqual({ state: 'ok', label: 'skills 2/5 -40 tok', detail: 'picks: dataviz, simplify' })
    expect(gateSummary('on', { ...PICK, failed: 'timeout' })).toEqual({ state: 'warn', label: 'skills: full list', detail: 'timeout' })
  })

  test('status text says where the mode came from and what the last prompt did', () => {
    expect(statusText('off', false, 5, 'haiku', null)).toBe('Skill gate: off (from the plugin option). Top 5, model haiku.\nThe model sees the full skill listing.')
    expect(statusText('on', true, 3, 'haiku', PICK)).toContain('Listing: 2 of 5 skills shown, about 40 tokens saved.')
    expect(statusText('on', true, 3, 'haiku', { ...PICK, failed: 'timeout' })).toContain('the full listing stayed (timeout)')
  })
})

describe('FR-SG-04: the debug line', () => {
  test('says what failed and what stayed, never the prompt', () => {
    expect(failLine('listing', 'timeout')).toBe('bws-skillgate: listing gate failed (timeout); the full skill listing stays')
    expect(failLine('prompt', 'error')).toBe('bws-skillgate: prompt gate failed (error); nothing was added')
  })
})
