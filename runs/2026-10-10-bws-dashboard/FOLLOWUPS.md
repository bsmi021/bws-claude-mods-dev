# Follow-ups (parked, not in this plan)

- Activity tab: recent guard rewrites, shell-lint refusals, notify toasts. Needs those mods to publish state.
- Run & devices tab (declined in round 1; detail stays in chips + /cockpit).
- Fold bws-enhance into cockpit (declined in round 1).
- Board actions from the tab (take / done / decline an ask). The tab is read-only.
- Send review and Refresh as bar buttons (not picked in round 2).
- Custom tab order / hiding tabs per project.
- bws-cockpit Hide (3) has no way back within a session (pre-existing; isHidden never cleared). Shelved #11.
- The band (now the bar) stays undrawn after session start until the first turn or /cockpit in tmux test sessions; same with 0.14 (pre-existing). Check whether the session-start probe completes.
- AGENTS.md live-check notes: add the `--settings` recipe (env CLAUDE_CODE_PLUGIN_DIRS override plus `enabledPlugins: false` for the installed copies); first check whether a flag `enabledPlugins` map merges with the user's or replaces it.
- ~~The `publish` branch still lists bws-assumptions and bws-shelf~~ resolved: published bc96bc7 (runs/2026-10-10-mods-publish-dashboard).
- Delete the pushed `bws-dashboard` branch on `private`.
