#!/usr/bin/env bash
# Copies the shipped lib.ts and its types into the eval mod, so the harness uses the prompt that ships.
set -e
R=/c/Projects/bws.mods.claude-code/runs/2026-10-10-design-model-ab
P=/c/Projects/bws.mods.claude-code/bws-design-picker
cp $P/hooks/lib.ts $R/eval-mod/hooks/lib.ts
# the contract block names the picker's state; the eval mod only needs the value types
sed '/^declare module/,$d' $P/types/index.d.ts > $R/eval-mod/types/index.d.ts
sed -i "s#from '../types'#from '../types/index'#" $R/eval-mod/hooks/lib.ts
(cd $P && git rev-parse --short HEAD) > $R/receipts/picker-commit.txt
