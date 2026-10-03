# PLAN: Repo Sessions pane (bws-cockpit 0.6.0)

Brian's ask: "show me any other claude code sessions open in the same repository in a window on the right of the claude code console".

## Finish line (all true, with receipts in this folder)
1. A docked pane (right of the transcript in the fullscreen layout, which Brian runs: `tui: fullscreen`) lists every *other* live Claude Code session whose cwd is in the same git repo as this one (same common git dir, so worktrees count; outside git, the same folder).
   - per session: name, status (busy / idle / shell / as given), how long in that status, kind when not interactive, where it runs when not the repo root, when it started
   - interactive sessions first; `claude -p` workers listed after, marked
   - empty state: "No other sessions in this repo"
2. `/repo-sessions` (`/peers` is a built-in: it lists every session on the machine) toggles the pane; without a surface (`-p`) it replies with the same list as text.
3. Auto-open: when a new interactive peer appears, open the pane unasked (fullscreen only; the engine seats it from 144 columns). Closing it keeps it closed until another new peer appears. userConfig `peersAutoOpen` (default on), `peersPane` (feature on/off).
4. Source: `~/.claude/sessions/<pid>.json` (honors CLAUDE_CONFIG_DIR). Dead pids filtered with one `tasklist` call, cached per pid+procStart for 45 s; a failed check keeps the session. `.key` files never read.
5. Validate clean, `claude plugin test` green, tsc strict clean, README updated, version 0.6.0.
6. Live receipt: a second interactive session in this repo launched via wt.exe, screenshot of the docked pane; `claude -p "/repo-sessions"` text receipt.

## Parked follow-ups
- Last prompt / current activity per session (read the peer transcript tail).
- Message button per peer ($.session.send to its sessionId).

---

# PLAN 2 (2026-10-02): latest prompt per peer + other repos section (bws-cockpit 0.7.0)

Brian's ask: "show each peer's latest prompt under its row in the repo-sessions pane. As well add a section to the bottom to show all other sessions in different repos".

## Finish line
1. Each same-repo peer row gets a dim `› <latest prompt>` line: first line of its newest entry in `<config dir>/history.jsonl` (`display`, matched by `sessionId`), cut to the pane width. No line when the session has no prompt there (e.g. `-p` workers).
   - history.jsonl (~5 MB) is read only when its mtime/size changes, scanned from the end; JSON parsed only for wanted ids.
2. A bottom section "Other repos · N" lists every other live session not in this repo, grouped under its repo name: status mark, name, status + time; worker kind marked. No prompts there.
3. Text fallback (`claude -p "/repo-sessions"`) carries both: prompt lines and the other-repos list.
4. Auto-open still triggers only on same-repo interactive peers.
5. Validate clean, tests green (new: prompt parsing, wanted-only scan, other-repos grouping, pane both surfaces, text), tsc strict clean, README + version 0.7.0, live receipts (headless text + Brian's eye on the pane).

---

# PLAN 3 (2026-10-02): message button per peer (bws-cockpit 0.8.0)

Brian's ask: "a message button on each peer row in the repo-sessions pane that sends it a message via $.session.send".

## Finish line
1. Each same-repo peer row has a `msg` Button. Pressing it opens an Input under that row (one at a time; pressing `msg` again closes it). Enter sends the text with `$.session.send({ to: { sessionId }, text })`; empty Enter cancels.
2. Result under the row: `✓ sent` or `✗ <reason>` (the engine's reason, or a thrown error's message), with age; it clears after 60 s. Input closes on success, stays open on failure.
3. Surfaces with no Input (mobile): no `msg` button.
4. Other-repo rows: no button (not asked).
5. Validate clean, tests green (open/close compose, send argv, delivered, refused, threw, empty cancel, no Input surface), tsc strict clean, README + 0.8.0.
6. Live: a real send from this session to `repo-sessions-check` lands in its transcript (session_watch / transcript read). Brian eyes the button.

---

# PLAN 4 (2026-10-02): msg delivery states (bws-cockpit 0.9.0)

Brian's ask: "make the msg button in the repo-sessions pane show held, released and expired instead of just ✓ sent".

## Probe result (receipts/notice-probe.log)
- Notices reach the SENDING session on `prompt.submit`, origin `{kind:'unclassified'}`, ~0.5 s after `$.session.send` resolves `{isDelivered:true}`.
- Captured wording (first sentence decides the state):
  - held, batched: "2 of your messages to another session were held by that session (recipient: uds:<pipe>; msg_id: <a>, <b>)"
  - held, single: "Your message to another session was held by that session (...)"
  - released: "Your message to another session was approved and released to that session (...)"
  - denied: "Your message to another session was denied by the recipient user (...)"
  - expired: not seen.
- Recipient pipe = the peer's registry `messagingSocketPath`.

## Finish line
1. Under the peer row, the latest pane send shows its state:
   - sending
   - ✓ sent (queued, no hold)
   - ◆ held (waiting for approval there)
   - ✓ approved and delivered
   - ✗ denied by the recipient
   - ✗ expired, not delivered
   - ✗ <send refusal or error>
   - otherwise the notice's first sentence as-is
2. Held never fades. Final states fade after 60 s.
3. Correlation:
   - A pending send (pipe, sessionId) is written before `$.session.send` is awaited, so the order of result and notice does not matter.
   - A notice binds by `msg_id` when it has one, otherwise to the oldest unbound pending send to that pipe.
   - Batched ids bind in order.
   - A notice with no pending pane send (for example, one the model sent) is ignored.
4. Observe only: a matched `prompt.submit` hook returns `next(e)` unchanged. The existing unmatched hook is untouched.
5. Three checks green with tests:
   - parse: real held (batched and single), released and denied texts; held does not misread; unknown wording falls back.
   - bind: by order, then by id.
   - hook: held survives 60 s+, released, then fades; denied; unmatched notice ignored; prompt.submit passes through.
   - README, 0.9.0.
6. Live: the pane's real notices, after Brian presses `msg` toward a default-mode session.
