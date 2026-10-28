# Changelog

## 0.2.0
- The Codex tab in the bws-cockpit dashboard (cockpit 0.29.1): `/codex`, or `/cx` where Desktop takes `/codex`. Every button has a `/codex --<id> [text]` twin.
- Jobs view: this repository's jobs with state, branch, diff stat and age; Diff (stat, Codex's message, patch file), Follow up, Cancel, Drop, and Merge, which puts the merge steps (with the stash warning for carried edits) in Claude's prompt box.
- Chat view on two engines. `api`, the default when the new sensitive `openaiApiKey` option is set: the OpenAI Responses API, `gpt-6.1-sol` low or fast `gpt-6.1-terra` none, background requests polled every second, stored and chained with `previous_response_id`. `codex`: a chat job in its own worktree (`codex/chat-<id>`), one Codex turn per message, never a wake.
- Each chat turn starts with a git capsule (`<workspace>`: branch, last commit, diff stat, dirty files) and a partner brief. Pull Claude attaches Claude's latest reply or recent turns; Send back puts an answer in Claude's prompt box.
- Key-shaped text is stripped from every error the chat shows.
- No more status line: `$.ui.status` draws as a `⚠` warning row under the prompt in this build. Running jobs show in the tab's badge (`1▶`), the Jobs view (with what Codex is doing) and the summary chip; a job's end still toasts.

## 0.1.0
- First version (M1, delegate core): `codex_delegate` and `codex_result` (always loaded), `codex_status`, `codex_followup` and `codex_cancel` (tool search).
- Each job runs `codex exec` in a mod-made git worktree on branch `codex/<id>`, under workspace-write with approvals off, the lean config and TEMP moved into the job folder; a detached supervisor commits each turn.
- The write tools go through Claude Code's permission prompt. A turn that ends while Claude is idle wakes it (at most once per 30 s); the status line shows running jobs.
