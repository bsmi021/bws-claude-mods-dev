# Spec: mods from the "Top 1% Claude Code Mods" video

Source: Ray Amjad, "How the Top 1% Use Claude Code Mods (Agentic Engineering)", 2026-10-12 (digest and analysis:
`runs/2026-10-12-mod-ideas-video/RUNLOG.md`). Project rules: `AGENTS.md` (read it first; it wins over this file on
how mods are built and checked).

The video's one pattern: when a turn finishes, a cheap classifier (Haiku) decides whether anything is worth doing.
If yes, `$.model.fork` (same prompt cache) does the work off to the side while the main session keeps going, and a
pane or chip shows the result. Most mods below are that pattern with a different payload.

## Conventions every unit follows

| ID | Rule | Evidence |
|---|---|---|
| FR-ALL-01 | `$` is used only in the plugin's `hooks/register.tsx`. Logic lives in pure `.ts` modules with tests. Literal event names, direct `$.namespace.method(...)` calls, no aliasing. One unmatched hook per event per plugin: merge into the existing one. | `claude plugin validate` hook inventory lists every intended hook |
| FR-ALL-02 | Every new or changed behaviour has focused `.test.ts` tests (`claude-code/testing`): the normal path, the failure branch, and "does not intercept unrelated events". | `claude plugin test` count rises; named tests in HANDOFF.md |
| FR-ALL-03 | A classifier or fork failure never blocks the session: fail open (the turn, prompt or tool call proceeds unchanged) and write one line to the debug log. | A test per failure branch |
| FR-ALL-04 | Each mod has a README: purpose, load command, options, capabilities used, Claude Code version and surfaces actually tested. Untested surfaces are stated as untested. | README present; no claim without a receipt |
| FR-ALL-05 | Each mod publishes one `summary` state atom (`{ plugin, key: 'summary' }`) so bws-cockpit's bar and bws-board can show it. Shape defined by M0 (`bws-kit/summary.ts`). | Test asserts the atom shape |
| FR-ALL-06 | Models: classifiers use the engine's small model (`haiku` alias) via `$.model.classify` or `$.model.complete`; writers use `$.model.fork`. Every call has a timeout and an `AbortSignal`. Options let the user change the model. | Options table in the README |
| FR-ALL-07 | Never read or write the user's `~/.claude/settings.json`, `CLAUDE_CODE_PLUGIN_DIRS`, other plugins' state files, or push or publish anything. Live probes use `claude -p ... --plugin-dir ./<plugin>` with `CLAUDE_CODE_PLUGIN_DIRS` set empty. Never log secrets or prompts. | Receipts show the probe command |
| FR-ALL-08 | Existing plugins change only additively: reuse their helpers, keep behaviour backward compatible, never delete or weaken an existing test. A change that alters existing behaviour becomes a Needs item (question) for the user, not a decision. | `git diff` of existing tests shows additions only |
| FR-ALL-09 | The gate is `python tools/mods-gate.py` (validate + plugin test + tsc strict for every plugin folder, plus the kit sync check once M0 exists). It must pass for ALL plugins, not only the unit's. | `receipts/<unit>.json` |

## M0: suite kit (bws-kit)

Reusable pieces extracted from the proven mods, vendored into each new plugin (mods cannot import across plugins).

| ID | Requirement | Acceptance evidence |
|---|---|---|
| FR-KIT-01 | `bws-kit/` (a folder, not a plugin) with pure modules and tests: `classify-fork.ts` (the classify-then-fork decision: gate input, yes/no parse, result shape, abort and timeout handling, resumed-session fallback of `$.session.messages()` + `$.model.complete` when `$.model.fork` gives `nothing-to-fork`), `summary.ts` (the summary atom shape), `transcript.ts` and `runfolder.ts` (moved from cockpit `handoff.ts` by copy, cockpit keeps its own), `raster.ts` (the half-block Raster and Svg drawing helpers from `bws-design-picker/hooks/lib.ts`, copied, design-picker untouched). | `bws-kit` tests pass |
| FR-KIT-02 | `tools/sync-kit.py`: copies the kit modules a plugin lists in its `kit.json` into `<plugin>/hooks/kit/` with a "vendored from bws-kit, do not edit" header. `--check` exits non-zero when any copy differs from the kit. `tools/mods-gate.py` runs it when present. | A test (or script run) tampers a copy and `--check` fails |
| FR-KIT-03 | bws-cockpit reads the summary atoms of a configured list of mod plugins (default: `bws-memory`, `bws-diagram`, `bws-skillgate`, `bws-secrets`) and draws one chip per loaded, non-idle mod in its action bar, following how it already reads bws-board's summary. Absent plugins draw nothing and cause no error. | cockpit dashboard tests, with a stubbed atom |
| AC-KIT-01 | Gate passes for all plugins with the kit in place; cockpit's existing 162 tests are unchanged and green. | gate receipt |

