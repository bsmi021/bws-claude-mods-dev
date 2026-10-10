# bws-assumptions

While Claude builds, every assumption it makes lands in a small side pane. You mark each one Right or Wrong (with a
correction), press Send, and Claude fixes the work that relied on a wrong one.

## How it works

- The mod registers a tool, `mcp__bws-assumptions__record_assumption` (`assumption`, optional `why`), and adds a short
  section to the system prompt: call it whenever you choose something the user didn't specify, then keep going without
  stopping to ask. The tool answers `Recorded as A3. Keep working…`.
- The first assumption opens the **Assumptions** pane (docked beside the transcript in fullscreen from 110 columns, else
  inline above the prompt). Collapsed it is one line: `⚑ 3 assumptions · 2 to review` and **Expand** (`e`).
- Expanded, each item shows `A<n> <assumption>`, its reason, and **Right** / **Wrong**. Wrong opens an `Instead:` field
  for the correction (Enter saves it; text typed but not saved is still sent). Pressing a verdict again clears it.
- **Send N to Claude** (`s`) submits one prompt headed `Assumption review`, as your own message: each WRONG item with
  its correction (or "ask me what it should be" when you left it empty), then the confirmed ones, then "apply each
  correction now". If Claude is busy, it runs once the current turn ends. Sent items drop to a dim `N sent` line;
  **Clear sent** (`c`) removes them.
- The status line under the prompt carries the count (`⚑ 2 assumptions · 2 to review · /assumptions`) whenever
  something is unsent, so a closed or unseated pane still tells you.

## Commands

| | |
| --- | --- |
| `/assumptions` | Opens the pane expanded (any width; works while Claude is working). Headless: prints the list. |

Closing the pane with its mark or `ctrl+x x` stops it reopening for each new assumption; the status line keeps
counting and `/assumptions` brings it back. An unasked pane only seats from 144 terminal columns (110 once you have
opened it yourself); narrower, use `/assumptions`.

## State

The list is the session's (`$.state`): it survives a hot reload. Whether it survives `/clear` is not yet checked.
Numbers never repeat in a session. Unsaved correction text lives in the module and is lost on a reload.

## Load

```
claude --plugin-dir ./bws-assumptions
```

No options. Mobile has no text field: Wrong there sends "ask me what it should be".

## Tested

Claude Code 2.1.296.
- Static: `claude plugin validate` passes; tsc 5.8 strict + noUncheckedIndexedAccess clean.
- Automated: 12 tests (`claude plugin test`): numbering, verdict toggle, prompt wording, status line, tool record and
  refusal, collapsed/expanded pane on terminal and desktop, Right/Wrong/correction/Send end to end, empty Send, system
  prompt section only where the tool is offered, headless and narrow-terminal `/assumptions`.
- Live (`claude -p`, headless): Claude called the tool on its own for two unstated choices while writing a script, with
  no permission prompt, and finished the task.
- Not covered by tests: the person-close flag (the test kit can't raise a close with origin `person`).
