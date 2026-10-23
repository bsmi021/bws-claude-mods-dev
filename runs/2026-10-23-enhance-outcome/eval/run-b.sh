#!/bin/bash
# Eval B: old vs new rewriter, per enhancer model.
S=/tmp/claude-0/-home-user-bws-claude-mods-dev/760f7ba1-34a3-5ceb-b711-31332de7c2eb/scratchpad
export EVAL_MODS=$S/mods EVAL_CWD=$S/evalcwd EVAL_SAMPLES=3
for m in haiku sonnet opus; do
  export EVAL_ENHANCER=$m EVAL_OUT=out-b-$m
  echo "== $m"; python3 eval.py gen && python3 eval.py judge && python3 eval.py report | sed -n 5,14p
done
