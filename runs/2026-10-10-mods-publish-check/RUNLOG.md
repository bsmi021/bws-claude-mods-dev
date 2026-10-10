# RUNLOG: all five mods published, running, tested, on GitHub (2026-10-10)

**Brief:** confirm bws-cockpit, bws-design-picker, bws-enhance, bws-notify and bws-shell-lint are published, load and run in Claude Code, pass their tests, and have their code on GitHub with a clean tree. Fix only what blocks that.

## How "published" and "loaded" work here
- **Published** = the mod's folder is on the orphan `publish` branch and that branch is pushed to remote `mods` (github.com/bsmi021/bws-claude-mods, private). The remote's push rule maps only `publish` -> `main`; this repo's `main` (with private `runs/`) is never pushed. There is no marketplace.
- **Loaded** = the five absolute source paths in `CLAUDE_CODE_PLUGIN_DIRS` (user settings `env`), so every session loads them from source as `<name>@inline`.

## Result: nothing needed fixing
No mod code, manifest or README changed. The only change is committing a run folder an earlier session left untracked.

| Mod | Version | Published (`publish` 9d875b0 = `mods/main`) | Loads (2.1.296, `claude -p` init) | Hooks: README vs validate | validate | tests | tsc 5.8.3 | Live check | Git |
|---|---|---|---|---|---|---|---|---|---|
| bws-cockpit | 0.11.0 | yes, identical to main | yes | match (20 hooks, the README table lists all) | pass | 121/121 | clean | `/projects` answered; `/cockpit`, `/resume-run`, `/loop-watch`, `/handoff`, `find_project` registered | clean |
| bws-design-picker | 0.2.3 | yes, identical to main | yes | match: prompt.compose, tool.call{AskUserQuestion}, ui.render{AskUserQuestion} | pass | 27/27 | clean | load only (needs the AskUserQuestion UI) | clean |
| bws-enhance | 0.2.0 | yes; README differs on purpose (see below) | yes | match: session.start, command.run{enhance}, prompt.submit, ui.close, ui.render{SessionMode, Pane} | pass | 16/16 | clean | `/enhance make the tests faster` returned a rewrite | clean |
| bws-notify | 0.1.1 | yes, identical to main | yes | match: prompt.submit + classic.Notification/Stop/SubagentStop/StopFailure | pass | 12/12 | clean | load only (toasts are off in headless by design) | clean |
| bws-shell-lint | 0.2.0 | yes, identical to main | yes | match: tool.call{Bash}, `$.ui.toast` | pass | 17/17 | clean | `ls "C:\Windows\"` refused with `bws-shell-lint [dq-trailing-backslash]` | clean |

Total: 193 tests pass, 0 fail.

## Steps
1. Read `docs/mods.md`, each README, AGENTS.md. Checked `publish` vs `main` per mod, and `publish` vs `mods/main` after a fetch.
2. Ran validate, `claude plugin test` and tsc for each mod (receipts below).
3. Live `claude -p` (haiku) with stream-json: init lists all five at manifest versions, no plugin warnings for them. Fired `/projects`, `/enhance` and a shell-lint refusal.
4. `git push mods`: "Everything up-to-date", no credential prompt.
5. Committed `runs/2026-10-06-headless-flash/` (f0e97c1), then this run folder.

## Notes
- **Version:** `claude --version` is **2.1.296**; AGENTS.md's baseline says 2.1.287. Everything passes on 2.1.296. Baseline left as is.
- **tsc:** the `tsc` on PATH is the npm placeholder package, not TypeScript. Used `node ~/AppData/Local/pnpm/global/5/node_modules/typescript/lib/tsc.js` (5.8.3) with each mod's tsconfig (strict, noUncheckedIndexedAccess). Earlier runs used 5.9.3.
- **bws-enhance README:** `publish` has the scrubbed text (prompting-docs links, "the folder's absolute path") where `main` has a `runs/` path and `C:/Projects/...`. Intentional scrub, not drift. A future publish refresh must not `git checkout main -- bws-enhance` blindly, or it reintroduces the local paths.
- Validator advice "no marketplace install line" and "gating hook without .catch" lines: informational, validation passed.
- Interactive surfaces were not exercised this run beyond this session itself, which has bws-cockpit's `find_project` tool and band context attached.

## Receipts (`receipts/`)
`validate-<mod>.txt`, `test-<mod>.txt`, `tsc-<mod>.txt` (empty = clean), `live-init.jsonl`, `live-projects.jsonl`, `live-enhance.jsonl`, `live-shell-lint.jsonl`, `push.txt`, `publish-diff.txt`.

## Follow-ups (parked)
- Bump the AGENTS.md baseline to 2.1.296.
- A marketplace (for `claude plugin install`) if the mods should install rather than load from source.
- Fix the `tsc` on PATH (remove the placeholder package) so `tsc` is TypeScript.