## M1: cache clock (bws-cockpit)

Video: shows how much prompt cache is left (main thread about 1 h, sub-agents about 5 min), and writes a handoff when under 5 min remain, so a session you come back to hours later can be reloaded from the handoff instead of re-billed.

| ID | Requirement | Acceptance evidence |
|---|---|---|
| FR-CC-01 | Pure `cacheclock.ts`: from the time of the main thread's last model request and a TTL, the remaining time and a state (`fresh`, `low` under the threshold, `expired`). TTL option `cacheTtlMinutes` default 60. Which timestamp the engine exposes for "last request" is decided from the generated types; if none, use the time of the last `turn.complete`. | table-driven tests |
| FR-CC-02 | A chip in cockpit's action bar: `cache 42m`, warning style under `cacheLowMinutes` (default 5), `cache cold` after expiry. It refreshes about once a minute through a timer (no re-render storm), and is hidden before the first response and after `/clear`. | render tests on terminal and desktop |
| FR-CC-03 | Auto handoff: when remaining time first drops under the threshold and the session is idle and has at least one turn since the last handoff, write the handoff through cockpit's existing handoff pipeline (`handoff.ts`), once per cache window. Option `autoHandoff` default true. Never while a turn is running. | tests: fires once, not while busy, not when no new turns, off when disabled |
| FR-CC-04 | `/cacheclock [status]` prints remaining time, TTL, state, and when the last auto handoff was written. Headless prints text. | command test |
| FR-CC-05 | cockpit README documents the feature and options; cockpit version bumped (minor). | README diff |
| AC-CC-01 | `claude -p` probe with `--plugin-dir ./bws-cockpit` runs `/cacheclock status` and saves its stream-json output. | `receipts/m1-probe.json` |

## M2: prompt bouncer (bws-enhance mode)

Video: a Haiku gate on prompt submit decides whether the prompt is clear enough; vague ones ("fix the thing on the settings page") are bounced with what is missing; a project glossary makes the hint specific ("this project calls it the billing page").

| ID | Requirement | Acceptance evidence |
|---|---|---|
| FR-PB-01 | Option `bounce` in bws-enhance: `off` (default), `warn` (show the reason, send anyway after one more Enter), `block` (do not send; the draft stays in the box). Command `/bounce [off/warn/block/status]`. | command and option tests |
| FR-PB-02 | A `prompt.submit` hook (merged with bws-enhance's existing one, if any) classifies the prompt `clear` or `vague` with the small model. It skips: slash commands, prompts under 4 words that answer a question (yes, no, continue, ok, a number), prompts with a pasted-content block or attachment, headless runs, and any prompt sent from the bouncer's own "send anyway". | tests per skip |
| FR-PB-03 | On `vague`: one short reason (what is missing, in one sentence, at most 40 words) from a second small-model call that also receives the glossary. The reason shows in bws-enhance's pane/toast with buttons Send anyway, Enhance (reuse bws-enhance's existing enhance pipeline), Edit. | render test; the Enhance button calls the existing pipeline |
| FR-PB-04 | Glossary: option `glossaryFile` (default: look for `docs/GLOSSARY.md`, then a `## Glossary` section of `AGENTS.md` or `CLAUDE.md`). Capped at 4,000 characters. Without one, the classifier runs with no glossary. | tests: found, missing, capped |
| FR-PB-05 | Fails open (FR-ALL-03): classifier error or a 4 s timeout sends the prompt unchanged. Costs: at most two small-model calls per prompt; none when `off`. | tests for timeout and error |
| FR-PB-06 | bws-enhance README documents the mode; version bumped (minor). | README diff |
| AC-PB-01 | `claude -p` probe: a vague prompt under `block` is refused with the reason; a clear one passes. | `receipts/m2-probe.json` |

