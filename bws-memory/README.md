# bws-memory

> Notices when you say something worth remembering, saves it as a memory file in the background, and tidies the files with a reviewed "dream".

After a turn, a small model decides whether you said something worth keeping: a preference, a correction, a fact about
you or the project, a decision, or a pointer to an outside resource. If so, a fork of your session writes memory entries
and this mod saves them as files, with secrets redacted and duplicates avoided. A Memory tab shows what changed and lets
you undo it. Every so often a "dream" proposes merging duplicates and dropping stale entries; nothing changes until you
press Apply. The main session never does this work and never waits for it.

## Install

```
claude plugin marketplace add bsmi021/bws-claude-mods
claude plugin install bws-memory@bws-mods
```

Then `/reload-plugins`. Requires Claude Code 2.1.296 or later. It shows its results in a Memory tab of
[bws-cockpit](../bws-cockpit/README.md)'s dashboard (0.21.1 or later). Without bws-cockpit, a toast says what changed
and the commands below do the rest.

## Use

| Command | What it does |
| --- | --- |
| `/remember <text>` | Saves an entry from `<text>` now, without the classifier. With a screen it runs in the background and brings up the Memory tab; headless it finishes before the command returns. With no conversation to fork (a first command, or right after `/clear`) it asks a model with the text alone. |
| `/memories` | Lists the last 20 writes, newest first, with the session each came from. |
| `/memory-undo` | Restores the previous version of the files the last write changed, plus `MEMORY.md` and `sources.json`. One level deep. A file the write created is emptied, not deleted; its index line is removed. |
| `/dream` | Plans a consolidation and shows it; nothing changes yet. |
| `/dream apply` | Plans and applies in one step, or applies the plan that is waiting. |
| `/dream dismiss` | Closes the plan or result on screen. |
| `/dream undo` | Restores the newest backup. |
| `/dream status` | Says what is waiting and how many turns are counted. |

The Memory tab has two cards. "Last memory update" shows `memory updating…` while a run goes, then each changed file with
`+added -removed` lines and the buttons `OK` and `Undo it`. "Dream" shows the plan with each action, its reason and the
sessions its files came from, with `Apply` and `Dismiss`; while idle it offers `Plan a dream`. A new update or plan
brings the tab up.

## What it does

### Remembering

- **Which turns.** On each finished turn, the last exchange (your message and the final answer) goes to one small-model
  call that answers `yes` or `no`. Skipped without any call: a turn whose message has fewer than `minWords` words and
  used no tools, headless runs, a subagent's turn, a turn that did not end in an answer (interrupted, refused, API
  error), and any turn while a previous memory run is still going.
- **The fork.** On `yes`, a fork of your session (it reuses the prompt cache) is asked for entries as JSON: file name,
  name, description, type (`user`, `feedback`, `project` or `reference`) and body. The prompt lists the existing files'
  names and descriptions so the fork updates a file instead of adding a duplicate. At most 5 entries per run, bodies up
  to 4,000 characters.
- **The write.** Each entry becomes `<memory folder>/<slug>.md` with this frontmatter, plus one line in `MEMORY.md`:

  ```
  ---
  name: prefers-tabs
  description: The user wants tabs, not spaces
  metadata:
    type: feedback
  ---

  Use tabs. ...
  ```

  An entry that matches an existing file (same file name or same name) updates it. The same text again is refused as a
  duplicate and nothing is written. `sources.json` records which session each write came from.
- **Redaction.** Before anything is written, keys, tokens, passwords, bearer tokens, private-key blocks, JWTs,
  `user:password@` URLs and long mixed-case key-shaped strings are replaced with `[redacted]`. A reply that is half or
  more secret characters, or whose body is only redaction, is dropped whole.
- **Failure.** A classifier error or timeout (15 s), a fork error or timeout (90 s), an unreadable reply or a write
  error leaves the session as it was and writes nothing. The tab shows `Memory not saved` with the step that failed.
  Debug-log lines never carry your text. A fork cannot be cancelled, so a timeout only stops waiting for it.

### Dream: consolidating the memory

A dream merges duplicates, drops stale or contradicted entries and rewrites entries for clarity.

