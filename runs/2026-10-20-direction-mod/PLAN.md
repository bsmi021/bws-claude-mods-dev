# bws-direction 0.1.0: drift detection

## Finish line

- [x] `bws-direction/` mod: after a working turn (main agent, answered, edited files or ran 3+ tools) one small-model call
      judges whether the turn is aligned with the session's task, its run folder's PLAN.md and the project's `docs/`
      corpus (anchors found by name: PRD, spec, requirements, design doc, GDD, vision; then architecture, technical design, *-spec; `anchorDocs` overrides; any project, not only games).
      Verdict `aligned | drifting | off-course`, score 0-100, reason, anchor, cause `agent | user`.
- [x] In-session: this session's verdicts and trend. Overall: per-project history in `$.store` (cross-session trend) and
      `/direction overall` (recent git log + history + docs, one model call, on demand only).
- [x] Surfaces: Direction tab in the cockpit dashboard (latest verdict, session + project trend, buttons check / overall /
      tell, each with a `/direction --<id>` twin), `summary` atom, toast on drifting / off-course, optional `nudge`
      (prompt.context block with the latest drift verdict). Headless: commands await and print text.
- [x] Read-only over `docs/`. Fail open with one debug line, never containing prompt text.
- [x] bws-cockpit lists bws-direction among mod tabs (modtabs, register atoms + state.set, plugin.json default, types, test), version bump.
- [x] marketplace.json lists bws-direction, version bump.
- [x] Gate green: `python tools/mods-gate.py --plugin bws-direction` and `--plugin bws-cockpit`.
- [x] Headless proof in `C:/Projects/bws.game.tms`: `/direction` finds docs/GDD.md; `/direction check` returns a verdict.
- [x] README, CHANGELOG, RUNLOG, commit, `git push private main`.
- [x] Release: bws-mods 1.9.0 published (v1.9.0), installed locally (bws-direction 0.1.0, bws-cockpit 0.23.0)

Out of scope: automatic overall checks, editing docs. Release was out of scope at the start; Brian approved it explicitly (1.9.0 on 2026-10-20, 1.10.1 on 2026-10-22), and 1.10.1 also shipped the test-only bws-enhance 0.4.4 and bws-sidechat 0.4.4 fixes that the release gate needed.

## Decisions

- Corpus: every `.md` under `docs/` (depth 4, 300 files max), split by headings, cached by mtime. The excerpt sent per
  check: the GDD heading outline (always) + sections ranked by word overlap with the turn's paths, identifiers and prompt
  words, within a 10k-char budget.
- Session task = first typed prompt (not a slash command) + the last 3 typed prompts (redirections by the user).
- Run folder = the newest `runs/<date>-<slug>` the session's tool calls named; its PLAN.md (first 3k chars).
- Model default `haiku`, `maxTokens` 400, JSON only, 20 s timeout.
- [x] Tell Claude confirmed in Desktop (2026-10-22): the click sent the drift verdict as a prompt.
