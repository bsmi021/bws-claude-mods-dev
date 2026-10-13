# D0 — Harness dry run (synthetic)
Status: DONE
Session: 3

## Tasks
- [x] T01 [DRY] Create `hello.txt` in the run folder containing `hello from the D0 worker`.
- [x] T02 [DRY] Add a Needs item `N1 (question) Which colour should hello.txt end with, red or blue?`, set Status to NEEDS_USER and end the session. After it is answered, append the colour to hello.txt.
  - Session 1: N1 filed and Status set to NEEDS_USER. The colour is still to be appended after Brian answers N1 (see ANSWERS.md).
  - Session 2: N1 answered `blue` in ANSWERS.md. Appended `blue` as a new line to hello.txt and read it back: `hello from the D0 worker` / `blue`.
- [x] T03 [DRY] Write HANDOFF.md and RUNLOG.md in the run folder, then set Status: DONE.
  - Session 1: HANDOFF.md and RUNLOG.md written. Status DONE waits until T02 is ticked and N1 is answered.
  - Session 2: T02 ticked and N1 answered, so HANDOFF.md and RUNLOG.md are rewritten for session 2 and Status is set to DONE.
  - Session 3: VERIFY-FAIL (MANUAL-CHECKS.md missing) fixed by adding MANUAL-CHECKS.md. HANDOFF.md and RUNLOG.md rewritten for session 3.

## Needs Brian
- [x] N1 (question) Which colour should hello.txt end with, red or blue?
  - Answered `blue` in ANSWERS.md (marked there as a fixture answer). Applied in session 2.
