import { test, expect, describe } from 'claude-code/testing'
import { anchorRank, corpusText, outline, parseAnchorDocs, pickAnchors, pickExcerpts, splitSections, terms } from '../hooks/corpus'
import { isWorking, lastAnswer, sessionRunDir, sessionTask, skipReason, turnDigest, turnNumber, type Row } from '../hooks/turn'
import { checkPrompt, parseJudgement } from '../hooks/verdict'
import { addCheck, directionSummary, directionTab, nudgeText, parseChecks, projectKey, projectLine, sessionLine, statusText, trend, type Check, type View } from '../hooks/view'
import { parseTab } from '../hooks/kit/tab'

const GDD = `# Game Design

Intro text.

## Combat
Stamina drives every swing. The parry window is 200 ms.

\`\`\`
# not a heading inside a fence
\`\`\`

### Boss: Gatekeeper
Three phases.

## Exploration
Lanterns mark the safe rooms.
`

describe('the corpus', () => {
  test('anchor names for any project: specs, PRDs, requirements and design docs first, then architecture; ordinary docs are not anchors', async () => {
    for (const n of ['PRD.md', 'prd-v2.md', 'SPEC.md', 'spec-api.md', 'Specification.md', 'requirements.md', 'product-requirements.md', 'software-design.md', 'design-doc.md', 'DESIGN.md', 'VISION.md', 'GDD.md', 'gdd-v2.md', 'acme-gdd.md', 'Game-Design-Document.md'])
      expect(anchorRank(n)).toBe(0)
    for (const n of ['architecture.md', 'ARCHITECTURE-overview.md', 'technical-design.md', 'api-spec.md', 'billing-architecture.md', 'tech-spec.md']) expect(anchorRank(n)).toBe(1)
    for (const n of ['animation-pipeline.md', 'gdd.txt', 'designer-notes.md', 'README.md', 'CHANGELOG.md', 'inspection.md']) expect(anchorRank(n)).toBe(null)
  })

  test('anchors picked: the shallowest anchor-named files, strongest kind first, at most 3', async () => {
    expect(pickAnchors(['proposals/x/GDD-candidate.md', 'design/specs/SPEC-TRAVERSAL.md', 'GDD.md', 'animation-pipeline.md'])).toEqual(['GDD.md'])
    expect(pickAnchors(['architecture.md', 'PRD.md', 'guides/setup.md', 'api/api-spec.md'])).toEqual(['PRD.md', 'architecture.md'])
    expect(pickAnchors(['specs/auth-spec.md', 'specs/billing-spec.md', 'notes.md'])).toEqual(['specs/auth-spec.md', 'specs/billing-spec.md'])
    expect(pickAnchors(['a-spec.md', 'b-spec.md', 'c-spec.md', 'd-spec.md']).length).toBe(3)
    expect(pickAnchors(['notes.md'])).toEqual([])
    expect(parseAnchorDocs(' docs\\GDD.md ; docs/plan.md,, docs/GDD.md ')).toEqual(['docs/GDD.md', 'docs/plan.md'])
  })

  test('sections split on headings, not inside code fences; the outline keeps levels 1-3', async () => {
    const s = splitSections('docs/GDD.md', GDD)
    expect(s.map(x => x.heading)).toEqual(['Game Design', 'Combat', 'Boss: Gatekeeper', 'Exploration'])
    expect(s[1]?.text).toContain('# not a heading inside a fence')
    expect(outline(GDD)).toBe('- Game Design\n  - Combat\n    - Boss: Gatekeeper\n  - Exploration')
    expect(outline(GDD, 40)).toBe('- Game Design\n  - Combat\n  - Exploration')
  })

  test('terms split camelCase and paths and drop stop words', async () => {
    expect(terms('Edit Source/Combat/ParryWindow.cpp with the stamina value')).toEqual(['edit', 'source', 'combat', 'parry', 'window', 'stamina'])
  })

  test('excerpts: the sections sharing the turn words, rare words first, within the budget', async () => {
    const s = splitSections('docs/GDD.md', GDD)
    const picked = pickExcerpts(s, terms('tune the parry window and stamina'), 7000)
    expect(picked[0]?.heading).toBe('Combat')
    expect(picked.some(e => e.heading === 'Exploration')).toBe(false)
    expect(pickExcerpts(s, terms('stamina'), 30)).toEqual([])
    expect(pickExcerpts(s, [], 7000)).toEqual([])
    const big = Array.from({ length: 50 }, (_, i) => ({ path: 'docs/a.md', heading: `h${i}`, text: `stamina ${'x'.repeat(2000)}` }))
    const many = pickExcerpts(big, ['stamina'], 7000)
    expect(many.reduce((n, e) => n + e.text.length, 0) <= 7000).toBe(true)
    expect(many[0]?.text.endsWith('...')).toBe(true)
  })

  test('the corpus text names the docs and the design document, with its outline, then the excerpts', async () => {
    const t = corpusText({ docs: ['docs/GDD.md', 'docs/specs/combat.md'], anchors: ['docs/GDD.md'], outline: '- Game Design', excerpts: [{ path: 'docs/GDD.md', heading: 'Combat', text: 'Stamina', score: 1 }] })
    expect(t).toContain('Documents: docs/GDD.md, docs/specs/combat.md')
    expect(t).toContain('Anchor documents (the authority on what the project is): docs/GDD.md')
    expect(t).toContain('--- docs/GDD.md § Combat\nStamina')
    expect(corpusText({ docs: [], anchors: [], outline: '', excerpts: [] })).toBe('')
  })
})

