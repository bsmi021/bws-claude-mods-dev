# bws-sidechat: model choice + main-thread links (0.3.0)

## Finish line
- `tsc` (5.8.3) clean under `bws-sidechat/tsconfig.json`; the existing tests pass unchanged; `claude plugin validate ./bws-sidechat` clean.
- The side chat's model can be chosen separately from the main conversation's, and the child really runs on it (checked live in `/side`).
- The main conversation is unchanged unless Send to main is pressed.
- No new tests, no docs beyond the README command table and notes for what is built (user approved only this).

## Interview answers (2026-10-15)
- Pain points, all four: too many entry points; stale fork; no way to use an answer; pane controls hard to discover.
- Links, all four: Send answer back, Refresh from main, Main thread status, Pull main context in.
- Entry points: **/side is the one door.** Everything has a /side subcommand; /fork, /branch, /btw stay as thin aliases (documented as such).
- Model: setting `sideModel` is the default; an in-pane override for the open side chat (header buttons + `/side model <name>`); New fork keeps it; applies from the next message; /explain explorations follow it.
- Model list: fixed aliases (default, opus, sonnet, haiku) + any id typed in `/side model <id>`.
- Refresh: manual (button + `/side refresh`); header shows how many main turns ahead.
- Send back: the answer text, as you, via the deferred submit (as Decide).
- Pull: main's latest reply is added to the side chat as a message.

## Scope
1. State (`types/index.d.ts` SideChat): `model`, `mainTurns`, `forkTurns`, `isMainBusy`, `pendingReplay`.
2. `side.ts` (pure): `modelOf`, `isModelName`, `replayPrefix`, `parseSide` kinds `model`, `refresh`, `pull`, `send-back`; `transcriptRows` optional send rows; `roomOf` optional chrome rows (defaults keep old results).
3. `register.tsx`: model resolved at spawn (send + explore); header model buttons + status + Refresh/Pull; per-answer Send to main button; `/side model|refresh|pull|send-back`; one `turn.start` and one `turn.complete` hook (observe only) for the main status; New fork keeps the model.
4. `plugin.json` 0.3.0, README (command table, model, links).

## Acceptance checks
- A. `/side model haiku` then a question: the side session file records the haiku model; main session file gets no new messages.
- B. Header shows model buttons (current one bold), `main · N ahead` after a main turn, Refresh/Pull/Send to main.
- C. Refresh: new fork id, transcript kept, next message carries a replay of earlier questions; main untouched.
- D. Send to main / `/side send-back`: answer text lands in main as a user message, only on press.
- E. tsc, validate, `claude plugin test` all pass with the existing tests unchanged.

## Assumptions
- Refresh is lazy: the replay rides on the next Ask, no model call on press.
- Send to main is not blocked while main is busy: the engine runs a plugin's prompt once idle; a toast says so.
- "N ahead" = main turns completed since the fork was taken (counted by `turn.complete` since the mod loaded).
- `/side send-back` sends the latest answer; bare `/side model` reports the current model; subcommands match exactly, anything else is still a message.
