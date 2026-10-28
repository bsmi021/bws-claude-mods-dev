# Changelog

## 0.1.0
- First version (M1, delegate core): `codex_delegate` and `codex_result` (always loaded), `codex_status`, `codex_followup` and `codex_cancel` (tool search).
- Each job runs `codex exec` in a mod-made git worktree on branch `codex/<id>`, under workspace-write with approvals off, the lean config and TEMP moved into the job folder; a detached supervisor commits each turn.
- The write tools go through Claude Code's permission prompt. A turn that ends while Claude is idle wakes it (at most once per 30 s); the status line shows running jobs.
