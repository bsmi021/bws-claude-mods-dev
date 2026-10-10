# RUNLOG: bws-notify 0.1.1 passes tsc

## Brief
This is a follow-up parked in `runs/2026-10-10-mods-release`: bws-notify's `./text.ts` imports failed tsc with TS5097.

## Done
- Relative imports are now extensionless, `./text` and `../hooks/text`, as in bws-cockpit and bws-shell-lint. Claude Code loads them either way.
- With TS5097 gone, tsc reported 4 strict-index errors in `tests/notify.test.ts`, all on `w.launches[...]` indexing. Fixed with destructuring defaults, `?.[4] ?? ''` and `l[4] ?? ''`. No assertion changed.
- Version 0.1.1; the README's Static line now names the tsc check.

## Checks (receipts/)
- tsc 5.9.3, strict + noUncheckedIndexedAccess: clean (`tsc.txt`). Before the fix: 2 × TS5097 and 4 strict-index errors.
- `claude plugin test`: 12/12 (`test.txt`)
- `claude plugin validate ./bws-notify`: passed (`validate.txt`)

## Next step
None. The publish branch carries bws-notify 0.1.0; refresh it when Brian asks.
