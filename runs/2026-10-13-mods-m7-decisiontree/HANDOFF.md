# Handoff: M7 decision tree (bws-sidechat 0.1.5 -> 0.2.0; extends the existing plugin, no new plugin)

Status: all code tasks committed on `feat/video-mods`; the gate result is in RUNLOG.md. Brian's interactive checks are in
MANUAL-CHECKS.md (16 checks; the worker only ran headless).

## What exists (later mods: read this)
- New pure modules in `bws-sidechat/hooks/`:
  - `tree.ts`: the tree. `newTree`, `addChild` (caps: `MAX_NODES` 30, `MAX_DEPTH` 6), `fillNode`, `addOption` (a free
    answer becomes option `you`), `goTo`, `goBack`, `branch` (an earlier node's option: to its child, or a new child),
    `pathTo`, `childVia`, `childrenOf`, `mapRows` / `mapText` (the text map, `>` on the current node), `childTag`,
    `decisionParagraph` (the one paragraph Decide sends; deterministic, no model call), `treeSummary` (summary atom).
  - `explain.ts`: `parseOptions` (the last set of numbered / lettered / `Option A` items, shallowest list, with a question
    or an option word somewhere; code blocks ignored; at most 12), `parseReply` (an Explore reply: options or a free
    answer), `lastReply`, `explorePrompt`, `nodeRows` / `mapPaneRows` / `crumbOf` (the pane rows), `treeText` (headless
    reply), `failLine`, `MAX_FORKS` 2.
  - `side.ts` is unchanged; Explore reuses `sideArgs`, `splitLines`, `reduceLine`, `exitNote`, `killArgv`, `wrapLines`,
    `roomOf`, `windowRows`, `clampBack`, `scrollStep`.
- `register.tsx` (the only file with `$`), all additive:
  - `session.start` (existing hook) also registers `/explain`.
  - New matched hooks: `command.run{explain}` (`/explain`, `/explain <text>`, `/explain decide`, `/explain close`) and
    `ui.render{Pane, requestId=decisiontree}` (keep `TREE_PANE` a literal in register.tsx for the validator).
  - Explore (`explore`): its own module state (`treeNo`, `exploring` map), never the side chat's `runNo` / `isStopped` /
    `chat.isBusy`, so an Explore and a side chat answer never stop each other. Every Explore forks afresh:
    `sideArgs({ isFirst: true, mainId: parent.forkId ?? tree.mainId, sideId: new uuid })`; env `CLAUDE_CODE_PLUGIN_DIRS`
    empty. Timeout: `$.clock.after(exploreTimeoutSeconds)` + `killChild` (spawn has no signal). Failure: node `failed`
    with the reason, one `ui.log` debug line, never the prompt or reply.
  - Decide: `$.clock.after(10, () => $.prompt.submit({ text, asUser: true }))`, then the tree is closed and cleared.
- `types/index.d.ts`: `TreeOption`, `TreeNode`, `TreeEdge`, `DecisionTree`, `TreePane`; atoms `tree` and `summary` beside `chat`.
- `kit.json` `{ "modules": ["summary"] }`; `hooks/kit/summary.ts` is generated (`python tools/sync-kit.py`). Never edit it.
- Options (plugin.json): `exploreTimeoutSeconds` (180), `treeDumpFile` (empty; a path gets the tree JSON after every
  change). Explorations use the existing `sideModel`, `sideTools`, `loadMcpServers`, `claudePath`.
- Summary atom `{ plugin: 'bws-sidechat', key: 'summary' }`: null with no tree; `tree exploring N` (busy); `tree N nodes`
  (ok). bws-cockpit's `modSummaries` default does not list bws-sidechat, so no chip shows (a cockpit change; not done).
- README: commands row, "Decision tree (`/explain`)" section, options, Tested row for 0.2.0.

## Tests that prove each requirement (`claude plugin test` in bws-sidechat: 118 pass, 0 fail; 58 before)
- FR-DT-01: `tests/tree.test.ts` "FR-DT-01: nodes and edges", "go back and branch from an earlier node", "depth and node
  caps", "the map as text", "the decision paragraph and the summary atom".
- FR-DT-02: `tests/explain.test.ts` "FR-DT-02: the parser, on replies as Claude Code writes them" (samples in
  `tests/replies.ts`), "FR-DT-02: /explain opens the tree at its root" (registered name, pane at the root with three
  option buttons, `/explain <text>`, no options, headless text + dump, does not intercept other commands), "FR-DT-02:
  Explore reuses the side chat's fork child; at most two at once" (argv equals `sideArgs` output, env, third refused
  then a freed slot, Explore and `/btw` do not stop each other).
