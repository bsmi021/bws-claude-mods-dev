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