- **The plan.** `/dream` reads every memory file and `sources.json` and asks a fork (or your session's model when there
  is no conversation to fork, for example headless) for a plan of `merge`, `remove` and `rewrite` actions, each with a
  reason. The plan is rejected, and nothing changes, when it names a file that is not in the folder, uses a file in two
  actions, or removes more than 40% of the files. A merge does not count as a removal. Only non-empty `.md` files up
  to 4,000 characters are shown to the model (at most 40); longer ones are left alone. Secrets in rewritten text are
  redacted.
- **Preview first.** On a screen the Dream card lists the plan with Apply and Dismiss. Headless, `/dream` prints the
  plan and changes nothing; `/dream apply` plans and applies in one awaited command.
- **Apply.** The whole folder (every `.md`, `MEMORY.md`, `sources.json`) is first copied to
  `<memory folder>/.dream-backup/<UTC timestamp>/`, then the changes are written. Removed or merged-away files are
  emptied and their `MEMORY.md` lines dropped. Apply refuses if a file in the plan changed after the preview. A merge
  moves the merged-away files' sessions to the surviving file.
- **Undo.** `/dream undo` restores the newest backup once. A dream also clears `/memory-undo`'s record, since that would
  undo into a folder that is gone.
- **Automatic.** After every `dreamEveryTurns` answered turns of yours (headless runs, subagents and interrupted turns do
  not count), and before a compaction, a dream becomes due: a preview starts in the background and the Memory tab comes
  up. It never applies on its own. It waits while a memory update runs, and does not start with fewer than two memory
  files or with a plan already waiting. A failed automatic dream stays quiet and leaves "dream due". The turn counter
  resets on a reload, `/clear`, `/resume` and `/branch`.

### `/clear`, `/resume`, `/branch`

`/clear` and `/resume` start no work and reset the view. A fork still running is not cancelled, but its reply is
dropped: nothing from a conversation that is gone is written. A dream that was planning is dropped and a plan on screen
is closed; a dream that was due stays due until you apply or dismiss one. `/branch` has no event of its own, so the mod
notices the new session on the next turn or command and resets the same way.

## Options

Set in `/plugin`, or under `pluginConfigs["bws-memory"].options` in settings.json.

| Option | Default | What it does |
| --- | --- | --- |
| `memoryDir` | empty | Where memory files are written. Empty: `<project>/.claude/bws-memory`, a folder this mod owns so it never collides with the built-in memory. A relative path is under the project. |
| `minWords` | `8` | A turn whose user message has fewer words than this and used no tools is not looked at. |
| `dreamEveryTurns` | `20` | Every N answered turns, and before a compaction, the memory is due a dream: a preview, never applied on its own. `0` turns the automatic dream off; `/dream` still works. |
| `model` | `haiku` | Model alias or id that decides whether a turn is worth remembering (`haiku`, `sonnet`, `opus` or a full id). The writing fork uses your session's own model. |

## Permissions and data

- **Model calls.** One small-model call per eligible turn, which sees your last message and Claude's final answer. One
  fork of your session per memory write and per dream plan, so the fork sees your conversation as your session does and
  uses its model.
- **Reads and writes.** Only the memory folder and its `.dream-backup/` subfolder: memory files, `MEMORY.md`,
  `sources.json`, the one-level undo record and dream backups. It also reads your session's id, working directory,
  messages and model.
- **Where the files live.** By default inside the project (`.claude/bws-memory`), so check whether that folder is
  committed to your repository. Redaction is a safety net, not a guarantee; read what is saved.
- **Not loaded for you.** The mod saves files; it does not inject them into later prompts.
- **Does not.** Make network calls of its own, run processes, or touch `~/.claude`.

## Compatibility

Checked on Claude Code 2.1.296 on Windows 11: automated tests for the write, redaction, undo and every dream rule, and
headless runs of `/remember` and `/dream`. The tab needs a surface that shows bws-cockpit's dashboard. The classifier
path after a real turn, a real compaction, a live dream plan from a model, Desktop, and `/clear`, `/resume` and
`/branch` have had little live testing.

## License

MIT. Version history: [CHANGELOG.md](CHANGELOG.md).
