# RUNLOG: every mod as a dashboard tab

## 2026-10-18
- Brian: all mods load as dashboard tabs like Assumptions/Shelf/Board. Scope: pane mods, guard status tabs, bar chips -> tab labels. Secrets and design-picker stay. Plan: PLAN.md (M1-M6, one release each). Branch feat/dashboard-tabs (carries unpublished cockpit 0.20.0 bar).
- Probe (receipts/m1-probe-cross-plugin-open.txt, Claude Code 2.1.302, tmux 170 cols, cockpit source + throwaway probe-pane plugin): a second plugin calling `$.ui.open({ id: 'dashboard' })` from its own command, with the dashboard closed, got isPlaced true, listed the pane as its own, and cockpit's render hook drew it (tab strip shown). Pane render hooks match by id across plugins. So a mod can open the dashboard synchronously in its own hook (the person's open, any width): enhance/better can raise their tab without the 144-column rule.
