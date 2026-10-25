# Changelog

## 0.2.0
- Drift is judged against the opening request: the first thing you asked for in the session. Only steps unrelated to it are drift; follow-ups, confirmations, fixes, release and publish steps toward that goal are aligned, however long the conversation runs.
- The check reads the whole conversation: every later prompt with the files its turn edited and the head of its answer (about 16,000 characters; the middle turns go first, the start and the newest always stay). Before it saw only the first prompt and the latest three.
- Turn checks run on Sonnet by default (was Haiku); the timeout is 45 s (was 20 s).
- A drift verdict warns and lets the work continue: the note Claude gets asks it to carry on and mention the drift in one line, not to stop first.
- The plan and docs/ explain what the opening goal means; silence or a mismatch there is no longer drift by itself.

## 0.1.2
- No behaviour change. Ships the shared tab module with the new markdown and picture nodes (bws-cockpit 0.27.0).

## 0.1.1
- Tell Claude works after /clear or /resume: it finds the verdict the tab shows (it looked under an empty session id and silently did nothing).
- Every Tell Claude press now answers in the tab: sending, sent, not sent (with the reason when the prompt is held), or no drift to tell.

## 0.1.0
- First release: per-turn drift checks against the session task, the run-folder PLAN.md and the docs/ corpus (specs, PRD, requirements, architecture or design docs as anchors; works for any project), verdicts kept per project, /direction overall over recent commits, a Direction dashboard tab, toast and optional nudge into Claude's context.
