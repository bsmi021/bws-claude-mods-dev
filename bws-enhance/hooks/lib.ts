// Pure helpers for bws-enhance: context assembly, the enhancer's instructions, reply cleanup. No `$` here.

export type Doc = { path: string; text: string }
export type Command = { name: string; description: string; source: string }
export type Message = { role: string; text: string }

export const PER_FILE = 6000
export const ALL_FILES = 20000
export const ALL_COMMANDS = 12000
export const LAST_MESSAGES = 6
export const PER_MESSAGE = 600
export const TREE_DEPTH = 2
export const TREE_ENTRIES = 150

// Folders that are history, dependencies, build output or engine caches: noise in a project map.
const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'runs', 'dist', 'build', 'out', 'bin', 'obj', 'target', 'coverage', '.next', '.venv', 'venv',
  '__pycache__', '.cache', '.codegraph', '.vs', '.idea', 'Library', 'Temp', 'Logs', 'Intermediate', 'Saved',
  'DerivedDataCache', 'Binaries',
])

export type TreeEntry = { name: string; kind: string }

// One directory's entries for the tree: skipped folders out, folders first, then by name.
export function treeEntries(entries: readonly TreeEntry[], rel: string): TreeEntry[] {
  return entries
    .filter(e => e.kind === 'file' || (e.kind === 'dir' && !SKIP_DIRS.has(e.name) && !rel.endsWith('.claude-plugin')))
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1))
}

export function treeLine(e: TreeEntry, depth: number): string {
  return `${'  '.repeat(depth)}${e.name}${e.kind === 'dir' ? '/' : ''}`
}

