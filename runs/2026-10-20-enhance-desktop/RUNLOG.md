# RUNLOG: bws-enhance on Desktop

Brief: Desktop showed no `✦ enhance` footer button, and the cockpit Enhance tab told Brian to use that button.

Cause: `ui.render SessionMode` returned `next(e)` unless `e.surface === 'terminal'`. The engine raises SessionMode on desktop too and draws a native Button there; only the chord (`action`) is terminal-only. The idle tab text pointed at the footer with no button of its own.

Done (0.4.3):
- Footer drawn on terminal + desktop; `action` passed on terminal only.
- Idle tab: `Enhance draft` button (`draft`, hotkey e, twin `/enhance --draft`) -> enhanceDraft (reads the box, toasts on empty/slash).
- Idle text names both paths.
- Tests: +3 (desktop footer click, tab draft, tab draft empty box). 54/54 pass; mods-gate --plugin bws-enhance ok.

Not done:
- Live Desktop check. Desktop loads the installed copy, so it needs a release (or CLAUDE_CODE_PLUGIN_DIRS on ./bws-enhance) and /reload-plugins.
- Release waits on Brian: fold into the pending 1.9.0 publish (`python tools/publish.py bws-direction bws-cockpit bws-enhance --version 1.9.0`) or a 1.9.1.
- Shelved: bws-sidechat footer has the same terminal-only guard.
