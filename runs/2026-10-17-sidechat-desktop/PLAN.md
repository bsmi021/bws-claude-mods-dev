# PLAN: bws-sidechat on the Desktop app

Brian (2026-10-17): "create a new mod that provides a side chat feature like we have for the cli" → picked "Fix sidechat on desktop" (no new mod).

## Finish line
- In the Claude Desktop Code tab, `/side <msg>` (and `/btw`) opens the Side chat pane, the fork answers in it, the Ask box sends a follow-up, Send to main works.
- Verified live in the real app with screenshot receipts in `receipts/`.
- Any fix: validate + plugin test + tsc green; version bumped; README "desktop not checked" replaced by what was tested.

## Steps
1. Reproduce live in a scratch Desktop session (computer-use), note what breaks.
2. Fix only what breaks.
3. Checks, README, commit.