## M3: skill gating (bws-skillgate, new plugin)

Video: with many skills installed, their names and descriptions sit in context all the time (about 10,000 tokens). A classifier ranks which skills fit the prompt being typed and only those are loaded; `/jev stair` or always-on; shows the ranked picks; option "top N only".

| ID | Requirement | Acceptance evidence |
|---|---|---|
| FR-SG-01 | **Spike first** (DECISIONS.md): confirm from the generated types and a live probe whether rewriting the `skill_listing` attachment (`prompt.attachment`, type `skill_listing`, rewritable text) can show a different subset per prompt, when the engine fires that attachment (every turn or only on change), and what it does to the prompt cache. Record the mechanism chosen and what was ruled out. | DECISIONS.md with probe receipts |
| FR-SG-02 | Modes `off` (default), `on`: when a prompt is submitted, one small-model call receives the user's prompt and the skill names with descriptions and returns up to `topK` (default 5) skill names as JSON; the listing the model sees is cut to those skills plus any the user named with `/name` in the prompt. Command `/skillgate [off/on/status/explain]`. No logprobs exist: the ranking is the model's ordered answer. | tests for parse, cut, explicit `/name` kept |
| FR-SG-03 | Cache safety: identical prompt + skills gives byte-identical listing text; the listing is not changed on turns where it need not be (per the spike). A test shows the unchanged-listing path returns `next(e)` untouched. | tests |
| FR-SG-04 | Fail open: a classifier error, a timeout (4 s) or an unparsable answer leaves the full listing. | tests |
| FR-SG-05 | `/skillgate explain` and the summary atom show the last picks and the tokens the cut saved (estimate: characters / 4). | tests |
| FR-SG-06 | README, version, `kit.json`, kit sync passes. | gate |
| AC-SG-01 | `claude -p` probe with `--plugin-dir ./bws-skillgate`: the model's reported available skills match the cut for a fixed prompt. | `receipts/m3-probe.json` |

## M4: memory (bws-memory, new plugin)

Video: after each turn a classifier asks "did the user say something worth remembering?"; if yes a fork writes or updates memory files in the background; the pane shows "memory updating", then the changed files and line counts; closable; the main session never does this work itself.

| ID | Requirement | Acceptance evidence |
|---|---|---|
| FR-MEM-01 | On `turn.complete` (merged), classify the last exchange `remember` or `none` with the small model through the kit's classify-then-fork helper. Skip when the turn was under `minWords` (default 8) with no tools, in headless runs, and while a previous memory fork is still running. | tests per skip |
| FR-MEM-02 | On `remember`: `$.model.fork` is asked for memory entries as JSON (file name, frontmatter name/description/type, body), de-duplicated against the existing files' names and descriptions. The mod writes the files (a tool-less fork cannot), as `<memoryDir>/<slug>.md` with this repo's memory frontmatter format, and one line per file in `MEMORY.md`. Option `memoryDir` default `<cwd>/.claude/bws-memory` (a mod-owned folder, so it never collides with the built-in memory). An entry that matches an existing file updates it; it never duplicates. | tests with a stubbed fork: new file, update, duplicate refused |
| FR-MEM-03 | Redaction: any key, token or password-shaped string is replaced with `[redacted]` before writing; a fork reply that is mostly secrets is dropped. | tests |
| FR-MEM-04 | UI: while working, a chip `memory updating`; when done a closable pane lists the files changed and the lines added and removed. Pane open/close follows the repo's pane rules (unmount before mounting again). | render tests |
| FR-MEM-05 | `/remember <text>` forces an entry (no classifier); `/memories` lists the last 20 writes with the session each came from (a `sources.json` beside the files); `/memory-undo` restores the previous version of the last written files from a one-deep backup. | command tests |
| FR-MEM-06 |A -- label --> Behaviour after `/clear`, `/resume`, `/branch` is defined and tested: no work starts on `/clear`; the running-fork guard resets. | tests |
| FR-MEM-07 | README, summary atom, `kit.json`, sync passes. | gate |
| AC-MEM-01 | `claude -p` probe: "remember that X" writes a file under a temp `memoryDir`; the receipt shows the file. | `receipts/m4-probe.json` |

