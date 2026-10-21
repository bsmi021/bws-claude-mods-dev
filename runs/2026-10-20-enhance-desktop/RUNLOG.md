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

## bws-sidechat 0.4.3 (shelf #43)
- Same fix: footer `◨ side` drawn on terminal + desktop; `action` on terminal only.
- Replaced the test that asserted no desktop button with one that asserts the button, no action, and a click opening the tab. 119/119 pass; mods-gate --plugin bws-sidechat ok.
- README Desktop note updated (native /side still wins; the footer click opens this mod's tab). Not checked live.
- Release: add bws-sidechat to the same publish as bws-enhance, on Brian's word.

## Released 2026-10-21
- bws-enhance 0.4.3 and bws-sidechat 0.4.3 shipped in bws-mods 1.10.0 with bws-cockpit 0.24.0 (tag v1.10.0) and were installed. Live Desktop check still not done.
