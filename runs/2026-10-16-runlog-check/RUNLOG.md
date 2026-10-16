# RUNLOG: bws-cockpit 0.19.0, Finish-Line RUNLOG check (bws-mods 1.5.0)

## Brief
From the game project's week review (its T7): flag run folders a session wrote that have no RUNLOG.md. Seven task folders were left without one in a week.

## Finish line
- A stop is blocked (bounded by `finishLineMaxContinues`, never on a hand-back or with background work pending) while a run folder this conversation's own tool calls wrote has no RUNLOG.md.
- Harness report folders (`-harness`, `-sessions`) are exempt. Open items still come first.
- Option `finishLineRunlog` (default true). The three checks pass; released and published.

## Done
- `finish.ts`:
  - `isReportFolder` and `missingRunlogIn` (pure; newest folder name first; a folder that no longer exists is skipped);
  - `decide` gets `missingRunlog` and a `runlog` kind between open items and the evidence check.
- `register.tsx`:
  - `missingRunlogFolder($)` lists each folder in `touched` (this conversation's own writes). This also covers a folder with no checklist files, which `readRunFolder` never returns.
  - `classic.Stop` runs the guard when either check has something; the toast is "finish line: <folder> has no RUNLOG.md".
- Manifest: `finishLineRunlog` userConfig and version 0.19.0. README: the feature bullet and the options row. Marketplace: 1.5.0.
- Tests:
  - The test world now has a RUNLOG.md by default (`runlog: null` = none).
  - 7 new tests: pure rules; block then the toast; open items first; hand-back; option off; a folder with only a script; report folder exempt.

## Checks (receipts/)
| Check | Result |
|---|---|
| `claude plugin validate ./bws-cockpit` (2.1.296) | passed (`validate-bws-cockpit.txt`) |
| `claude plugin test` | 211/211 (`test-bws-cockpit.txt`) |
| tsc 5.8.3, strict + noUncheckedIndexedAccess | clean (`tsc-bws-cockpit.txt` empty) |

Not checked live in a terminal session.

## Release
- See the git log: feat/runlog-check merged into main, pushed to private; the publish branch refreshed and pushed to mods; tag v1.5.0.
