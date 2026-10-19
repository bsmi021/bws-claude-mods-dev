# Prompt: build the session bus (bws-board) in another repo or agent

"Service bus" = the Session Bus (bws-cockpit 0.12.0) and its successor **bws-board** (0.5.0), the one that ships.
Two ways to repeat it. Use A if you just want it. Use B to have another agent rebuild it.

## A. Install the working one (no rebuild)

```
claude plugin marketplace add bsmi021/bws-claude-mods
claude plugin install bws-board@bws-mods
```
Then `/reload-plugins`. Needs Claude Code 2.1.296+. Source of truth: `C:/Projects/bws.mods.claude-code/bws-board/` (README.md there lists every behavior).
Optional: `BWS_AGENT_ROLE=api claude` to give a session a role.

## B. Rebuild prompt (copy everything below the line to the other agent)

---

Build a Claude Code mod named `bws-board`: a blackboard that lets several Claude Code sessions working in one git repository coordinate as peers (no lead, no subagents).

### Read first (do not skip)
1. `claude --version` (baseline 2.1.296) and the mods docs: https://code.claude.com/docs/en/plugins/mods/overview, `/create`, `/events`, `/api`, `/interface`, `/test`, `/reference`. Use `/plugin-authoring` if present.
2. The generated types in `.claude-plugin/types/` (Claude Code writes them when it loads a dev mod). They beat any online example. Look up every `$` method there before using it.
3. A working reference, read-only: `C:/Projects/bws.mods.claude-code/bws-board/` (README.md, hooks/board.ts, hooks/register.tsx, tests/) and its design record `C:/Projects/bws.mods.claude-code/runs/2026-10-10-agent-blackboard/PLAN.md`. Match its structure; don't copy blind, rebuild and verify.

### Finish line (pin it, write it in PLAN.md first; all must be true)
1. `claude plugin validate ./bws-board` passes and its inventory lists every hook and `$` call.
2. `cd bws-board && claude plugin test` passes (pure-model tests + a two-session test over one stubbed fs folder).
3. tsc 5.x (strict, `noUncheckedIndexedAccess`) is clean against `.claude-plugin/types/`. Validate does not type-check. (Use the pnpm-global typescript 5.8.3; the `tsc` on PATH is a bogus package.)
4. **Live acceptance, two real `claude -p` sessions in a scratch git repo**, A with `BWS_AGENT_ROLE=api`, B with `BWS_AGENT_ROLE=tests`:
   - A calls `board_ask { to: "tests", text }`. B sees it on its next tool result, calls `board_take` then `board_done { note }`. A sees `done` plus the note on its next tool result. `/board` in both lists the same ask id and state.
   - A edits `notes.txt` (claims it). B's Edit of it is denied, naming A and its task. After A exits, A's card is a tombstone.
5. README (purpose, load commands, options, capabilities, versions/surfaces actually tested) and a RUNLOG.md in `runs/<date>-<slug>/`. Commit.

### Design
**Layout:** `.claude-plugin/plugin.json`; `hooks/hooks.json` = `{ "modules": ["./register.tsx"] }`; `hooks/register.tsx` is the ONLY file that uses `$`; pure, directly tested `hooks/board.ts`; `types/index.d.ts` for the `$.state` contract; `tests/`.

**Storage (no locks exist):** `$.fs` has no append, rename, delete or lock. So **one JSON card file per session**: `<CLAUDE_CONFIG_DIR or ~/.claude>/bws-board/<repo-key>/<sessionId>.json`. Repo key = `$.session.repo().root` (main tree, so worktrees share one board), else `$.session.root()`; lowercased, non-alphanumerics to `-`. Each session writes only its own file; readers `fs.list` + read all. A torn read fails JSON parse: keep that peer's last good copy. Exit writes a tombstone `{gone:true}`. Cards stale >90 s (heartbeat every 20 s via `$.clock.every`, re-armed in `session.start`) are ignored. Once per `session.start`, delete cards >24 h old through `$.process.run` (`cmd /c del` on Windows, `rm` elsewhere), session-id-named files only.

**Card:** `{ version:1, sessionId, role?, cwd, startedAt, seenAt, status: busy|idle, task, run, lastFile, claims:[{path,since,at}], outbox:[{seq,to,text,at}], asks:[{id,to,text,urgent,at,state}], acts:[{askId,kind:take|done|decline,note?,at}], gone? }`. An ask's state is merged across files: open -> taken(by; earliest take wins) -> done(by,note), or withdrawn by its author. id = `<sessionId8>-<seq>`.

