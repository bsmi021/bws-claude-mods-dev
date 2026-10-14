import { test, expect, describe } from 'claude-code/testing'
import {
  addEntry,
  answerLines,
  bigDigits,
  cardWidths,
  classify,
  heading,
  historyRow,
  isShortReply,
  parseQuestions,
  parseRewrite,
  readHistory,
  restoreFill,
  rewritePrompt,
  segWidth,
  statsLine,
  tilesWidth,
  titleRule,
  tracker,
  type Submitted,
} from '../hooks/lib'

const typed = (text: string, more: Partial<Submitted> = {}): Submitted => ({ text, origin: { kind: 'composer' }, ...more })
const ON = { auto: true, armed: false }

describe('which prompts are taken', () => {
  test('a typed prompt is taken while auto is on', () => {
    expect(classify(typed('write a landing page for my game'), ON)).toEqual({ kind: 'take' })
  })

  test('with auto off nothing is touched, ">" included', () => {
    expect(classify(typed('write a landing page for my game'), { auto: false, armed: false })).toEqual({ kind: 'pass' })
    expect(classify(typed('> write a landing page'), { auto: false, armed: false })).toEqual({ kind: 'pass' })
  })

  test('slash commands, attachments, mid-turn prompts and hidden prompts pass', () => {
    expect(classify(typed('/compact now please'), ON)).toEqual({ kind: 'pass' })
    expect(classify(typed('/review the diff', { command: { name: 'review', args: 'the diff' } }), ON)).toEqual({ kind: 'pass' })
    expect(classify(typed('what is wrong in this screenshot here', { attachments: [{ type: 'image' }] }), ON)).toEqual({ kind: 'pass' })
    expect(classify(typed('also fix the header while you are at it', { turnId: 't1' }), ON)).toEqual({ kind: 'pass' })
    expect(classify(typed('a hidden reminder for the model', { isMeta: true }), ON)).toEqual({ kind: 'pass' })
  })

  test('short replies pass', () => {
    for (const t of ['yes', 'keep going', 'ok do it', 'no', 'go ahead and ship it', 'Looks good, merge it now']) {
      expect(classify(typed(t), ON), t).toEqual({ kind: 'pass' })
    }
    expect(isShortReply('make the menu screen feel calmer')).toBe(false)
    expect(isShortReply('fix the build')).toBe(true)
  })

  test('">" sends the rest as it is', () => {
    expect(classify(typed('> write a landing page for my game'), ON)).toEqual({ kind: 'strip', text: 'write a landing page for my game' })
    expect(classify(typed('>quick one: rename foo to bar everywhere'), ON)).toEqual({ kind: 'strip', text: 'quick one: rename foo to bar everywhere' })
    expect(classify(typed('>'), ON)).toEqual({ kind: 'pass' })
  })

  test("the mod's own submit, and anything not typed, is never taken (no loop)", () => {
    expect(classify({ text: 'Write a landing page for my game.', origin: { kind: 'plugin' } }, ON)).toEqual({ kind: 'pass' })
    expect(classify({ text: 'a long notification text here', origin: { kind: 'task-notification' } }, ON)).toEqual({ kind: 'pass' })
    expect(classify({ text: 'Write a landing page for my game.', origin: { kind: 'plugin' } }, { auto: true, armed: true })).toEqual({ kind: 'pass' })
  })

  test('after Edit the next typed prompt passes once, even mid-turn or with auto off', () => {
    expect(classify(typed('the edited upgrade, long enough to be taken'), { auto: true, armed: true })).toEqual({ kind: 'armed' })
    expect(classify(typed('anything', { turnId: 't' }), { auto: false, armed: true })).toEqual({ kind: 'armed' })
  })
})

describe('reading the questions', () => {
  test('fenced JSON, chatter around it, options clipped and deduped, at most three', () => {
    const reply = `Here you go:\n\`\`\`json\n${JSON.stringify({
      questions: [
        { q: 'Who is the page for?', options: ['Players', 'Press', 'players'] },
        { question: 'What tone?', options: ['Calm', 'Hype', 'Dry', 'Warm', 'Loud'] },
        { q: 'Only one option', options: ['Yes'] },
        { q: 'Length?', options: ['Short', 'Long'] },
        { q: 'A fourth?', options: ['A', 'B'] },
      ],
    })}\n\`\`\``
    expect(parseQuestions(reply)).toEqual([
      { text: 'Who is the page for?', options: ['Players', 'Press'] },
      { text: 'What tone?', options: ['Calm', 'Hype', 'Dry', 'Warm'] },
      { text: 'Length?', options: ['Short', 'Long'] },
    ])
  })

  test('none needed, and unreadable', () => {
    expect(parseQuestions('{"questions":[]}')).toEqual([])
    expect(parseQuestions('I would ask about the audience.')).toBeNull()
    expect(parseQuestions('{"questions": "none"}')).toBeNull()
  })
})

