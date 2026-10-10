# PLAN: bws-notify passes tsc

## Finish line
tsc (strict, noUncheckedIndexedAccess) is clean for bws-notify, validate passes, `claude plugin test` passes; committed on main.

## Tasks
- [x] T1 Extensionless relative imports in hooks/register.ts and tests/notify.test.ts (TS5097)
- [x] T2 The four strict-index errors tsc then reports in tests/notify.test.ts
- [x] T3 Three checks, receipts, commit
