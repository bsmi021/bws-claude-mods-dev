// Assistant replies in the shapes Claude Code writes them, for the /explain parser. Not a test file.

const NL = String.fromCharCode(10)
const j = (...lines: string[]) => lines.join(NL)

// numbered, bold name, dash description, a closing question
export const NUMBERED_BOLD = j(
  'There are three reasonable ways to store the cache.',
  '',
  '1. **SQLite** — one file, no server, good enough for a single process.',
  '2. **Postgres** — the team already runs it; more setup for local dev.',
  '3. **Plain JSON files** — simplest, but no concurrent writes.',
  '',
  'Which would you like me to go with?',
)

// `### Option A:` headings with bullets under each, a recommendation and a yes/no question at the end
export const OPTION_HEADINGS = j(
  'I see two ways to fix the flaky test.',
  '',
  '### Option A: Fake the clock',
  '- Use `mock.clock` and advance it.',
  '- Fast and deterministic.',
  '',
  '### Option B: Raise the timeout',
  '- One-line change.',
  '- Hides the race instead of fixing it.',
  '',
  "I'd recommend **Option A**. Want me to go ahead?",
)

// bold numbered headlines with unindented bullets between them; no question mark at all
export const BOLD_HEADLINES = j(
  "Here's how I'd approach the auth migration:",
  '',
  '**1. Big bang**',
  '- Switch every service in one release.',
  '- Risky, but over in a day.',
  '',
  '**2. Strangler**',
  '- Route new endpoints through the new auth first.',
  '',
  '**3. Dual-write**',
  '- Both systems live for a sprint.',
  '',
  'Let me know which direction you prefer.',
)

// the question first, then lettered options
export const LETTERED = j(
  'Before I change the parser, one question: which format should win when both are present?',
  '',
  'a) The YAML front matter',
  'b) The inline `@tags`',
  'c) Whichever comes last in the file',
)

// numbered options with lettered sub-points nested under each
export const NESTED = j(
  'Two options:',
  '',
  '1. Keep the cache in memory',
  '   a. fastest',
  '   b. lost on reload',
  '2. Persist it with `$.store`',
  '   a. survives reloads',
  '   b. one write per change',
  '',
  'Which should I build?',
)

// `1)` markers after the question
export const PAREN = j('Which test runner should the kit use?', '', '1) bun test, which `claude plugin test` already wraps', '2) vitest')

// `**Option 1: ...**` paragraphs, no question
export const OPTION_PARAGRAPHS = j(
  '**Option 1: Rewrite the listing every turn.** Simple, but it breaks the cache.',
  '',
  '**Option 2: Add a context block.** Keeps the cache; the list only grows.',
  '',
  'I lean to option 2.',
)

// steps to run, not a choice: no question, no word about options
export const STEPS = j('Done. To run it:', '', '1. `npm install`', '2. `npm test`')

// one numbered item is not a choice
export const ONE_ITEM = j('Which file?', '', '1. `register.tsx`')

// a numbered list inside a code block is not read
export const IN_CODE = j('Which one?', '', '```', '1. not this', '2. nor this', '```')

// a numbered list of steps, then the real choice as letters
export const STEPS_THEN_CHOICE = j(
  'I checked the build:',
  '',
  '1. The types compile.',
  '2. Two tests fail on Windows paths.',
  '',
  'How should I fix the paths?',
  '',
  'A. Normalize them in the stub',
  'B. Normalize them in the module',
)

// an Explore fork's reply that ends on a next decision
export const EXPLORE_NEXT = j(
  'SQLite keeps everything in one file next to the plugin, so there is nothing to install or run.',
  'The main risk is two processes writing at once; WAL mode handles that for a single machine.',
  '',
  'Which driver should it use?',
  '',
  '1. better-sqlite3 (synchronous, the most used)',
  '2. node:sqlite (built in, still experimental)',
)

// an Explore fork's reply with no further decision
export const EXPLORE_LEAF = j(
  'Plain JSON files need no dependency at all. Writes must go through one queue, or two saves can interleave.',
  '',
  'Recommendation: fine for a prototype; move to SQLite before more than one process writes.',
)
