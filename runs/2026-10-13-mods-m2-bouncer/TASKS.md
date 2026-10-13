# M2 — Prompt bouncer
Status: IN_PROGRESS
Session: 1

## Tasks
- [x] T01 [FR-PB-01] Implement, with tests: Option `bounce` in bws-enhance: `off` (default), `warn` (show the reason, send anyway after one more Enter), `block` (do not send; the draft stays in…
- [x] T02 [FR-PB-02] Implement, with tests: A `prompt.submit` hook (merged with bws-enhance's existing one, if any) classifies the prompt `clear` or `vague` with the small model. It skips: slas…
- [x] T03 [FR-PB-03] Implement, with tests: On `vague`: one short reason (what is missing, in one sentence, at most 40 words) from a second small-model call that also receives the glossary. The…
- [x] T04 [FR-PB-04] Implement, with tests: Glossary: option `glossaryFile` (default: look for `docs/GLOSSARY.md`, then a `## Glossary` section of `AGENTS.md` or `CLAUDE.md`). Capped at 4,000 c…
- [x] T05 [FR-PB-05] Implement, with tests: Fails open (FR-ALL-03): classifier error or a 4 s timeout sends the prompt unchanged. Costs: at most two small-model calls per prompt; none when `off…
- [x] T06 [FR-PB-06] Implement, with tests: bws-enhance README documents the mode; version bumped (minor).
- [x] T07 [AC-PB-01] Verify, saving the receipt under the run folder's receipts/: `claude -p` probe: a vague prompt under `block` is refused with the reason; a clear one passes. (evidence: `receipts/m2-probe.json`)
- [ ] T08 [GATE] With everything committed, `python tools/mods-harness/harness.py gate` passes. It runs `python tools/mods-gate.py` (validate, plugin test and tsc strict for ALL plugins, 35 s) and is this mod's one regression run; the harness reuses its receipt. During work, run `python tools/mods-gate.py --plugin <name>` as often as you like.
- [x] T09 [MANUAL] Write MANUAL-CHECKS.md in the run folder: numbered checks Brian must do in a real interactive session (panes, keys, live model output), each with the exact command to run and the expected result, and the Claude Code version and surfaces you tested. Do not wait for an answer; the loop does not pause on this.
- [x] T10 [HANDOFF] Final HANDOFF.md and RUNLOG.md written and committed.

## Needs Brian

