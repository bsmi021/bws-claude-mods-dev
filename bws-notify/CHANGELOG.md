# Changelog

## 0.2.0
- A Notify tab in bws-cockpit's dashboard (0.21.0 or later) says which events toast and lists the last five toasts this session sent.

## 0.1.1
- Build fixes so the type check passes. No change in behaviour.

## 0.1.0
- Windows toasts for permission asks and questions, finished turns, finished subagents and API errors, each titled with the project and carrying the conversation text.
- Options for each event, a minimum turn length and the body length.
- No toast for short turns, pending background tasks, repeats within 8 seconds, headless sessions or internal forks.
- Checked live: toasts reached Action Center, and the banner was drawn on screen.