- FR-DT-03: `tests/explore.test.ts` "FR-DT-03: Explore forks a side chat about one option" (prompt, next node, free
  answer leaf, fork of the parent's fork, typed free answer, already-explored not re-forked, dump) and "FR-DT-03 /
  FR-ALL-03: a failed Explore never blocks" (error result, exit with stderr, timeout kills the child, retry after a
  failure, a new `/explain` drops the old fork's late reply).
- FR-DT-04: `tests/treepane.test.ts` (Back and another option keep both branches, the path line, Map and node jumps,
  Close kills a running fork and clears, `/explain close`, scrolling a long answer, the desktop pane, the side chat pane
  untouched).
- FR-DT-05: `tests/decide.test.ts` (the Decide button sends after the press returns, `/explain decide` deferred with
  `$.clock.after` (nothing at 9 ms, sent at 10 ms), a deeper path with a free answer, nothing to decide at the root).
- FR-DT-06: README, version 0.2.0. `git diff f43fdca -- bws-sidechat/tests/side.test.ts bws-sidechat/tests/sidechat.test.ts
  bws-sidechat/hooks/side.ts` is empty: the 58 earlier tests and `side.ts` are untouched.
- AC-DT-01: `receipts/m7-probe.json`, `receipts/m7-probe-dump.json`, `receipts/m7-probe.md` (headless
  `/explain <fixture>`: root `n1` with three options; $0, exit 0).

## Decisions you must know (assumptions A1 to A8 on the dashboard)
- A1 depth cap 6. A2 the decision paragraph is built from the path, no model call. A3 summary atom + kit summary.ts.
- A4 `/explain <text>` reads the text given (the probe's fixture path; also a paste). `decide` and `close` subcommands.
- A5 new options `treeDumpFile`, `exploreTimeoutSeconds`. A6 Close and Decide end forks and clear the tree; pane id
  `decisiontree`. A7 a reply needs a `?` or an option word to count as a choice. A8 parser samples are hand-written in
  Claude Code's reply shapes (tests ship with the plugin, so no private transcripts).
- Headless `/explain` answers the map as text; Explore and Decide need a screen.
- The tree is not reset on `/clear`, `/resume` or `/branch` (the spec row does not ask; the forks keep their own
  sessions). A new `/explain` replaces it.

## Watch out for
- `claude plugin validate` still reports `gating hook without .catch` for the existing `/fork|/branch` and `/btw` hooks
  (unchanged from 0.1.5).
- The test engine never routes `$.ui.focus` to a stub, so the focus ring onto `opt-0` is untested (MANUAL-CHECKS 2).
- The test pane is 140 columns wide so long sample lines are not wrapped; find-by-text matches whole rows.
- `mapText(t, 200)` for the headless reply; the pane and the dump use 56-character option text.
- Unverified live: everything drawn, a real fork's reply shape (does the model end with a numbered list?), Decide's send,
  Desktop (MANUAL-CHECKS 1 to 16).

## Next step
Brian runs MANUAL-CHECKS.md. The next mod in the order is M8 (secret box, a new plugin `bws-secrets`, which starts with its
spike and may stop on a blocker).