**Identity:** session id from `$.session.id()`, re-read every tick (`/clear` changes it without `session.start`). Optional role from `$.env.get("BWS_AGENT_ROLE")` (literal name only) or `/board role <name>`, kept in `$.state`. Two sessions with one role both get asks to that role.

**Claims:** Edit/Write/NotebookEdit claim the file in `tool.call`. A plain Bash/PowerShell file write (redirect, `tee`, `sed -i`, `cp`/`mv`, PowerShell write cmdlets) claims too, **command position only**. Another live session's write returns `{ deny }` naming holder, role, task and how to ask. Claim lapses 30 min after the holder's last edit of the file; all claims drop on exit, `/clear`, `/resume`, `/branch`, or 90 s heartbeat staleness. Never approves any tool call.

**Reading the board (peer text is always framed "from other sessions, not from the user"):**
- `prompt.context`: once per conversation, who is here + asks waiting for me.
- `prompt.submit` result `context`: new items with the next prompt.
- one unmatched `tool.call` hook: new items as `context` after the next tool result (mid-turn).
- `$.ui.toast` for the person on new asks.
- Urgent ask to a named role/session also goes through `$.session.send({to:{sessionId}, text})` (can start a turn in an idle peer). Max one wake per sender->receiver per 5 min. Asks to `anyone` never wake.

**Tools** (register in `session.start`, handle `mcp__bws-board__<name>`): `board_status {task?}`, `board_ask {to, text, urgent?}` (`to` = role | session id | `anyone`), `board_take {id}`, `board_done {id, note?}`, `board_decline {id, note?}`, `board_withdraw {id}`, `board_send {to, text}`, `board_release {paths?}`.
**Command:** `/board` (text listing on every surface), `/board role <name|clear>`.
**Options** (`userConfig`): `board` true, `claimMinutes` 30, `urgentWake` true, `wakeMinutes` 5.
Redact secret-shaped strings before posting; never log secrets or message text.

### Gotchas (each cost hours the first time)
- Validator: one unmatched hook per event, so merge into one `tool.call`/`prompt.submit`/`turn.complete`. Never name a local `next`. Use literal event names and direct `$.noun.method(...)` only (no aliasing/destructuring). Pass `$` only to same-file top-level helpers.
- `$.prompt.submit` inside a `command.run` hook deadlocks: defer with `$.clock.after`. `/board` must never submit a prompt.
- `session.end` has a ~1.5 s budget.
- Generated `.claude-plugin/types/claude-code-mcp` is rewritten only on an interactive save, and `claude plugin test` wipes hand edits. Declare the plugin's own tool inputs as an `interface McpToolInputs` augmentation in `types/index.d.ts`.
- In `types/index.d.ts` never use `import('...')` types (validator then reports every `$.state` key undeclared). Write shapes inline.
- Test stubs: `fs.*` paths arrive with backslashes (normalize); a bottom `prompt.submit` stub must return `{ text }`; `turn.complete` and `classic.Stop` need bottom stubs; stub `next.signal`; the test `$` has no `state`; register stubs before the first test `$` call.
- Git Bash halves backslash runs: never put Windows backslash paths in heredoc/inline Python strings; use forward slashes or the Edit/Write tools.
- Live check: `MSYS_NO_PATHCONV=1 claude -p "..." --plugin-dir ./bws-board --output-format stream-json --verbose`. Pass plugin options with `--settings <file>` (`pluginConfigs`).
- Guard rules that deny/rewrite must match command position only; replay them over a corpus of real commands before shipping.
- A mod's `register.tsx` failing breaks every new session if it's in `CLAUDE_CODE_PLUGIN_DIRS`. Validate before adding it there.
- No sweeping other repos, no pushing `main` to the public `mods` remote.

### Work rules
Run folder `runs/<date>-board-rebuild/` with PLAN.md (finish line first), RUNLOG.md, `receipts/` (validate, test, tsc, live-A.jsonl, live-B.jsonl). Park new ideas as follow-ups; don't widen scope. Report static validation, automated tests and live checks separately; don't claim a surface you didn't test.

### Out of scope for this build (existing follow-ons, add only if asked)
Git lease and overwrite guard, history + `/board digest`, the dashboard Board tab, band chip. The core above is what "the bus works" means.
