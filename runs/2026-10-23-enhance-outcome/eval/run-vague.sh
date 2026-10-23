#!/bin/bash
# Vague prompts: haiku rewrites (old vs new, judged), then haiku agents on raw/old/new, 3 runs per cell.
S=/tmp/claude-0/-home-user-bws-claude-mods-dev/760f7ba1-34a3-5ceb-b711-31332de7c2eb/scratchpad
export EVAL_MODS=$S/mods EVAL_CWD=$S/evalcwd EVAL_WT=$S/wt EVAL_CASES=cases-vague.json
EVAL_OUT=out-b-vague EVAL_SAMPLES=3 python3 eval.py gen && EVAL_OUT=out-b-vague EVAL_SAMPLES=3 python3 eval.py judge && EVAL_OUT=out-b-vague EVAL_SAMPLES=3 python3 eval.py report | sed -n 5,14p
export EVAL_REWRITES=out-b-vague/gen.json EVAL_TASKS=tests-vague,sort-vague,fork-vague,docs-vague EVAL_EXECUTORS=haiku EVAL_RUNS=3 EVAL_A_OUT=out-a-vague EVAL_PAR=4
python3 outcome.py run && python3 outcome.py judge && python3 outcome.py report | sed -n 1,30p
echo "vague exit $?"