const R = (role: string, text: string, toolUses: Row['toolUses'] = [], hasToolResults = false): Row => ({ role, text, toolUses, hasToolResults })
const ROWS: Row[] = [
  R('user', 'Build the parry system per the GDD. Plan in runs/2026-10-20-parry/PLAN.md'),
  R('assistant', '', [{ tool: 'Write', input: { file_path: 'C:/p/runs/2026-10-20-parry/PLAN.md' } }]),
  R('user', '', [], true),
  R('assistant', 'Plan written.'),
  R('user', '/direction'),
  R('user', 'also add a photo mode'),
  R('assistant', '', [
    { tool: 'Read', input: { file_path: 'C:\\p\\Source\\Combat.cpp' } },
    { tool: 'Edit', input: { file_path: 'C:\\p\\Source\\PhotoMode.cpp' } },
    { tool: 'Bash', input: { command: 'git status' } },
  ]),
  R('user', '', [], true),
  R('assistant', 'Photo mode added.'),
]

describe('the turn', () => {
  test('the task is the first typed prompt; later typed prompts are redirections; slash commands do not count', async () => {
    expect(sessionTask(ROWS)).toEqual({ first: 'Build the parry system per the GDD. Plan in runs/2026-10-20-parry/PLAN.md', recent: ['also add a photo mode'] })
    expect(turnNumber(ROWS)).toBe(2)
  })

  test('the digest covers the turn since the last typed prompt', async () => {
    const d = turnDigest(ROWS, 'Photo mode added.')
    expect(d.prompt).toBe('also add a photo mode')
    expect(d.toolCalls).toBe(3)
    expect(d.files).toEqual(['C:/p/Source/PhotoMode.cpp'])
    expect(d.actions).toEqual(['Read C:/p/Source/Combat.cpp', 'Edit C:/p/Source/PhotoMode.cpp', 'Bash git status'])
    expect(isWorking(d)).toBe(true)
    expect(isWorking(turnDigest([R('user', 'hi'), R('assistant', 'hello')], 'hello'))).toBe(false)
    expect(lastAnswer(ROWS)).toBe('Photo mode added.')
  })

  test('the run folder is the last one any tool call named', async () => {
    expect(sessionRunDir(ROWS)).toBe('2026-10-20-parry')
    expect(sessionRunDir([R('user', 'runs/2026-01-01-x')])).toBe(null)
  })

  test('the gate: auto off, subagent, not answered, not working, running, every Nth', async () => {
    const g = { isAuto: true, reason: 'answer', isRunning: false, isWorking: true, every: 1, working: 1 }
    expect(skipReason(g)).toBe(null)
    expect(skipReason({ ...g, isAuto: false })).toBe('autoCheck is off')
    expect(skipReason({ ...g, agentId: 'a1' })).toBe('a subagent turn')
    expect(skipReason({ ...g, reason: 'aborted' })).toBe('the turn ended: aborted')
    expect(skipReason({ ...g, isWorking: false })).toBe('not a working turn')
    expect(skipReason({ ...g, isRunning: true })).toBe('a check is already running')
    expect(skipReason({ ...g, every: 3, working: 2 })).toBe('every 3 working turns')
    expect(skipReason({ ...g, every: 3, working: 3 })).toBe(null)
  })
})

