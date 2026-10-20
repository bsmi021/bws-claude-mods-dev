# bws-enhance 0.4.3: enhance on Desktop

## Finish line
- Footer `✦ enhance` is drawn on the desktop surface too (was gated to terminal). Chord `action` passed on terminal only.
- Idle Enhance tab has an `Enhance draft` button (id `draft`, hotkey `e`, twin `/enhance --draft`) that enhances the draft in the box.
- Idle text names both paths and no longer promises a footer button that may not exist.
- Tests: desktop footer mount, tab draft button, empty-box toast. `mods-gate --plugin bws-enhance` green.
- Version 0.4.3 + CHANGELOG. Release waits on Brian (joins the pending 1.9.0 publish).

## Out of scope (shelved)
- bws-sidechat has the same terminal-only footer guard (register.tsx:614).