export function clip(s: string, n: number): string {
  const t = s.trim()
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`
}

const norm = (p: string) => p.replace(/\\/g, '/')

// The instruction files the session loaded, then the project's own in case the breakdown missed them (AGENTS.md rides on a plugin).
export function instructionPaths(loaded: readonly string[], root: string): string[] {
  const r = norm(root).replace(/\/$/, '')
  const want = [...loaded.map(norm), `${r}/CLAUDE.md`, `${r}/AGENTS.md`, `${r}/.claude/CLAUDE.md`]
  const seen = new Set<string>()
  return want.filter(p => {
    const k = p.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export function instructionsText(docs: readonly Doc[], perFile = PER_FILE, all = ALL_FILES): string {
  let left = all
  const parts: string[] = []
  for (const d of docs) {
    if (left <= 200 || d.text.trim() === '') continue
    const body = clip(d.text, Math.min(perFile, left))
    left -= body.length
    parts.push(`<file path="${d.path}">\n${body}\n</file>`)
  }
  return parts.length ? parts.join('\n\n') : '(none found)'
}

// Skills and slash commands the person has, one line each, plugin and user ones first; built-ins last.
export function commandsText(commands: readonly Command[], self: string, all = ALL_COMMANDS): string {
  const rank = (c: Command) => (c.source === 'builtin' ? 1 : 0)
  const lines: string[] = []
  let left = all
  for (const c of [...commands].sort((a, b) => rank(a) - rank(b))) {
    if (c.name === self) continue
    const line = `/${c.name} — ${clip(c.description.replace(/\s+/g, ' '), 140)}`
    if (line.length > left) break
    left -= line.length + 1
    lines.push(line)
  }
  return lines.length ? lines.join('\n') : '(none)'
}

export function mcpServers(toolNames: readonly string[]): string[] {
  const out = new Set<string>()
  for (const n of toolNames) {
    const m = /^mcp__(.+?)__/.exec(n)
    if (m?.[1]) out.add(m[1])
  }
  return [...out].sort()
}

export function conversationText(messages: readonly Message[], n = LAST_MESSAGES, per = PER_MESSAGE): string {
  const said = messages.filter(m => (m.role === 'user' || m.role === 'assistant') && m.text.trim() !== '')
  if (said.length === 0) return '(new session, nothing said yet)'
  return said
    .slice(-n)
    .map(m => `${m.role}: ${clip(m.text.replace(/\s+/g, ' '), per)}`)
    .join('\n')
}

// Rules from Anthropic's prompting best practices (platform.claude.com prompt-engineering pages, code.claude.com/docs/en/best-practices).
// Outcome-first: the rewrite states the goal and how to tell it is met, and leaves the way there to the running model.
export const SYSTEM = `You rewrite a developer's rough request into a goal-and-outcome prompt for Claude Code: it says what to achieve and how to tell it is achieved, and leaves the way there to Claude.

Claude Code is a capable agentic coding assistant working in the developer's project. It reads the code, plans and chooses its own approach well. A prompt that dictates the steps narrows it and is often wrong about details only the code reveals; a clear goal with a clear finish line gets better work. You are given the project's instruction files, the skills and slash commands installed, the connected MCP servers, the project root, the recent conversation and the model that will run the prompt. Use them to make the goal and the finish line precise, not to plan the work.

Rules:
- Keep the developer's intent exactly. Do not add features or scope they did not ask for.
- Write in the developer's voice, as an instruction to Claude ("Make…", "Fix…", "Find out why…").
- Lead with the outcome: what should be true when the work is done. Add why it matters in a few words when that is not obvious, so Claude can make good calls on its own.
- Say what done looks like in observable terms, and include a check Claude can run to confirm it (tests, a build, a command, a screenshot), taken from the project's instructions when they name one.
- Leave the method to Claude. Do not list implementation steps, prescribe an algorithm or design, or name files and functions to change, unless the developer did or a project rule requires it. Where it helps, point to where to look (an area, a symptom, an existing pattern to match) rather than what to change.
- Include a constraint only when it bounds the outcome: behaviour that must keep working, things not to touch, project rules that apply (conventions, required checks, where work goes). Cite them briefly; do not restate whole files.
- Resolve vague references ("it", "that bug") from the recent conversation when it makes them clear.
- Name a skill, slash command, subagent or MCP server only when it clearly fits, phrased as "use X to…" or "use X when…", never "always use X".
- Never invent file paths, symbols, APIs or facts. If something is unknown, leave it to Claude to find out; state an assumption only when the outcome depends on it.
- For a large or unclear goal, tell Claude to plan first (or interview the developer) before changing code. For a fix that fits in one sentence, go straight to it.
- Fix root causes; do not suppress errors or hard-code values to make tests pass.
- Calm, plain wording: no ALL-CAPS, no "CRITICAL" or "MUST" emphasis.
- Wrap any pasted logs, errors or text from the rough request in XML tags (e.g. <error>…</error>) so they read as data.
- Structure: one opening sentence with the goal; then short sections only as needed: Context, Constraints, Done when. No Steps section. Skip a section that would be empty.
- Shorter beats more thorough. Usually 40–150 words; a one-line request about a trivial change stays one or two lines. Leave out anything Claude would find or decide well on its own.
- Output only the rewritten prompt: no preamble, no explanation, no code fences around it, no quotes.`

// Per-family notes for the model that will RUN the prompt, from Anthropic's per-model prompting pages.
export function targetNotes(model: string): string {
  const m = model.toLowerCase()
  if (m.includes('opus'))
    return 'Opus follows the prompt closely and tends to over-engineer: state the minimal scope explicitly ("only make the changes asked; no new abstractions or extra files").'
  if (m.includes('sonnet'))
    return 'Sonnet may stop early to check in, and adds unrequested tests or docs: include "keep working until the Done-when checks pass, then stop and report" and say not to add tests or docs beyond what is asked unless the project requires them.'
  if (m.includes('haiku'))
    return 'Haiku may report work done without running a check: say plainly to run the named check and show its result before reporting done, and to keep working until everything asked is done.'
  return 'No model-specific notes.'
}

export type Parts = {
  rough: string
  target: string
  root: string
  tree: string
  instructions: string
  commands: string
  servers: readonly string[]
  conversation: string
}

export function userPrompt(p: Parts): string {
  return [
    `<project_root>${p.root}</project_root>`,
    `<project_tree depth="${TREE_DEPTH}">\n${p.tree}\n</project_tree>`,
    `<target_model name="${p.target}">${targetNotes(p.target)}</target_model>`,
    `<instruction_files>\n${p.instructions}\n</instruction_files>`,
    `<skills_and_commands>\n${p.commands}\n</skills_and_commands>`,
    `<mcp_servers>${p.servers.length ? p.servers.join(', ') : '(none)'}</mcp_servers>`,
    `<recent_conversation>\n${p.conversation}\n</recent_conversation>`,
    `<rough_request>\n${p.rough}\n</rough_request>`,
    'Rewrite <rough_request> as the prompt Claude Code should receive. Output only that prompt.',
  ].join('\n\n')
}

// Strips a wrapping code fence, quotes or a "Here is…" lead-in the model added anyway.
export function cleanReply(text: string): string {
  let t = text.trim()
  const fence = /^```[\w-]*\n([\s\S]*?)\n```$/.exec(t)
  if (fence?.[1] !== undefined) t = fence[1].trim()
  t = t.replace(/^(here(?:'s| is) (?:the |an |your )?(?:rewritten|enhanced|refined|improved)? ?prompt[^\n]*:)\s*\n/i, '').trim()
  if (t.length > 1 && /^["“]/.test(t) && /["”]$/.test(t)) t = t.slice(1, -1).trim()
  return t
}
