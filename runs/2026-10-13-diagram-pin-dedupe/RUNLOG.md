# bws-diagram 0.2.1: one pin per diagram

Finish line: pinning an identical diagram replaces the earlier pin, so `/diagram status` says 1 pinned. Test first, gate, bump 0.2.1, PR, merge, publish to mods, release.

- Seen live: `/diagram status` listed "Boil water" twice (entries 1 and 4, both 5 nodes, 4 edges, 2 pinned) after the tea flowchart was posted again in different words.
- Cause: `pinsFrom` skipped a block only when its exact source text was already pinned; the same flowchart with other ids, header or spacing pinned again.
- Repro: mermaid.test.ts "the same diagram written differently replaces its earlier pin" failed with "0 drawn, 2 pinned".
- Fix: `pinKey` (nodes by label and kind, edges by node position and label; squeezed source text when no diagram) and `addPin` (drops an earlier pin with the same key, then adds the new one last and shown). `pin()` uses `addPin`. An exact repeat is still skipped as before; a one-label change is a different diagram and pins separately.
- Gate: `python tools/mods-gate.py` all ok (11 plugins + kit, 72 s).
- Release: bws-diagram 0.2.1, marketplace 1.1.1.
