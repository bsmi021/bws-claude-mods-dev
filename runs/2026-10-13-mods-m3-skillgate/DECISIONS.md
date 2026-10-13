# M3 skill gating: spike decisions (FR-SG-01)

Claude Code 2.1.296. Probes ran through `python tools/probe.py --plugin bws-skillgate` (headless `claude -p`, haiku,
`CLAUDE_CODE_PLUGIN_DIRS` empty, `--setting-sources project,local`). The spike hook was a throwaway `register.tsx`
in `bws-skillgate/` (the last version is saved as `receipts/spike-register-v3.tsx.txt`); T02 replaced it.

## Questions

1. Can a `prompt.attachment` hook on type `skill_listing` rewrite the text so the model sees a different subset?
2. When does the engine raise that attachment: every prompt, every request, or once?
3. Can the listing be changed again for a later prompt, and what does that do to the prompt cache?
4. Where do the skill names and descriptions come from for the classifier, given the ordering of events?

## What the generated types say (`.claude-plugin/types/claude-code/index.d.ts`)

- `prompt.attachment` "fires once per message the engine injects for the model on its own ... as a request carries
  it". `skill_listing` is an undeclared type: `{ type, text, origin, agentId? }`, `text` rewritable with
  `next({ ...e, text })`, `{ text: null }` drops it.
- "The answer holds per attachment for the process (asked again on resume or `$.ui.invalidate`); the transcript keeps
  the engine's record." So an answer is cached per attachment row, and the stored transcript keeps the engine's full
  text, not the rewrite.
- `$.ui.invalidate('prompt.attachment')`: "a cached answer: dropped next turn".
- `prompt.submit` `context`: blocks the model reads after the prompt, never shown to the user; attached on the way
  down, before `next`. `next(e)` resolves once the prompt entered and its turn started.
- `ContextSkill` (the `/context` breakdown) carries name, source and tokens, but no description.
- `$.command.list()` lists skills with descriptions (bws-enhance uses it), but its descriptions are not the listing's
  text and it says nothing about which skills the listing actually carries.

## Probes and answers

| Probe | What it did | Result |
|---|---|---|
| 1 `receipts/spike-probe-1.json`, log `spike-log.json` | Cut the listing to its first two entries. The prompt asked for the skill list, then a Bash call whose `tool.call` hook ran `$.ui.invalidate('prompt.attachment')` and switched the cut to the last two entries, then the list again. | `skill_listing` fired once, in the first request, `agentId` absent, origin `engine`, 7,017 characters, 16 skills. The model answered `SKILLS-1: mods-harness, dataviz` (the cut). After the invalidate, the second request of the same turn re-asked only `total_tokens_reminder`; `skill_listing` was not re-asked and the model again answered `SKILLS-2: mods-harness, dataviz`. Second request: 32,517 cache read, 336 created (normal prefix reuse). |
| 2 `receipts/spike-probe-2.json`, log `spike-log-2.json` | Meant to test turn 2: on `turn.complete` invalidate, then `$.prompt.submit` a second prompt. | `num_turns: 1`: `claude -p` exits when the session goes idle, which is when a plugin's submit would run. Turn 2 is **not testable headless**. It did confirm the order: `prompt.submit` (…714) fires before `skill_listing` (…757) on the first prompt. |
| 3 `receipts/spike-probe-3.json`, log `spike-log-3.json` | Cut the listing to two entries and added, from `prompt.submit`, a `context` block in the listing's format naming one more skill (`simplify`). | The model answered `SKILLS-1: mods-harness, dataviz, simplify`: a context block is read as more available skills. |

Answers:

1. **Yes.** The rewrite is honored for the request; the model reports exactly the cut.
2. **Once.** The engine raises `skill_listing` in the first request of the conversation (and, per the types, again
   on resume or after an invalidate, and as a new row if the skill set changes). It is not raised per prompt or per
   request. Observed: one firing in a two-request turn.
3. **Not cheaply.** The listing sits inside the first user message. Changing it later (by invalidate) would rewrite
   message 1, so every later request misses the prompt cache for the whole conversation after the system prompt.
   This is a structural argument from where the listing sits and from the types; it was not measured, because a
   second turn cannot run headless (probe 2). An invalidate within a turn did not re-ask the listing at all (probe 1).
4. The listing text itself is the only source that matches what is cut. It exists only inside the attachment hook,
   which runs after `prompt.submit` on the first prompt.

## Decision: the mechanism

- **First prompt: cut the listing.** A `prompt.attachment` hook matched on `{ type: 'skill_listing' }`, main loop only
  (a subagent's listing, `agentId` set, passes through untouched). `prompt.submit` stashes the prompt text (in memory
  only, never logged); the attachment hook parses the listing into entries (an entry is a `- name: description` line
  plus its continuation lines, as `claude-api` has), runs the one small-model call with that prompt and those entries,
  and returns the header plus the picked entries plus any `/name` the prompt names, in the listing's own order.
  Classifying there costs up to 4 s on the first request only.
- **Later prompts: add, never rewrite.** `prompt.submit` classifies the new prompt against the saved entries. Picks
  (and `/name`s) the model has not been shown yet are appended as one `context` block in the listing's format
  ("More skills are available for use with the Skill tool: ..."). When every pick is already shown, the hook returns
  `next(e)` untouched (FR-SG-03). The set the model has seen only grows during a conversation; that is the price of
  keeping the cache.
- **Same input, same text.** The cut text is built only from the listing's own lines, in listing order, so the same
  picks give byte-identical text. The sent text is memoised per (session, listing text) for the process, and kept in
  `$.store` so a re-ask (resume, another plugin's invalidate) returns the same bytes instead of classifying again.
- **Fail open.** A classifier error, timeout (4 s), unparsable answer, or a listing that does not parse leaves the full
  listing (first prompt) or adds nothing (later prompts).
- The cut hides skills from the listing; it does not disable them. A typed `/name` still expands the skill, and the
  Skill tool still accepts a skill the model knows by name.

## Ruled out

- Rewriting the listing per prompt via `$.ui.invalidate('prompt.attachment')`: within a turn it is not re-asked
  (probe 1); between turns it would rewrite the first message and miss the cache for the whole conversation.
- Dropping the listing (`{ text: null }`) and sending only a context block per prompt: the same cache problem on the
  first prompt is avoided, but the per-prompt block would repeat the picks every prompt; the cut is simpler.
- `$.command.list()` as the classifier's source: its descriptions are not the listing's, so the cut could name skills
  the listing never carried.

## Not verified (to Brian's manual checks)

- Turn 2 and later in a real interactive session (the context block path), resume, and what an invalidate by another
  plugin does. Headless `claude -p` runs one turn only.
- Headless probes load only project and local skills (16 here); the interactive listing is larger. The mechanism is the
  same.