## M5: diagram pane (bws-diagram, new plugin)

Video: after a big task a fork draws what happened (steps, files, new components, decisions) in a side pane with a small legend: file = square rectangle, new component = rounded rectangle, step = double rectangle. Inline mermaid diagrams that Claude writes are pinned in the pane ("Pinned diagrams") instead of being left as unrenderable text.

| ID | Requirement | Acceptance evidence |
|---|---|---|
| FR-DG-01 | **Spike first** (DECISIONS.md): what can be drawn in the terminal (Raster half-block, `Svg` on Desktop) within the engine's pane limits (see AGENTS.md: row limit, no `width` on boxes around dialogs, ASCII-only Raster text), the node and edge budget that stays legible, and whether the pane docks right of the transcript. Record screenshots. | DECISIONS.md and screenshots |
| FR-DG-02 | A diagram spec (pure, validated): nodes `{id,A -- label --> B,kind: file/new/step/decision}`, edges `{from,to,label?}`, max 24 nodes. A layered layout (left to right by dependency) in pure code. Drawn to Raster or Svg with the kit's `raster.ts`. | layout and validation tests |
| FR-DG-03 | After a turn, classify `big` (the small model, given counts of tool calls, files edited, and turn length) or skip; on `big` fork once for the spec, validate it, show it. Option `autoDiagram` default true; `/diagram` forces one for the whole session; fail open. | tests |
| FR-DG-04 | Pinned diagrams: a fenced mermaid block in an assistant reply (flowchart / graph LR or TD with plain `A --> B` edges and labelled edges written `A -- label --> B`) is parsed to a spec and listed under "Pinned diagrams"; an unsupported type is shown as its source text. | parser tests, unsupported fallback test |
| FR-DG-05 | Pane: legend, previous/next diagram, resize-safe, closable. State survives reload; behaviour after `/clear`, `/resume`, `/branch` defined and tested. | render tests |
| FR-DG-06 | README, summary atom, `kit.json`, sync passes. | gate |
| AC-DG-01 | `claude -p` probe: a reply containing a mermaid block produces a pinned spec (via a state dump or `/diagram status`). | `receipts/m5-probe.json` |

## M6: DreamPath (extends bws-memory)

