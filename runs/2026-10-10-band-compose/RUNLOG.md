# RUNLOG: bws-cockpit 0.10.1, shared band slot

## Brief
The AbovePrompt band is a single slot. A mod either draws a tree there or passes, and the first mod in the chain wins. bws-cockpit drew its own tree and never called `next(e)`, so it would hide any later mod's band. Make it compose instead.

## Done
- `register.tsx` AbovePrompt hook: `const drawn = await settle(next(e))`.
  - A plugin tree (any type but `'engine'`) is drawn in `<Box key="band-below">` under cockpit's rows, next to the prompt.
  - Core's own node (`type: 'engine'`) is the survey slot, which is empty here because surveys already make cockpit pass. It is not added.
  - The hidden, survey and no-view paths still return `next(e)` whole.
- Tests (`cockpit.test.ts`, band layout):
  - a second stub band shows under ours on terminal and desktop, with both bands complete
  - hidden, the stub band gets the whole slot
  - with no other band, no `band-below` box appears
- README: what the band does with another mod's band, and the hotkey-clash caveat. Version 0.10.1.

## Checks (receipts/)
- `claude plugin validate`: passed (`validate.txt`)
- `claude plugin test`: 115/115 (`test.txt`)
- tsc 5.9.3, strict + noUncheckedIndexedAccess: clean (`tsc.txt`)
- Not checked live: no installed mod draws an AbovePrompt band to compose with, and the band only draws in an interactive terminal or Desktop.

## Next step
None. A live check comes the first time a second band mod exists.

## Publish refresh (2026-10-10)
- Scratch worktree `../_bws_publish` on `publish`. Ran `git checkout main -- bws-cockpit bws-shell-lint`, so publish now carries bws-cockpit 0.10.1 and bws-shell-lint 0.2.0.
- The private-name scan (names, project and game names, serials, paths, run-folder paths) found:
  - in the new code: the owner's name in a `finish.ts` comment and in four Finish-Line test strings; test phrases from private projects (tablet/notebook, takes, landmarker, pose model); a run-folder path in a `lint.ts` comment
  - already published in 0.9.0: `com.bws.inkwell` in a cockpit test
  - Fixed on main in `4dc55aa` (`scrub_publish.py`). The checks passed again on main: validate x2, 115/115, 17/17, tsc x2.
- Kept by design, as in earlier refreshes: the manifest author fields and the LICENSE holder. The `AppData` hits in the shell-lint fixture are the scrubbed `C:\Users\dev\...` paths.
- Top README: the Finish-Line line now says the guard counts the run folder this session wrote to, and the evidence check is optional.
- From the publish tree: validate passed for both plugins; tests 115/115 and 17/17.
- Committed `202d456` on `publish` (19 files) and ran `git push mods`, which maps `publish` to `main`: `851f859..202d456`. `mods/main` = `202d456`. This repo's `main` was not pushed.
