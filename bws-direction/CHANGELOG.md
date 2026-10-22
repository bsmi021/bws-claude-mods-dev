# Changelog

## 0.1.1
- Tell Claude works after /clear or /resume: it finds the verdict the tab shows (it looked under an empty session id and silently did nothing).
- Every Tell Claude press now answers in the tab: sending, sent, not sent (with the reason when the prompt is held), or no drift to tell.

## 0.1.0
- First release: per-turn drift checks against the session task, the run-folder PLAN.md and the docs/ corpus (specs, PRD, requirements, architecture or design docs as anchors; works for any project), verdicts kept per project, /direction overall over recent commits, a Direction dashboard tab, toast and optional nudge into Claude's context.
