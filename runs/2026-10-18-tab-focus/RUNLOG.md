# RUNLOG: why the Enhance and Side chat tabs never got the keyboard

## Finish line
Typing goes where the tab says: Side chat's Ask box keeps the keys during and after an answer; Enhance's s / p / d work on the result; patch released.

## 2026-10-18
- Experiments in tmux (receipts/): bare `/side` and a question from a focused Ask box that failed fast kept the keys; `/side <message>` and any answer that ran lost them. Sampling after `/side <message>` showed the dashboard focused with the ring on Stop: typed letters Stop does not use fell through to the prompt, and when Stop went away the keys went with it.
- Root cause, read from the engine's refusals (probe lines): a pane belongs to the plugin that opened it. The mods opened the dashboard themselves (so the open was the person's), which made it their site. The ring sat on elements cockpit drew. So the mod's `$.ui.focus` was refused ("another plugin's element holds the keyboard"), and cockpit's was refused too ("not this plugin's site"). Better works only because it never needs a ring move after opening.
- Second cause, Enhance only: filling the prompt box with the rewrite hands the keyboard to the box (with the fill skipped, the dashboard kept it). Also its start checked "box empty" inside the command hook, where the box still holds the command text, so it never asked for the keys.
- Fix (kit + cockpit 0.21.1, enhance 0.4.1, sidechat 0.4.1): a tab's new `open` counter asks cockpit to open the dashboard; cockpit's state.set hooks are now awaited, so the open happens inside the mod's command (the person's open: any width, the keys) and cockpit owns the pane it draws. Cockpit moves the ring to a tab's element marked `isFocused` when it changes (buttons can be marked now too) and scrolls `isPinnedEnd` tabs. Side chat drops its own open/refocus/scroll code and the `s` hotkey on Stop. Enhance asks for the keys from `/enhance`, and when the run asked for them the rewrite waits in the tab (s sends, p puts it in the box, d dismisses) instead of filling the box.
- Live (tmux, cockpit + enhance + sidechat, the sequence that failed before): `/enhance`, then `s` sent the rewrite (main answered "purple"); then `/side <question>`: "during" (typed while it answered) and "after" both landed in the Ask box (receipts/final-*.txt). The highlight on Send is not visible in the capture (a primary button), but s/p/d act.
- Checks: tsc, validate, plugin test for kit, cockpit, enhance (51), sidechat (119), better, diagram, memory.

## Release
- bws-mods 1.6.1. feat/dashboard-tabs (403d5ff) merged into main in a scratch worktree (1f9c879) and pushed to private. Publish: the ten mods and marketplace.json were restored from main (lists and contents match). Scan clean, no bws-interview. In the worktree all ten passed tsc, validate and tests (cockpit 212, diagram 60, memory 136, enhance 51, better 43, sidechat 119, skillgate 45, notify 14, shell-lint 18, secrets 54). Pushed `publish -> mods main`, tag v1.6.1.
