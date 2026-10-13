# bws-memory

After a turn, a small model decides whether you said something worth remembering (a preference, a correction, a fact
about you or the project, a decision, a pointer to an outside resource). If yes, a fork of the session is asked for
memory entries as JSON and this mod writes them as files, in the background. The main session never does that work and
never waits for it.

## How it works

- **Which turns.** On each finished turn the last exchange (your message and the final answer) goes to one small-model
  classify call (`yes` / `no`). Skipped without any call: a turn whose message has fewer than `minWords` words and used
  no tools, headless runs, a subagent's turn, a turn that did not end in an answer (interrupted, refused, API error), and
  any turn while a previous memory run is still going.
- **The fork.** On `yes`, `$.model.fork` (the same prompt cache as your session) is asked for entries as JSON: file name,
  name, description, type (`user`, `feedback`, `project`, `reference`) and body. The prompt lists the existing files'
  names and descriptions so the fork reuses a file's name to update it instead of adding a duplicate.
- **The write.** A fork has no tools, so the mod writes. Each entry becomes `<memoryDir>/<slug>.md` with this
  frontmatter, plus one line in `MEMORY.md`:

  ```
  ---
  name: prefers-tabs
  description: The user wants tabs, not spaces
  metadata:
    type: feedback
  ---

  Use tabs. ...
  ```

  An entry that matches an existing file (same file name, or same name) updates it; the same text again is refused as a
  duplicate and nothing is written. At most 5 entries per run.
- **Redaction.** Before anything is written, keys, tokens, passwords, bearer tokens, private-key blocks, JWTs,
  `user:password@` URLs and long mixed-case key-shaped strings are replaced with `[redacted]`. A reply that is half or
  more secret characters (or has a body that is only redaction) is dropped whole.
- **What you see.** While the run is going the summary atom reads `memory updating` (bws-cockpit draws it as a chip).
  When files changed, a closable pane lists each file with `+added -removed` lines; closing it clears the chip. A failed
  run shows `memory not saved` with the step that failed; nothing is written. Failures write one debug-log line that
  never carries your text.
- **Fail open.** A classifier error, a fork error or timeout (90 s), an unreadable reply or a write error leaves the
  session as it was. The classifier call times out after 15 s. A fork cannot be cancelled, so a timeout only stops
  waiting for it.

## Commands

| Command | What it does |
| --- | --- |
| `/remember <text>` | Forces an entry from `<text>` (no classifier). With a screen it runs behind and opens the pane; headless it runs before the command returns. With no conversation to fork (a first command, or right after `/clear`) it asks a model with the text alone. |
| `/memories` | The last 20 writes, newest first, each with the session it came from (kept in `sources.json` beside the files). |
| `/dream` | Consolidates the memory (see DreamPath below): shows a plan first. `/dream apply` plans and applies in one command (or applies the plan that is waiting), `/dream undo` restores the latest backup, `/dream status` says what waits and how many turns are counted. |
| `/memory-undo` | Restores the previous version of the files the last write changed, plus `MEMORY.md` and `sources.json`. One level deep. A file the write created is emptied, not deleted (a mod has no delete); its index line is gone. |

## DreamPath: consolidating the memory

Every so often the memory is tidied the way a "dream" would: duplicates are merged, stale or contradicted entries are
dropped, and entries are rewritten for clarity. Nothing changes until you press Apply.

- **The plan.** `/dream` reads every memory file and `sources.json` and asks `$.model.fork` (or `$.model.complete` when
  there is no conversation to fork, e.g. headless) for a plan of `merge`, `remove` and `rewrite` actions, each with a
  reason. A pure check rejects the plan (nothing changes) when it names a file that is not in the folder, uses a file
  in two actions, or removes more than 40% of the files. A merge is not counted as a removal. Only non-empty `.md`
  files up to 4,000 characters are shown to the fork (at most 40); longer ones are left alone. Secrets in the rewritten
  text are `[redacted]`.
- **Preview first.** On a screen a pane ("Dream") lists each action with its reason and the sessions its files came from,
  with Apply and Dismiss. Headless, `/dream` prints the plan and changes nothing; `/dream apply` (also `--apply`) plans
  and applies in one awaited command.
- **Apply.** The whole folder (every `.md`, `MEMORY.md`, `sources.json`) is first copied to
  `<memoryDir>/.dream-backup/<UTC timestamp>/`, then the changes are written. A mod has no delete, so a removed or
  merged-away file is emptied and its `MEMORY.md` line dropped. Apply refuses if a file in the plan changed after the
  preview. `/dream undo` puts back the newest backup (once; run it again for "already restored"). A dream also clears
  `/memory-undo`'s record, which would undo into a folder that is gone.
