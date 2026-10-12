# D0 — Manual checks

Dry run (synthetic). There is no device, no UI and no gate. Brian checks by reading the files in this run folder.

- [ ] `hello.txt` has exactly two lines: `hello from the D0 worker`, then `blue`.
- [ ] `TASKS.md`: T01 to T03 are all `[x]`, `Status: DONE`, and N1 is `[x]`.
- [ ] `ANSWERS.md`: the N1 answer is `blue`. It is marked as a fixture answer, not from the user. Confirm that is acceptable for a dry run.
- [ ] Nothing outside `runs/2026-10-12-mods-harness/dryrun-d0/` was changed by this run. No commit was made (the dry-run prompt says do not commit).
