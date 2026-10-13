# bws-kit

Reusable pure modules for the video-derived mods. A folder, not a plugin: mods cannot import across plugins, so
`tools/sync-kit.py` vendors the modules a plugin lists in its `kit.json` into `<plugin>/hooks/kit/`.

| Module | What it is |
|---|---|
| `classify-fork.ts` | The classify-then-fork decision: gate input, yes/no parse, result shape, timeout and abort handling, and the resumed-session fallback (`$.session.messages()` + `$.model.complete` when `$.model.fork` answers `nothing-to-fork`). Takes a `KitModel` adapter, since no kit module uses `$`. |
| `summary.ts` | The `summary` state atom shape every mod publishes (`{ state, label, detail? }`) and its reader. |
| `transcript.ts`, `runfolder.ts` | Copied from bws-cockpit's `handoff.ts` (the cockpit keeps its own). |
| `raster.ts` | The half-block Raster and Svg helpers, copied from `bws-design-picker/hooks/lib.ts` (design-picker is untouched). |

Kit modules import each other only as siblings (`./transcript`), so a vendored set works flat.

`hooks/register.ts` registers nothing: `claude plugin test` needs a hooks module to load, and the kit has no
manifest, so it is not loaded in any session.

## Check

`python tools/mods-gate.py --plugin bws-kit` runs the kit's tests and tsc (strict) against bws-cockpit's generated types.
Tested with Claude Code 2.1.296 on the test runner only: no surface draws anything from the kit itself.
