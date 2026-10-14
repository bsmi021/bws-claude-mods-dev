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

## State at end of session
- Branch `feat/better`, pushed to `private` (bws-claude-mods-dev). Not merged to `main`. No PR opened yet.
- The `publish` branch has not been refreshed, so the marketplace install line works only after that.
- To use it today: `claude --plugin-dir C:/Projects/bws.mods.claude-code/bws-better`, or add that folder to `CLAUDE_CODE_PLUGIN_DIRS`.
- Fix after review: a failed pane open in the auto path resets the flow, so the pane can't sit on "Reading" for a prompt that was already sent. Checks re-run: 34 pass, validate passed, tsc exit 0.

## Assumption review (2026-10-14)
- You confirmed all ten assumptions (A1 to A10). No changes were needed.

## Release (2026-10-14)
- PR #10 merged into main (51d1214).
- The `publish` branch was refreshed with git restore from 51d1214. The file list and contents match main. The README lists bws-better, now twelve mods.
- Checks in the publish copy: validate passed, 34 tests pass, tsc exit 0. Pushed to mods/main as 9e8e854.
- Release bws-mods 1.2.0, tag v1.2.0: https://github.com/bsmi021/bws-claude-mods/releases/tag/v1.2.0

## Visual check (2026-10-14, drive-screen, Claude Code 2.1.300)
Screens are in `screens/`. Narrow: 72 columns, main screen, inline pane. Wide: 160 columns, fullscreen, pane docked beside the cockpit Dashboard.
- **Look, at both widths:** title and gold rule, tracker colours, gold badges turning to green checks, slate chips, the gold primary chip, muted Cancel, 3-row digits in rounded tiles, the "+" list, and the gold-outlined upgrade card all render as specified.
  - Narrow: the cards sit side by side.
  - Wide, docked at about 58 columns: the cards stack.
- **Works live:** automatic mode takes a typed prompt; clicks on chips; Enter on the focused chip; auto-advance to the rewrite; Cancel and the close mark put the prompt back without duplicating it.
- **Defect 1:** `/better <prompt>` at 72 columns fell back to "too narrow". The open is not awaited inside the `command.run` hook, so the engine treats it as unasked (144-column floor). The automatic path awaits the open inside its hook and was placed at 72 columns. Fix: await `openPane` in the command hook.
- **Defect 2:** after a drop the engine keeps the typed text in the box. The pane then gets no keyboard focus, and Enter in the box would take the same prompt again. Fix: empty the box once the pane has the prompt (Cancel already puts it back).
- **Note:** the inline pane is about 10 rows tall in a 38-row window, so questions 2 and 3 need a scroll. The `rows: 30` request is capped by the layout.
- The first attempt sent `C:/Program Files/Git/better ...` (Git Bash path conversion when typing through the driver). The driven Opus only replied in text; I stopped it. No files changed.
