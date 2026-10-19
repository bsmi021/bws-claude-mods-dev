# Changelog

## 0.6.0
- The Board tab in bws-cockpit's dashboard draws one bordered card per session and one per ask (needs bws-cockpit 0.18.0 or later). Older cockpits and headless runs get text lines.
- Checked live in Windows Terminal.

## 0.5.1
- Compatibility fixes for the mod suite.

## 0.5.0
- The board moves into bws-cockpit's dashboard. `/board pane` opens its Board tab; without bws-cockpit it prints the board. bws-board no longer draws its own pane.
- An ask from another session raises the Board tab with `1 for you`.

## 0.4.0
- Git overwrite guard: a git command that would overwrite or delete a file a live peer claims and has changed is refused (`stash`, `reset --hard`, `checkout -f` and `checkout .`, `restore`, `clean -f`, `rm`). The refusal names the files and gives the path-limited form.

## 0.3.0
- Git lease: one session at a time runs git that changes the index, the checkout or refs. A commit that would include a peer's claimed files is refused. New options `gitLease` and `gitLeaseMinutes`.

## 0.2.0
- Per-session board history (`historyDays`) and `/board digest [days]`, which writes a team timeline page.

## 0.1.0
- Cards, roles, file claims, asks (ask, take, done, decline, withdraw), messages and the urgent wake. `/board` and the board tools.
- Checked live with two sessions: a claim, a refused edit, an ask taken and finished, and an urgent ask that started a turn in an idle session.
