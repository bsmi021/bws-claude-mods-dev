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
| `/memory-undo` | Restores the previous version of the files the last write changed, plus `MEMORY.md` and `sources.json`. One level deep. A file the write created is emptied, not deleted (a mod has no delete); its index line is gone. |

## After `/clear`, `/resume`, `/branch`

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
| `model` | `haiku` | The model that decides whether a turn is worth remembering. The writing fork uses your session's own model. |

## Summary atom

`{ plugin: 'bws-memory', key: 'summary' }`: nothing when idle, `memory updating` (busy) while a run is going,
`memory: N files` (ok) while the pane is open, `memory not saved` (warn) after a failed run. bws-cockpit lists
`bws-memory` in its default `modSummaries`.

## Capabilities used

`turn.complete` (returns at once; the work starts after it through `$.clock.after`), `session.end`, `command.run`
(`/remember`, `/memories`, `/memory-undo`), `ui.render` and `ui.close` for the pane, `$.model.classify`,
`$.model.fork`, `$.model.complete` (only as the fork's fallback), `$.session.*` (id, cwd, messages, surfaces, model),
`$.fs.read`, `$.fs.write` and `$.fs.list` on the memory folder only, `$.state`, `$.ui.log` (debug only). It makes no
network calls of its own, runs no processes and never touches `~/.claude`.

## Load

```
claude --plugin-dir ./bws-memory
```

## Tested

- **Static:** `claude plugin validate ./bws-memory` passes (hook and API-call inventory reviewed); tsc strict passes.
- **Automated:** `claude plugin test` in `bws-memory/`: see `runs/2026-10-13-mods-m4-memory/HANDOFF.md` for the count and the test names per requirement.
- **Headless probe:** `claude -p` with `/remember` writing a file under a temp `memoryDir` (`receipts/m4-probe.json`).
- **Not tested live:** the pane, the cockpit chip, the classifier path after a real turn, `/clear`, `/resume`, `/branch`
  and Desktop. `runs/2026-10-13-mods-m4-memory/MANUAL-CHECKS.md` lists them for a real session.