Video: a "dreaming" consolidation of the memory (from Cognition's write-up): every 20 turns, before compaction, or on `/dream`, merge duplicates, drop stale or contradicted entries, rewrite for clarity; each memory keeps a source (the session it was learned in) so it can be re-resolved later; the result lists files removed, merged and rewritten.

| ID | Requirement | Acceptance evidence |
|---|---|---|
| FR-DP-01 | `/dream` reads all memory files and `sources.json`, asks `$.model.fork` (or `$.model.complete` when fork is unavailable) for a plan: `merge`, `remove`, `rewrite` actions with reasons. Pure validation rejects a plan that deletes more than 40% of the files or references unknown files. | plan-validation tests |
| FR-DP-02 | Preview first: the pane shows the plan; Apply or Dismiss. Apply writes the changes, after copying the folder to `<memoryDir>/.dream-backup/<timestamp>/`. `/dream undo` restores the latest backup. | tests with backups |
| FR-DP-03 | Automatic trigger: every `dreamEveryTurns` (default 20) turns, and before a compaction if the types expose an event for it (otherwise noted in DECISIONS.md); automatic runs only preview (open the pane), never apply on their own. | trigger tests |
| FR-DP-04 | Sources: each memory file lists the sessions it came from; merging unions them; the pane shows them. | tests |
| FR-DP-05 | bws-memory README and version updated; summary atom shows `dream due` when the trigger fired. | README diff |
| AC-DP-01 | `claude -p` probe: `/dream` on a fixture folder with two near-duplicate files proposes a merge and applies it with `--apply`-style option or a test hook. | `receipts/m6-probe.json` |

## M7: decision tree (extends bws-sidechat)

Video: when Claude lists options, a side pane shows a tree. Each option has Explore: it forks the session in the background and answers follow-up questions (which driver? ...). You can go back to a previous question and take another branch; a map button shows the whole tree; when you decide, the decision is sent into the main session.

| ID | Requirement | Acceptance evidence |
|---|---|---|
| FR-DT-01 | Pure `tree.ts`: nodes (question, options, chosen option, answer text, fork session id), edges, add / go back / branch from an earlier node, depth and node caps (30 nodes), a text rendering of the map. | tree tests |
| FR-DT-02 | `/explain` (new command, does not clash with the built-in) parses the last assistant reply's numbered or lettered options (parser tested on real reply samples) and opens the tree pane at the root. Reuses bws-sidechat's existing fork child process (`side.ts`); at most 2 concurrent forks. | parser tests; fork reuse test |
| FR-DT-03 | Explore on an option forks a side chat with the prompt to answer follow-up questions about that option and ask the next decision question if there is one; the reply parses into the next node (options again, or a free answer). A free-text answer is accepted. | tests with a stubbed child |
| FR-DT-04 | Navigation: back to an earlier question and pick another option (branches kept); a Map view of the whole tree; Close. Keys and buttons follow bws-sidechat's pane (focus rules, scrolling). | render tests |
| FR-DT-05 | Decide: sends a one-paragraph decision summary into the main session. Per AGENTS.md, `$.prompt.submit` inside a `command.run` hook deadlocks, so it is deferred with `$.clock.after`. | test asserts the deferral |
| FR-DT-06 | bws-sidechat README and version updated (minor); existing 58 tests untouched. | gate |
| AC-DT-01 | Probe: `/explain` over a fixture reply with three options opens the root node with three options (state dump). | `receipts/m7-probe.json` |

## M8: secret box (bws-secrets, new plugin)

Video: a tool `request_secret` that Claude calls when it needs a secret; a pane lets the user type it; it is saved to disk in an env folder that Claude is blocked from reading; Claude only ever sees a redacted placeholder, and requests made with the placeholder get the real value at execution time, so it never reaches the transcript or Anthropic's servers.

| ID | Requirement | Acceptance evidence |
|---|---|---|
| FR-SB-01 | **Spike first** (DECISIONS.md, with a threat note): can a `tool.call` rewrite put the real value into aA -- label --> Bash command's environment without it appearing in the transcript, the tool input log or the tool result? Can a `tool.result` rewrite redact an echoed value? What the engine records of the original versus the rewritten input. If the real value cannot be kept out of the transcript, STOP and raise a blocker (Needs item) instead of building a leaky version. | DECISIONS.md and a probe receipt |
| FR-SB-02 | Tool `request_secret` (`mcp__bws-secrets__request_secret`, args `name`, `purpose`): opens a pane with a masked input (never echoed); the value is written to `<secretsDir>/<project>.env` (default `~/.claude/bws-secrets/`), outside the project. The tool result says only `saved as NAME; use {{secret:NAME}}`. | tool test; result never contains the value |
| FR-SB-03 |A -- label --> Blocking reads: a `tool.call` denial for Read, Grep, Glob and Bash commands (command position only; replay the rule over a corpus of real commands before shipping) that touch `<secretsDir>`, with a message that tells Claude to use the placeholder. | denial tests and a false-positive corpus replay |
| FR-SB-04 | Use: aA -- label --> Bash command containing `{{secret:NAME}}` gets the value injected as an environment variable at execution time per the spike's mechanism, with the placeholder in the command text left as `$NAME`; the tool result is scanned and any occurrence of the value or its encodings is replaced by `{{secret:NAME}}`. | tests with a stub; an echo test |
| FR-SB-05 | `/secrets` lists names only (never values) and removes one; the pane never shows a saved value. | command tests |
| FR-SB-06 | README with the threat model and what it does not protect (a command that sends the value somewhere, a file the user points it at). Summary atom shows the count of names. | README |
| AC-SB-01 | Probe: Claude is asked to call `request_secret` then run a command using the placeholder; the receipt shows the transcript contains no value. | `receipts/m8-probe.json` |