describe('the verdict', () => {
  test('a fenced JSON answer is read; scores clamp; aligned clears cause and suggestion', async () => {
    const j = parseJudgement('```json\n{"verdict":"Off course","score":140,"reason":"Photo mode is not in the plan.","anchor":"runs/x/PLAN.md","cause":"user","suggestion":"Park it."}\n```')
    expect(j).toEqual({ verdict: 'off-course', score: 100, reason: 'Photo mode is not in the plan.', anchor: 'runs/x/PLAN.md', cause: 'user', suggestion: 'Park it.' })
    expect(parseJudgement('{"verdict":"aligned","cause":"agent","suggestion":"x"}')).toEqual({ verdict: 'aligned', score: 90, reason: '', anchor: '', cause: 'none', suggestion: '' })
    expect(parseJudgement('{"verdict":"drifting","score":"40"}')?.score).toBe(40)
  })

  test('malformed answers are null', async () => {
    expect(parseJudgement(undefined)).toBe(null)
    expect(parseJudgement('looks fine to me')).toBe(null)
    expect(parseJudgement('{"verdict": "great"}')).toBe(null)
    expect(parseJudgement('{verdict: aligned}')).toBe(null)
    expect(parseJudgement('[1,2]')).toBe(null)
  })

  test('the check prompt carries the task, later prompts, plan, documents and the turn', async () => {
    const p = checkPrompt({ task: { first: 'Build parry', recent: ['add photo mode'] }, plan: '- [ ] parry', planPath: 'runs/x/PLAN.md', corpus: 'Documents: docs/GDD.md', turn: 'Files edited: a.cpp' })
    expect(p).toContain('<task>\nBuild parry\n</task>')
    expect(p).toContain('- add photo mode')
    expect(p).toContain('<plan path="runs/x/PLAN.md">')
    expect(p).toContain('Documents: docs/GDD.md')
    expect(checkPrompt({ task: { first: '', recent: [] }, plan: '', planPath: '', corpus: '', turn: 't' })).toContain('(no docs/ folder found)')
  })
})

const NOW = new Date(2026, 9, 20, 12, 0).getTime()
const DAY = 86_400_000
const mk = (verdict: Check['verdict'], score: number, o: Partial<Check> = {}): Check => ({
  verdict,
  score,
  reason: `${verdict} reason`,
  anchor: 'docs/GDD.md § Combat',
  cause: verdict === 'aligned' ? 'none' : 'agent',
  suggestion: verdict === 'aligned' ? '' : 'Go back.',
  at: NOW,
  session: 's1',
  scope: 'turn',
  turn: 3,
  files: ['a.cpp'],
  ...o,
})
const V = (log: Check[], o: Partial<View> = {}): View => ({ log, session: 's1', now: NOW, phase: 'idle', note: '', isAuto: true, anchors: 'docs/GDD.md · 12 docs', counts: { raise: 0, show: 0 }, ...o })

