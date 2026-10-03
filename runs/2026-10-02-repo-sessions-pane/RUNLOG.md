# RUNLOG: Repo Sessions pane

## Objective
Show the other Claude Code sessions open in the same repo in a pane to the right of the console. See PLAN.md for the finish line.

## Done
- Data source: Claude Code's own registry, `~/.claude/sessions/<pid>.json`, which holds cwd, name, status, kind and updatedAt. No heartbeat of our own was needed.
- `bws-cockpit/hooks/peers.ts` (pure): record parse, repo key (the common git dir, so worktrees match), `whereIn`, tasklist parse, sort, text.
- `register.tsx`:
  - `/repo-sessions` toggles the pane, and replies as text when headless.
  - The `repo-sessions` Pane renders the list.
  - A 5 s poll runs in the existing `session.start` and auto-opens the pane once per new interactive peer, in fullscreen only.
  - The fullscreen state is recorded from the band and pane renders.
- `/peers` is a Claude Code built-in. The first live run showed it shadowing ours, so the command was renamed `/repo-sessions`.
- Types: `PeerView`, `PeersView`, and the `peers` and `peersAnnounced` state.
- userConfig `peersPane` and `peersAutoOpen`. Version 0.6.0. README updated.

## Evidence
- `receipts/test.txt`: 110/110.
- `receipts/validate.txt`: passed.
- `receipts/tsc.txt`: tsc 5 strict, exit 0.
- `receipts/live-repo-sessions-p.jsonl`: a headless `/repo-sessions` here listed `bws-mods-claude-code-1d: busy 9m` and excluded itself and the 4 sessions in other repos.
- `receipts/live-peers-p.jsonl`: shows that `/peers` is the built-in.

- Advisor review found two bugs, both fixed with failing-first tests:
  - The pane reopened 5 s after a manual close. Peers shown while it was open are now marked as seen.
  - A crashed session's pid reused by another program read as alive. It now has to run the same image as this session.
- Live, interactive: `launch-peer.ps1` opened `repo-sessions-check` in a new maximized wt window, with no keystrokes sent.
  - `receipts/live-two-peers-p.jsonl`: headless `/repo-sessions` listed both interactive peers.

- Brian confirmed the pane docked on the right in fullscreen.

## Session 2: latest prompt per peer, plus an Other repos section (0.7.0)
- Prompts come from `~/.claude/history.jsonl`, which has one `{display, timestamp, project, sessionId}` line per prompt.
  - `latestPrompts` scans from the end and parses JSON only for the session ids it wants.
  - It is cached by size and mtime.
- The first live run showed no prompt. The cause: `$.fs.read` rejects files over 4 MiB, and the real history.jsonl is 4.99 MB.
  - Fix: `readTail` reads the file whole when it is 4 MiB or less. Otherwise it takes the last 1 MiB through a PowerShell FileStream seek, opened read-shared, with a `tail -c` fallback.
  - A test covers the big-file path and the cut first line.
- Other repos: every other live session not in this repo, grouped under its repo's folder name, sorted by repo then status.
  - Shown in the pane and in the text fallback.
  - These rows have no prompt lines.
- Evidence:
  - `receipts/test.txt`: 114/114.
  - `receipts/validate.txt` and `receipts/tsc.txt`: clean.
  - `receipts/live-prompts-others-p.jsonl`: the real peer with its latest prompt, then 5 sessions in other repos.

- Advisor review:
  - Bare slash commands (`/repo-sessions`, `/clear`) are skipped as "latest prompt". Ones with arguments are kept. Tested.
  - With the pane closed, the poll does not read history.jsonl, so there is no PowerShell spawn per prompt machine-wide. Tested.
  - `receipts/ps-tail-utf8.txt`: the real PowerShell tail returns exactly 1 MiB with no mojibake. `D1–D10` is intact.
- Live: `launch-peer.ps1` now gives the peer a first prompt (`reply with just: ok`).
  - `receipts/live-prompts-others.txt`: both peers here show their latest prompts, and 5 sessions in 5 other repos are grouped below.

- Brian confirmed the prompt lines and the Other repos section.

## Session 3: msg button per peer (0.8.0)
- Each same-repo peer row has a `msg` Button. It opens an Input under that row, one at a time; pressing `msg` again closes it.
- Enter calls `sendToPeer`, which sends `$.session.send({ to: { sessionId }, text })`. Empty input closes the Input.
- The outcome stays under the row for 60 s: `✓ sent`, or `✗ <reason>`.
  - The Input closes on delivery and stays open on a refusal or error.
- State: `peerCompose` (which peer's Input is open) and `peerNote` (the last outcome), declared in types.
- Mobile: the element type has no `Input`, but `'Input' in table` was true at runtime in the test kit.
  - So the pane also checks `e.surface !== 'mobile'`.
  - The Loop Watch pane narrows Select and Input with `'in'` alone. It may have the same latent issue: parked, not touched.
- Evidence:
  - `receipts/test.txt`: 119/119.
  - `receipts/validate.txt`: clean.
  - `receipts/tsc.txt`: clean.
  - `receipts/live-send-probe.jsonl`: a scratch probe mod (`send-probe/`) ran `$.session.send({ to: { sessionId } })` headless to the live `repo-sessions-check` and got `{"isDelivered":true}`.
    - The peer's transcript has the text as a `<cross-session-message ... from-plugin="send-probe">`, and the peer answered "received".
    - Its reply could not route back because the probe session had already exited, which is expected.

## Next
- Brian presses `msg` in the pane and sends one message: the button-press path by eye.

## Session 4: Loop Watch mobile fix
- A new test fails first on the old code. It renders the paused loop, with two loops, on `mobile`:
  - The loop picker is gone.
  - The answer command is missing. The `<Input>` was drawn because `'Input' in table` is true at runtime, and mobile dropped it, so the fallback text never showed.
- Fix: the Loop Watch pane narrows Select and Input with `e.surface !== 'mobile'` as well.
  - On mobile the need shows its `harness.py answer` command as text.
  - The same test checks that the terminal still gets the picker and the Input.
- AGENTS.md: corrected the gotcha line that recommended `'Input' in table` alone.
- Evidence: `receipts/test.txt` 120/120; validate and tsc clean.
