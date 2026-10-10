# Session Bus (bws-cockpit 0.12.0)

## Finish line (all true)
- [x] `claude --version` checked against the 2.1.296 baseline (receipts/claude-version.txt)
- [x] `claude plugin validate ./bws-cockpit` passes and lists every hook and API call (receipts/validate.txt)
- [x] `claude plugin test` passes, incl. a two-session test: each sees the other, one is blocked editing the other's claimed file, the entry clears on exit
- [x] tsc 5.x strict + noUncheckedIndexedAccess clean against `.claude-plugin/types/`
- [x] Live: two real `claude -p` sessions in one scratch folder: each sees the other, B is denied an Edit on a file A claimed, A's entry is gone after A exits (receipts/live-*)
- [x] README + RUNLOG updated; committed

## Which mod
`bws-cockpit`. Its README lists the old Repo Sessions pane (dropped in 0.10.0 for zero use); `hooks/peers.ts` keeps the engine-registry parsing. Nothing draws session lists today, so "keep its current display working" = the band, `/cockpit`, Loop Watch and every existing test unchanged.

## Interpretation
"Clipping" = two sessions editing the same file. Built as: the first live session to Edit/Write/NotebookEdit a file claims it; another live session's edit of it is denied.

## Design
**Bus file:** `<CLAUDE_CONFIG_DIR or ~/.claude>/bws-cockpit/bus/<folder-key>.json`. Folder = the git repo root (`$.session.repo().root`, the main tree for a worktree), else `$.session.root()`. Key = lowercased path with non-alphanumerics as `-`. Outside the repo: no git noise, no protected-path prompts.

**File shape:** `{ version: 1, folder, sessions: { [sessionId]: Entry } }`. Entry: `sessionId, cwd, startedAt, seenAt, status (busy|idle), task, run, lastFile, claims [{path, at}], outbox [{seq, to, text, at}]`.

**Write rule (no locks, no fs.delete in the API):** each session writes only its own entry: read → replace own entry, drop stale entries → write. It keeps its own entry in `$.state`, so a write lost to a race is restored on the next heartbeat (20 s). Exit = read → delete own entry → write.

**Liveness:** heartbeat every 20 s (`$.clock.every` from session.start). An entry with `seenAt` older than 90 s is stale: ignored by readers, pruned by the next writer. `session.end` (exit, /clear, resume, -p done) removes the entry at once.

**What a session is working on:** set on each user prompt (first line, secret shapes redacted, 100 chars), plus `status` busy/idle (prompt.submit / turn.complete), its run folder (the Finish-Line Guard's), and the last file edited. Claude can override it with `bus_status { task }`.

**Start notice:** `prompt.context` (once per conversation, so also after /clear and /resume) adds a `bwsBus` block: the other live sessions here (id, task, status, files claimed) and how to use the tools. Every session gets it, headless too.

**Tools (registered in session.start):**
- `bus_status { task? }`: peers + their claims + unread messages; sets own task when given.
- `bus_send { to, text }`: `to` = a session id (or its 8-char prefix) or `all`. Stored in the sender's outbox (last 20, 1 h).
- `bus_release { paths? }`: drop own claims (all, or these files).

**Delivery:** the heartbeat reads peers' outboxes for messages to this session it hasn't seen → toast for the person, and the text goes to the model as `context` on the next tool result (unmatched `tool.call` hook, mid-turn) or with the next prompt (`prompt.submit` context).

**Claims:** `tool.call` on Edit/Write/NotebookEdit: normalize the path (absolute, forward slashes, lowercase). If another live session holds a claim on it newer than `busClaimMinutes` (default 30) → `{ deny }` naming that session, its task and how to ask it (bus_send) or wait. Else claim it (written at once) and pass on. Never approves anything.

**State lifetimes:**
| Value | Where | Why |
|---|---|---|
| peers, claims, messages | bus file | shared across processes |
| own entry (task, claims, outbox, seq, read cursors, joinedAt) | `$.state` atom `bus`, keyed by session id | survives hot reload; a /clear or resume (new id) starts fresh |
| unread queue | same atom | delivered once |
| heartbeat timer | module (re-made by session.start on reload) | |

**Options:** `sessionBus` (true), `busClaimMinutes` (30).

## Tasks
- [x] T1 `hooks/bus.ts` pure: key, merge/prune, claim check, redact, inbox, text formatting + `tests/bus.test.ts`
- [x] T2 register.tsx wiring (session.start register+tools+heartbeat, session.end, prompt.context, prompt.submit, turn.complete, tool.call x2 + 3 tool handlers), types, manifest options
- [x] T3 plugin tests (two sessions over one shared fs map)
- [x] T4 validate + test + tsc receipts
- [x] T5 live two-session run + receipts
- [x] T6 README, version 0.12.0, RUNLOG, commit

## Parked (follow-ups, not built)
- Bash/PowerShell writes (`sed -i`, redirects) are not claim-checked: only Edit/Write/NotebookEdit.
- A band chip / `/bus` command showing peers.
- Live push via `$.session.send` instead of the next tool result/prompt.
- pid liveness (peers.ts tasklist) on top of heartbeat staleness.
- Heartbeat writes don't verify: one that lands on top of a peer's fresh claim can hide it for up to 20 s (until the peer's next write). A lock file or a per-session file would close it.
