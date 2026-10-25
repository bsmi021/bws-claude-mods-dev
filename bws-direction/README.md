# bws-direction

> Tells you when the work drifts off the plan, within a session and across sessions.

Long sessions wander: a tangent here, a feature nobody asked for there, a change that quietly contradicts the spec.
bws-direction checks each turn that did work against what the session set out to do and what the project's documents
say, and keeps every verdict per project, so drift shows as it happens and as a trend over days.

Works for any project with a `docs/` folder: specs, PRDs, requirements, architecture notes, a game design document.
Without one it still checks against the session's task and run plan.

## Install

```sh
claude plugin marketplace add bsmi021/bws-claude-mods
claude plugin install bws-direction@bws-mods
```

Then `/reload-plugins`. The verdicts live in the **Direction** tab of [bws-cockpit](../bws-cockpit/README.md)'s
dashboard (0.23.0 or later). If you set cockpit's `modSummaries` option yourself, add `bws-direction` to it.

## Use

| Command | What it does |
| --- | --- |
| `/direction` | The last verdict, this session's trend, the project's trend and the anchors in use. |
| `/direction check` | Checks the latest turn now. |
| `/direction overall` | Checks the whole project: recent commits (`git log`, 30 days) and earlier verdicts against the documents. Never runs on its own. |
| `/direction show` | Opens the dashboard on the Direction tab. |
| `/direction tell` | Sends the last drift verdict to Claude as your prompt. |
| `/direction pause`, `resume` | Stops or restarts automatic checks for this session. |

Every tab button has a `/direction --<id>` twin: `check`, `overall`, `tell`, `pause`, `resume`. Keys in the tab:
`t` Tell Claude, `c` Check now, `o` Whole project, `p` Pause / Resume.

## What it checks

**When.** A turn is checked when it ends if it edited a file or made 3 or more tool calls, in the main conversation
(not subagents), in an interactive session. Headless runs (`claude -p`, harness workers) are only checked by command.
The `every` option checks every Nth such turn. The turn never waits: the check runs after it.

**Against what.**

- **The opening request:** the first prompt you typed in the session. Drift means a step unrelated to it.
- **The whole conversation:** every later prompt, with the files each turn edited and the head of its answer, so
  follow-ups, confirmations, fixes and release steps toward the opening goal read as aligned. Over about 16,000
  characters the middle turns are left out; the start and the newest turns always stay.
- **The plan:** `PLAN.md` in the `runs/<date>-<slug>/` folder the session's tool calls named last (first 3,000 characters).
- **The documents:** every `.md` under `docs/` at the project root (where the session started, not where a shell `cd` went) (4 levels, 300 files). The anchor documents send their heading outline
  on every check: the files named like a PRD, spec, requirements, design doc, GDD or vision; else architecture,
  technical design or `*-spec`; the shallowest ones, at most 3. `anchorDocs` names them yourself. Other sections are
  picked by the words they share with the turn (file paths, identifiers, your prompt), about 7,000 characters in all.

**The verdict.** One Sonnet call (`sonnet`, 45 s timeout) answers: `aligned` (75-100), `drifting` (40-74) or
`off-course` (0-39), a one-sentence reason, the anchor it rests on (`docs/PRD.md § Goals`), a suggestion, and the cause:

- **agent:** Claude did more or other than asked.
- **user:** you asked for work unrelated to the opening request. That still counts as drift: the point is to make it
  visible, not to stop you.

The plan and the documents only explain what the opening goal means; silence or a mismatch there is not drift by itself.

**What you see.** The Direction tab shows the last verdict as a coloured card, `This session: ✓✓~✗ 4 checks, average
63, ↓ worsening`, and `Project: 52 checks over 9 sessions, 81% aligned, average 79; last 7 days 74 (week before 83);
3 sessions drifted.` A drifting or off-course verdict raises the tab and shows a toast. With `nudge` on (default),
Claude's context carries the verdict until a later check finds the work aligned, as a warning, not a stop: Claude keeps
working and mentions in one line how the work serves the opening request, or that it does not.

It fails open: a timeout, an API error or an unreadable answer records nothing and writes one debug line, such as
`bws-direction: turn failed (timeout); nothing was changed`. The line never contains the prompt.

## Options

Set in `/plugin`, or under `pluginConfigs["bws-direction"].options` in `settings.json`.

| Option | Default | What it does |
| --- | --- | --- |
| `autoCheck` | `true` | Check working turns when they end. Off: `/direction check` only. |
| `every` | `1` | Check every Nth working turn. |
| `model` | `sonnet` | Model for turn checks. |
| `overallModel` | `sonnet` | Model for `/direction overall`. |
| `docsDir` | `docs` | The document corpus, relative to the project. |
| `anchorDocs` | empty | Anchor documents, comma-separated paths relative to the project. Empty: found by name (above). |
| `nudge` | `true` | Give Claude the drift verdict in its context until the work is aligned again. |

## Permissions and data

- **Reads** `.md` files under the docs folder and the anchor documents, the run folder's `PLAN.md`, and the session's transcript. Never writes to `docs/` or any project file.
- **Runs** `git log` in the project folder, only for `/direction overall`.
- **Stores** each verdict (verdict, score, reason, anchor, cause, suggestion, edited file paths, time, session id) in the plugin store, keyed by project folder, newest 300 kept.
- **Model calls** go through the session's own client: one per checked turn, one per `/direction overall`. The task, plan, document excerpts and a digest of the turn (prompt, tool calls, edited paths, Claude's answer) are sent to that model and to no one else.
- **Never** sends a prompt for you unless you press **Tell Claude** or run `/direction tell`, and never changes settings.

## Compatibility

Checked on Claude Code 2.1.304 on Windows 11: interactive in a terminal (automatic checks, toast, dashboard tab, through
`tools/live.py`), and headless (`claude -p "/direction ..."`) in a game project (`docs/GDD.md`, 110 docs) and a web
project (`docs/PRD.md`, `docs/architecture.md`). The Desktop app, VS Code, mobile and cloud sessions have not been
tried; surfaces without mod UI still get `/direction` as text.
