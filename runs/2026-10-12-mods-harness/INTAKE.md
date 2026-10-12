# Intake: harness loop for the video-derived mods

Sources: skill args; runs/2026-10-12-mod-ideas-video/RUNLOG.md; AGENTS.md (project); repo discovery; the session.

| Section | Item | Label | Evidence |
|---|---|---|---|
| A Goal | Build the mods from the Ray Amjad video analysis | Stated | user: "create a /harness-loop for building each of the mods" |
| A | Which mods are in scope | Inferred | ideas RUNLOG: build 5 (cache clock, prompt bouncer, skill gating, memory, diagram); "later" 3 (DreamPath, decision tree, secret box); skip 2 |
| A | Where each lives | Inferred | cache clock -> bws-cockpit (handoff.ts + bar); bouncer -> bws-enhance mode; skill gating, memory, diagram -> new plugins |
| B Work source | No spec with IDs exists | Unknown | only a ranked idea list; no acceptance criteria -> needs spec + DoD (worker-drafted tasks, user-approved) |
| C Order | Sequential, cache clock first | Inferred | my recommendation in the chat reply |
| D Done | Checks per plugin | Stated | AGENTS.md: `claude plugin validate`, `claude plugin test`, tsc 5.x strict |
| D | Full gate cost | Stated (measured) | all 7 plugins: validate + test + tsc = about 36 s, baseline all green (board 83, cockpit 162, design-picker 27, enhance 18, notify 12, shell-lint 17, sidechat 58 tests) |
| D | Interactive/pane checks | Conflict | AGENTS.md wants live checks; headless workers can run `claude -p --plugin-dir` stream-json, but not a real TUI pane |
| E | Wide paths | Inferred | shared: AGENTS.md, bws-cockpit/hooks/register.tsx (loaded in every session), existing plugins' tests |
| F Workers | claude, tiers | Inferred | no codex units (mods API is Claude-specific; types are local) |
| G | Run folder convention | Stated | `runs/<date>-<slug>/` with PLAN.md, RUNLOG.md, `receipts/` |
| H Git | Never push main to `mods`; `private main` ok | Stated | AGENTS.md |
| H | Working tree | Conflict | other live sessions share this tree; plugins load from source via CLAUDE_CODE_PLUGIN_DIRS so a broken commit breaks every new session; 2 untracked run folders would fail requireCleanTree |
| H | tsc path | Stated | memory: PATH tsc is bogus; use pnpm typescript@5.8.3 |
| I Board | Port | Inferred | listeners on 8770 8771 8773 8774 8788 8790; recommend 8781 |
