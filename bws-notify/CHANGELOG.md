# Changelog

## 0.3.0
- Finished turns, finished subagents and errors are heard through the native `turn.complete` event instead of the
  classic `Stop`, `SubagentStop` and `StopFailure` hooks. The turn length is the engine's own (`durationMs`).
- Errors toast as `error: API` with the first line of the error text, since the native event carries no error kind.
  A refused turn now toasts too, as `error: refused`.
- Interrupted turns toast nothing. A finished turn waits for background agents (not background shells) before toasting.
- Permission asks still come from `classic.Notification`: no native event hears them.

## 0.2.2
- No behaviour change. Ships the shared tab module with the new markdown and picture nodes (bws-cockpit 0.27.0).

## 0.2.1
- No behaviour change. Ships the 1.7.0 README, this CHANGELOG and the full manifest (author, homepage,
  repository, license, keywords) to installed copies: `claude plugin update` keeps files by version.

## 0.2.0
- A Notify tab in bws-cockpit's dashboard (0.21.0 or later) says which events toast and lists the last five toasts this session sent.

## 0.1.1
- Build fixes so the type check passes. No change in behaviour.

## 0.1.0
- Windows toasts for permission asks and questions, finished turns, finished subagents and API errors, each titled with the project and carrying the conversation text.
- Options for each event, a minimum turn length and the body length.
- No toast for short turns, pending background tasks, repeats within 8 seconds, headless sessions or internal forks.
- Checked live: toasts reached Action Center, and the banner was drawn on screen.
