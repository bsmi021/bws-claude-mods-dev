# M2 prompt bouncer: run log

## Session 1 (2026-10-13, worker, Haiku 5.5, Claude Code 2.1.296, Windows)

**Objective.** Build the prompt bouncer in bws-enhance (FR-PB-01 to FR-PB-06, AC-PB-01) under the fixed task list in
TASKS.md. Done means every task ticked, the probes saved, the plugin gate green, and the harness gate passing on the
committed tree.

**Spec conflict, decided.** FR-PB-02 says skip headless runs. AC-PB-01 needs a `claude -p` refusal under `block`.
Both cannot hold literally. Decision (assumption A1): `warn` skips headless runs (no pane for send anyway); `block` checks
them and refuses with the reason. Recorded as an assumption; no Needs item, because the rule is settled by the AC and
the reversal is one line.

**Actions.**
1. Read the spec, the three AGENTS.md files, the earlier handoffs (M0 kit, M1 cache clock), bws-enhance's source and tests,
   and the generated types for `prompt.submit`, `model.classify`, `model.complete`, `prompt.read/fill/submit`, `ui.log`.
2. Vendored `classify-fork` and `summary` from bws-kit into bws-enhance (`kit.json`, `python tools/sync-kit.py`).
3. Wrote `hooks/bounce.ts` (pure) and merged the bouncer into the existing `prompt.submit` hook, with `/bounce`
   (a new matched `command.run`), the `bounced` pane branch, and the summary atom in register.tsx.
4. Wrote `tests/bounce.test.ts` (26 tests: table tests and mod tests). The existing `enhance.test.ts` is unchanged.
5. First gate run: 4 failures. Cause: the `ui.log` stub needs `{ value }`, and classify-fork's request type has no
   `system` field (fixed by putting the rules in front of the prompt, kit unchanged). Second run: all 44 green.
6. Added tests for the Enhance button, glossaryFile, the AGENTS.md glossary fallback and the two-call cap: 47 green.
7. README 0.3.0, plugin.json 0.3.0 (new options `bounce`, `bounceModel`, `glossaryFile`), types declared inline.
8. Probes (`python tools/probe.py`, Claude Code 2.1.296, headless, settings: `bounce: block`):
   - `receipts/m2-probe.json`: the vague prompt is refused. The system line reads `Prompt dropped by a hook: Held by bws-enhance: ...`.
     Exit 0, `num_turns` 0.
   - `receipts/m2-probe-clear.json`: a clear prompt passes. The model answers `bounce probe ok`, one turn, no drop.
   The first vague probe also showed the headless hint was wrong (it said "use Send anyway in the pane"). I fixed it
   (headless gets "Edit it and send it again."), re-ran the tests, and re-ran the vague probe. The clear probe ran on
   the same probe path after that fix.
9. Two small edits after the probes, both off the probe path: `ui.close` now re-publishes the summary atom, and a failed
   deferred pane update writes one debug line. Neither changes what the probe shows. The gate ran on the final code.
10. Shelved the cockpit chip follow-up as idea #21 (bws-enhance is not in cockpit's `modSummaries` default).

**Receipts** (`receipts/`).
- `t01-05-plugin-gate-run2.txt`, `t01-05-plugin-test.txt`, `t01-05-plugin-test-run2.txt`: test runs 1 to 3 (run 1 failed, see step 5).
- `t07-plugin-test-run3.txt`: 47 pass, 0 fail, after the headless hint fix.
- `t06-validate.txt`: `claude plugin validate` passes. Hooks: session.start, command.run enhance and bounce, prompt.submit,
  ui.close, ui.render (SessionMode, Pane). State: view, setting, summary.
- `t08-pre-gate-plugin.txt`: `mods-gate.py --plugin bws-enhance` ok after the review fixes.
- `m2-probe.json` (+ stdout), `m2-probe-clear.json` (+ stdout), `probe-block-settings.json`.

**Outcomes.**
- All ten tasks ticked; the harness gate passed (see Gate below). bws-enhance 0.3.0. 47 plugin tests pass.
- AC-PB-01 is met headless: the vague prompt is refused with the reason; the clear prompt passes.
- Existing tests unchanged (`git diff` of `tests/enhance.test.ts` is empty). Other plugins are untouched.
- Summary atom published (FR-ALL-05). No cockpit chip by default (parked as #21).

**Not verified.** The interactive pane (buttons, keys, the draft going back into the box, narrow terminals) and Desktop.
These are MANUAL-CHECKS.md, which Brian runs.

**Chronicler.** Not consulted. The bouncer is tooling, not TMS story, lore, dialogue or a published artifact.

**Pending jobs.** None.

**Gate.** `python tools/mods-harness/harness.py gate` on the committed tree (HEAD 661291f, run folder docs only after): PASS at 08:49, receipt `receipts/t08-harness-gate.txt`. The first attempt was refused because I had written the gate log into the repo (dirty tree); no gate ran. Status set to DONE.