- **Sources.** A file's sessions are its rows in `sources.json`. The plan prompt lists them, a merge moves the
  merged-away files' rows to the surviving file (so it carries the union), and the pane shows them per action
  (`from: aaaa1111, bbbb2222`).
- **Automatic.** After every `dreamEveryTurns` answered turns of yours (default 20; headless runs, subagents and
  interrupted turns do not count) and before a compaction (`session.compact`, `manual`, `auto` or `plugin` triggers of
  the main conversation; `precompute` is ignored), the dream is due: the summary atom reads `dream due` and a
  **preview** starts in the background and opens the pane. It never applies on its own, and it waits if a memory update
  is running. Nothing is started with fewer than two memory files or with a plan already waiting. A failed automatic
  dream stays quiet (no pane, one debug line) and leaves `dream due`. `dreamEveryTurns` 0 turns both triggers off. The
  turn counter is temporary: it resets on a reload, `/clear`, `/resume` and `/branch`.
- **After `/clear`, `/resume`, `/branch`.** A dream that was planning is dropped (its reply is never applied), a plan
  on screen is closed and the dream stays `due`.

## After `/clear`, `/resume`, `/branch` (remembering)

- `/clear` and `/resume` (the `session.end` reasons `clear` and `resume`) start no work. They reset the running-fork
  guard, clear the view and close the pane. A fork that was still running is not cancelled (it cannot be) but its reply
  is dropped: nothing from a conversation that is gone is written.
- `/branch` has no event of its own. The mod notices a changed session id on the next turn or command and resets the
  same way.

## Options (`/plugin` → bws-memory)

| Option | Default | Meaning |
| --- | --- | --- |
| `memoryDir` | empty | Where files go. Empty means `<project>/.claude/bws-memory`, a folder this mod owns, so it never collides with the built-in memory. A relative path is under the project. |
| `minWords` | `8` | A turn whose message is shorter than this and used no tools is not looked at. |
| `dreamEveryTurns` | `20` | Every N answered turns, and before a compaction, the memory is due a dream (a preview, never applied on its own). `0` turns the automatic dream off. |
| `model` | `haiku` | The model that decides whether a turn is worth remembering. The writing fork uses your session's own model. |

## Summary atom

`{ plugin: 'bws-memory', key: 'summary' }`: nothing when idle, `memory updating` (busy) while a run is going,
`memory: N files` (ok) while the pane is open, `memory not saved` (warn) after a failed run. DreamPath adds `dreaming` (busy), `dream due` (ok: the trigger fired, or its
plan is waiting), `dream preview` (ok: a plan from `/dream` is waiting), `dream applied` and `dream failed` (warn); the
memory chips come first. bws-cockpit lists
`bws-memory` in its default `modSummaries`.

## Capabilities used

`turn.complete` (returns at once; the work starts after it through `$.clock.after`), `session.compact` (observe only; returns `next(e)` at once), `session.end`, `command.run`
(`/remember`, `/memories`, `/dream`, `/memory-undo`), `ui.render` and `ui.close` for the pane, `$.model.classify`,
`$.model.fork`, `$.model.complete` (only as the fork's fallback), `$.session.*` (id, cwd, messages, surfaces, model),
`$.fs.read`, `$.fs.write` and `$.fs.list` on the memory folder only (and its `.dream-backup/`), `$.state`, `$.ui.log` (debug only). It makes no
network calls of its own, runs no processes and never touches `~/.claude`.

## Load

```
claude --plugin-dir ./bws-memory
```

## Tested

- **Static:** `claude plugin validate ./bws-memory` passes (hook and API-call inventory reviewed); tsc strict passes.
- **Automated:** `claude plugin test` in `bws-memory/`: see `runs/2026-10-13-mods-m4-memory/HANDOFF.md` for the count and the test names per requirement.
- **Headless probe:** `claude -p` with `/remember` writing a file under a temp `memoryDir` (`receipts/m4-probe.json`).
- **DreamPath (M6):** automated tests in `tests/dream*.test.ts` (the plan, the 40% rule, preview, Apply, backup, undo, sources, the triggers); see `runs/2026-10-13-mods-m6-dreampath/HANDOFF.md`. Headless probe: `runs/2026-10-13-mods-m6-dreampath/receipts/m6-probe.json`.
- **Not tested live:** the pane, the cockpit chip, the classifier path after a real turn, `/clear`, `/resume`, `/branch`,
  a real compaction, the dream pane and its keys, a live dream plan from the model, and Desktop. `runs/2026-10-13-mods-m4-memory/MANUAL-CHECKS.md` (memory) and `runs/2026-10-13-mods-m6-dreampath/MANUAL-CHECKS.md` (DreamPath) list them for a real session.
