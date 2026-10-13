# Handoff: M3 skill gating (bws-skillgate 0.1.0, new plugin)

Status: all tasks done and committed on `feat/video-mods`; the gate result is in RUNLOG.md. Brian's interactive checks
are in MANUAL-CHECKS.md (14 checks; the worker only ran headless).

## What exists (later mods: read this)
- `bws-skillgate/` is a new plugin (version 0.1.0). Files: `.claude-plugin/plugin.json` (options `mode` off, `topK` 5,
  `model` haiku), `hooks/register.tsx` (the only file with `$`), `hooks/gate.ts` (pure), `hooks/kit/` (generated from
  bws-kit via `kit.json`: classify-fork, summary, transcript), `types/index.d.ts` (atoms `setting`, `last`, `summary`
  declared inline), `tests/gate.test.ts`, `tests/skillgate.test.ts`, `tests/listing.ts` (fixture), `README.md`.
- Mechanism (DECISIONS.md, from the spike): the engine sends the `skill_listing` attachment once, in the first request
  of a conversation. `prompt.submit` stashes the prompt; the `prompt.attachment { type: 'skill_listing' }` hook (main
  loop only) runs one `$.model.complete` call and answers the row with the header plus the picked entries plus any
  `/name` the prompt names, in listing order. Later prompts never rewrite the listing: `prompt.submit` classifies again
  and adds picks not yet shown as one `context` block ("More skills are available for use with the Skill tool: ...");
  with nothing new it returns `next(e)` untouched.
- Determinism: the cut text per (session id, row hash) is kept in memory and in `$.store` key `gates` (last 20
  conversations, no prompt text), so a re-asked row gets the same bytes and no model call.
- Fail open: error, 4 s timeout (`bound` from the kit plus an AbortController), unanswered or unparsable reply ->
  full listing (first prompt) or nothing added (later), one `ui.log` debug line without prompt text.
- `/skillgate [off|on|status|explain]` (immediate). `on`/`off` set the session `setting` atom, not the options.
- Summary atom `{ plugin: 'bws-skillgate', key: 'summary' }`: null when off, `skills N/M -X tok` (ok), `skills: full
  list` (warn) after a fail-open. bws-cockpit already lists `bws-skillgate` in its default `modSummaries`.

## Tests that prove each requirement (`claude plugin test`: 42 pass, 0 fail)
- FR-SG-01: `skillgate.test.ts` "FR-SG-01: the first prompt cuts the engine listing" (cut after one call; subagent
  listing untouched; other attachments not intercepted; off by default makes no call); `gate.test.ts` "FR-SG-01: the
  listing, parsed and cut" (continuation lines, `plugin:skill` names, order, all-kept is byte-identical). Spike:
  DECISIONS.md with `receipts/spike-probe-1..3.json`.
- FR-SG-02: "FR-SG-02: picks, /name, topK, later prompts and /skillgate" and "FR-SG-02: modes, the classifier call and
  its answer" (parse, cut, explicit `/name` kept, topK cap, model option, later-prompt block, slash and plugin prompts
  not classified, the command).
- FR-SG-03: "FR-SG-03: cache safety" (identical text in two conversations; re-ask returns the same bytes with no call;
  stored cut after a resume; "a later prompt whose picks are all shown returns next(e) untouched") and "FR-SG-03: the
  same input gives the same bytes".
- FR-SG-04: "FR-SG-04: fail open" (error, unparsable, unanswered, 4 s timeout, failed first prompt adds nothing later,
  later-prompt failure, a listing with no entries) and the pure "the debug line" test.
- FR-SG-05: "FR-SG-05: explain shows the last picks and the tokens saved" and the pure "summary atom shape", "explain",
  "saved characters" tests.
- FR-SG-06: README, version 0.1.0, `kit.json`, `python tools/sync-kit.py --check` passes.
- AC-SG-01: `receipts/m3-probe.json` (mode on, topK 1, fixed prompt naming `/simplify`: the model reported exactly
  `dataviz, simplify`) and `receipts/m3-probe-control.json` (mode off: all 15). Summary `receipts/m3-probe.md`.

## Decisions you must know (assumptions A1, A2 on the dashboard, plus these)
- A1: later prompts only add (a context block); the shown set grows per conversation. Rewriting the listing later
  would rewrite the first message and miss the prompt cache for the whole conversation.
- A2: the first prompt's classifier runs inside the attachment hook (up to 4 s on the first request only).
- Only `composer`, `bridge` and `sdk` prompts are classified on later turns (like M2); slash commands are not.
- An empty JSON array from the classifier is a valid answer: the listing is cut to the header plus any `/name`s.
- The pick itself is not visible headless; AC-SG-01's evidence is the reported list's exact shape against an off control.

## Watch out for
- Unverified live: later prompts, resume, `/clear`, the cockpit chip, Desktop (headless `claude -p` runs one turn;
  probe 2 showed a plugin's `$.prompt.submit` after the turn never runs headless). MANUAL-CHECKS 5 to 14 cover them.
- The `last` atom is not reset on `/clear`, so `/skillgate explain` shows the previous conversation's picks until the
  new conversation's first prompt is gated.
- Turning the gate on mid-conversation does nothing until the next conversation (the listing already went out in full).
- A skill description that contains a line starting `- word: ` would be parsed as a separate entry (the listing format
  has no other marker). None of the 15 headless skills do.
- `claude plugin validate` reports `gating hook without .catch` for `command.run` and `prompt.submit`; both handlers
  catch their own errors, so the verdict is unchanged (as in M2).
- `hooks/kit/` is generated; never edit it.

## Next step
Brian runs MANUAL-CHECKS.md (checks 1 to 13 in Windows Terminal, 14 in Desktop). If check 7 shows the cache dropping
after an added block, the mechanism must change (record it in DECISIONS.md). The next mod in the order is M4 (memory,
a new plugin; it vendors the kit's classify-fork the same way).
