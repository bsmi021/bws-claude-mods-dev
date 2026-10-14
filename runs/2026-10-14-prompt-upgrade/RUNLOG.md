# RUNLOG: Prompt Upgrade (bws-better)

## Brief
Build a Claude Code mod that upgrades a rough prompt before it is sent. It opens a pane with four steps (Your prompt, Questions, Rewrite, Review), takes up to three multiple-choice questions, and shows the original and the upgrade side by side. Nothing runs until Run. It adds `/better`, `/better on|off` and `/better history`. Also add it to `.claude-plugin/marketplace.json`.

## Done (2026-10-14)
- `bws-better/`: manifest (`model` option, default haiku), `hooks/register.tsx` (the only `$` user), `hooks/lib.ts` (pure), `types/index.d.ts` (state contract), README.
- Tests: `tests/lib.test.ts` and `tests/better.test.ts`, 34 tests, all pass. They cover:
  - which prompts are taken and which pass
  - reading the questions and reading the rewrite
  - /better to Run, plus history reopen
  - Cancel restores the prompt, including text typed meanwhile
  - the error card: Try again, Send my original
  - on/off
  - the no-loop guard
  - the narrow-window fallback
  - reload mid-step
  - /better alone
  - headless
  - the review at 40 and 160 columns
- Marketplace: `bws-better` added; metadata version 1.1.1 → 1.2.0.

## Receipts
- `receipts/validate.txt`: `claude plugin validate ./bws-better` passed.
- `receipts/plugin-test.txt`: 34 pass, 0 fail.
- `receipts/tsc.txt`: tsc 5.8.3 strict, exit 0.
- `receipts/live-headless.jsonl`: `claude -p "/better write a blog post about our new release"` with real haiku output. It used placeholders and invented no facts.

## Not verified
- The pane in a real terminal window: colours, chips, tiles, focus. Layout was only checked through the test kit.
- Automatic interception live: `-p` prompts have origin `sdk`, not `composer`. It is covered by tests only.
- A person's Esc or close mark mid-upgrade restoring the prompt. The test engine cannot raise `ui.close`; the code path exists.
- What the `{ drop }` line looks like when automatic mode takes a prompt. The engine always shows a drop reason; it is kept to one line.

## Next
- Optional: open a real terminal, run `/better` at a narrow and a wide width and screenshot it.
