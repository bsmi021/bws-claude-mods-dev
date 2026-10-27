# bws-agents

Every subagent of this session as a live, coloured card in the **Agents** tab of the bws-cockpit dashboard.

- A summary card on top: 🟢 running, ✅ done, 💤 idle, ❌ failed, ⚠️ stalled, 🪙 tokens.
- One card per agent, running ones first: status and type emoji (🔎 Explore, 🗺️ Plan, 🤝 teammate, 🤖 others), the
  task, model, elapsed time, tool count, tokens in/out, the last three tool calls while it runs, and the first line of
  its answer when it ends. Cards are coloured: blue running, green done, red failed or stopped, amber stalled.
- ⚠️ stalled: a running agent with no tool call for `stallMinutes` (default 2). A failure or a stall brings the tab up.
- Buttons: 🧹 Clear finished (`c`), 🔄 Refresh (`r`).

## Commands

- `/subagents` opens the dashboard on the Agents tab (prints the roster as text when headless).
- `/subagents text`, `/subagents clear`, `/subagents refresh`.

`/agents` is Claude Code's own command, so this mod uses `/subagents`.

## How it works

It observes `agent.spawn` (a new card with its id and model), `tool.call` inside a subagent's loop (`agentId` set) and
the subagent's `turn.complete` (answer, usage, status). While anything runs it syncs with `$.agent.list()` every 5 s, so
statuses stay right and agents spawned before a hot reload appear. The roster lives in `$.state` for the session only;
nothing is written to disk and nothing enters Claude's context. It never blocks or changes a spawn or a tool call.

## Options

- `stallMinutes` (default 2): flag a running agent after this many minutes without a tool call; 0 turns it off.

## Load

Needs bws-cockpit 0.28.0 or later for the tab (it lists `bws-agents` in `modTabs`).

```
claude --plugin-dir ./bws-agents --plugin-dir ./bws-cockpit
```

Tested with Claude Code 2.1.311: `claude plugin validate`, `claude plugin test` and tsc strict; terminal live check
recorded in the repo's run log.
