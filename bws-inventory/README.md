# bws-inventory

What this conversation has used, as the **Inventory** tab of the bws-cockpit dashboard:

- 📝 **Todos**: the TodoWrite list, tasks from TaskCreate/TaskUpdate and the Claude Code Desktop task list, with ✅ / 🔄 / ⬜ per item and a done count.
- 🔌 **Connectors**: each MCP server called, with calls, distinct tools, errors and the last tool. ⚠️ marks a server whose calls failed.
- 📁 **Files**: files read 👁️, edited ✏️ or written 🆕, newest first, with counts.
- 🧠 **Skills**: each skill run (typed as `/name`, called by the Skill tool or preloaded into a subagent), with a use count.

Subagents' tool calls count too. A denied tool call counts for nothing. The inventory lives in session state only: it is
emptied on `/clear` and `/resume`, and nothing is written to disk.

## Commands
- `/inventory`: opens the dashboard on the Inventory tab (prints the text form when headless or without cockpit).
- `/inventory text`: the inventory as text.
- `/inventory clear` (or 🧹 Clear, key `c`): starts the inventory over.

## Load
```bash
claude --plugin-dir ./bws-inventory --plugin-dir ./bws-cockpit
```
Installed from the `bws-mods` marketplace: `claude plugin install bws-inventory@bws-mods`. Needs bws-cockpit 0.28.0+ for the tab.

## Tested
Claude Code 2.1.311, terminal. Desktop not checked.
