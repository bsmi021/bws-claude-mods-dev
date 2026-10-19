# PLAN: Shelf tab as cards

## Finish line
- Each open idea in the dashboard's Shelf tab is a round-bordered card: an emoji header (who, #id, age), the idea text,
  the first line of its detail, and Resume / Done / Drop buttons (same keys as before).
- "All projects" groups the cards under one header per project (this project first, then by newest idea), each with its
  count and a "more" line when cut.
- Pure grouping in hooks/shelf.ts with tests; dashboard tests updated; mods-gate green for bws-cockpit; bws-cockpit 0.22.0.
- Not in scope: releasing to the marketplace, the headless /shelf text and the list_ideas tool output.