describe('reading the rewrite', () => {
  test('JSON with the added list', () => {
    const r = parseRewrite('{"prompt":"Write a landing page for [game name] aimed at new players.","added":["Audience: new players","", 3, "Done when it reads in a minute"]}')
    expect(r).toEqual({ prompt: 'Write a landing page for [game name] aimed at new players.', added: ['Audience: new players', 'Done when it reads in a minute'] })
  })

  test('plain text is taken as the prompt; empty or broken JSON is not', () => {
    expect(parseRewrite('Write the page.')).toEqual({ prompt: 'Write the page.', added: [] })
    expect(parseRewrite('{"prompt":""}')).toBeNull()
    expect(parseRewrite('{"prompt": "cut off')).toBeNull()
    expect(parseRewrite('   ')).toBeNull()
  })

  test('answers given are used, skipped ones left out', () => {
    const qs = [
      { text: 'Who is it for?', options: ['Players', 'Press'] },
      { text: 'Tone?', options: ['Calm', 'Hype'] },
      { text: 'Length?', options: ['Short', 'Long'] },
    ]
    const answers = [{ kind: 'option', value: 'Players' }, { kind: 'skip' }, { kind: 'other', value: 'One screen' }] as const
    expect(answerLines(qs, [...answers])).toEqual(['Who is it for? Players', 'Length? One screen'])
    const p = rewritePrompt('landing page', qs, [...answers])
    expect(p).toContain('<request>\nlanding page\n</request>')
    expect(p).not.toContain('Tone?')
    expect(rewritePrompt('x', [], [])).toContain('(none)')
  })
})

describe('drawing', () => {
  test('big digits are three rows of heavy lines, equal widths', () => {
    const rows = bigDigits(120)
    expect(rows.length).toBe(3)
    expect(rows[0]).toBe('╺┓  ╺━┓ ┏━┓')
    expect(new Set(rows.map(r => r.length)).size).toBe(1)
  })

  for (const cols of [40, 160]) {
    test(`every row fits ${cols} columns`, () => {
      const r = titleRule(cols)
      expect(r.gold.length + r.hair.length).toBe(cols)
      const h = heading('What I added', cols)
      expect(h.label.length + 1 + h.hair.length).toBe(cols)
      for (let step = 0; step < 4; step++) expect(segWidth(tracker(step, cols))).toBeLessThanOrEqual(cols)
      expect(statsLine(1234, 5678, 12, cols).length).toBeLessThanOrEqual(cols)
      const w = cardWidths(cols)
      expect(w.isSide ? w.left + 1 + w.right : w.left).toBe(cols)
      const t = tilesWidth([12, 340, 5], cols)
      if (t !== null) expect(t).toBeLessThanOrEqual(cols)
      const row = historyRow({ id: '1', at: 0, original: 'x'.repeat(400), upgraded: '', added: [] }, cols)
      expect(row.when.length + 2 + row.text.length).toBeLessThanOrEqual(cols)
    })
  }

  test('narrow falls back: plain stats, stacked cards, marks-only tracker', () => {
    expect(tilesWidth([12, 340, 5], 40)).toBeNull()
    expect(tilesWidth([12, 340, 5], 160)).not.toBeNull()
    expect(cardWidths(40).isSide).toBe(false)
    expect(cardWidths(160).isSide).toBe(true)
    expect(tracker(2, 160).map(s => s.text).join('')).toBe('✓ Your prompt ── ✓ Questions ── ● Rewrite ── ○ Review')
    expect(tracker(2, 30).map(s => s.text).join('')).toBe('✓ ✓ ● ○  Rewrite')
  })
})

describe('history and restore', () => {
  test('newest first, one per id, twenty at most', () => {
    let list = readHistory(undefined)
    for (let i = 0; i < 25; i++) list = addEntry(list, { id: String(i), at: i, original: `p${i}`, upgraded: `u${i}`, added: [] })
    expect(list.length).toBe(20)
    expect(list[0]?.id).toBe('24')
    list = addEntry(list, { id: '10', at: 99, original: 'again', upgraded: 'u', added: [] })
    expect(list.filter(e => e.id === '10').length).toBe(1)
    expect(readHistory([{ id: 1 }, { id: 'a', at: 1, original: 'o', upgraded: 'u' }])).toEqual([{ id: 'a', at: 1, original: 'o', upgraded: 'u', added: [] }])
  })

  test('the original goes back without losing what was typed', () => {
    expect(restoreFill('', 'my prompt')).toEqual({ text: 'my prompt', mode: 'replace' })
    expect(restoreFill('my prompt', 'my prompt')).toBeNull()
    expect(restoreFill('new words', 'my prompt')).toEqual({ text: '\n\nmy prompt', mode: 'append' })
  })
})