describe('the record and the view', () => {
  test('the stored record drops malformed entries and keeps the newest MAX', async () => {
    expect(parseChecks([mk('aligned', 90), { verdict: 'nope' }, 3, null]).length).toBe(1)
    expect(parseChecks('x')).toEqual([])
    let log: Check[] = []
    for (let i = 0; i < 5; i++) log = addCheck(log, mk('aligned', i), 3)
    expect(log.map(c => c.score)).toEqual([2, 3, 4])
    expect(projectKey('C:\\Projects\\Foo\\')).toBe(projectKey('c:/projects/foo'))
  })

  test('trend: glyphs, counts and a worsening direction', async () => {
    const t = trend([mk('aligned', 95), mk('aligned', 90), mk('drifting', 50), mk('off-course', 20)])
    expect(t.glyphs).toBe('✓✓~✗')
    expect([t.aligned, t.drifting, t.offCourse, t.avg, t.direction]).toEqual([2, 1, 1, 64, 'down'])
  })

  test('session and project lines: this session only vs every session, with the week against the week before', async () => {
    const log = [mk('aligned', 80, { session: 's0', at: NOW - 10 * DAY }), mk('aligned', 90), mk('drifting', 50)]
    expect(sessionLine(log, 's1')).toBe('This session: ✓~  2 checks, average 70, → steady')
    expect(sessionLine([], 's1')).toBe('This session: no checks yet.')
    expect(projectLine(log, NOW)).toBe('Project: 3 checks over 2 sessions, 67% aligned, average 73; last 7 days 70 (week before 80); 1 session drifted.')
  })

  test('the tab: a drift card, Tell Claude first, a badge and tone; it survives parseTab', async () => {
    const tab = directionTab(V([mk('aligned', 90), mk('drifting', 50)], { counts: { raise: 2, show: 1 } }))
    const parsed = parseTab(JSON.parse(JSON.stringify(tab)))
    expect(parsed).not.toBe(null)
    expect(parsed?.title).toBe('Direction')
    expect(parsed?.badge).toBe('~ 50')
    expect(parsed?.tone).toBe('warn')
    expect(parsed?.raise).toBe(2)
    const btns = parsed?.body.find(n => n.kind === 'buttons')
    expect(btns?.kind === 'buttons' ? btns.items.map(b => b.id) : []).toEqual(['tell', 'check', 'overall', 'pause'])
    const card = parsed?.body.find(n => n.kind === 'card')
    expect(card?.kind === 'card' ? card.title : '').toContain('Last turn · turn 3')
  })

  test('the tab while checking, with no checks, and paused', async () => {
    const t = directionTab(V([], { phase: 'checking', isAuto: false }))
    expect(t.tone).toBe('busy')
    const lines = t.body.flatMap(n => (n.kind === 'text' ? [n.text] : n.kind === 'buttons' ? n.items.map(b => b.id) : []))
    expect(lines).toContain('Checking the last turn...')
    expect(lines).toContain('resume')
    expect(lines.includes('tell')).toBe(false)
  })

  test('summary chip, status text and the note Claude gets', async () => {
    expect(directionSummary(V([]))).toBe(null)
    expect(directionSummary(V([mk('aligned', 92)]))).toEqual({ state: 'ok', label: 'on course 92' })
    expect(directionSummary(V([mk('off-course', 10)]))?.state).toBe('bad')
    const s = statusText(V([mk('drifting', 50), mk('aligned', 70, { scope: 'overall' })]))
    expect(s).toContain('Anchors: docs/GDD.md · 12 docs')
    expect(s).toContain('Drifting (50) · agent tangent')
    expect(s).toContain('Whole project')
    expect(nudgeText(mk('drifting', 50))).toContain('say in one line why this work is in scope')
    expect(nudgeText(mk('drifting', 50, { cause: 'user' }))).toContain('offer to park it as a follow-up')
  })
})
