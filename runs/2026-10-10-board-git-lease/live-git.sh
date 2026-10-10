#!/usr/bin/env bash
# Live run for the bws-board 0.3.0 git lease (PLAN.md finish line, "Live run"). Headless sessions in a
# scratch repo; bws-board loads from the user settings' CLAUDE_CODE_PLUGIN_DIRS (this repo's tree).
# The lease is set to 1 minute (--settings) so it lapses while A is still live and still claims a.txt:
#   A (api)    writes a.txt, runs git add a.txt (takes the lease), then holds its turn open.
#   B1 (tests) within the minute: git add b.txt && git commit -> refused, the lease is A's.
#   B2 (tests) after the lease lapsed: git add -A && git commit -> refused, a.txt is A's claimed file;
#              it follows the fix and commits only b.txt.
#   A          is released and commits a.txt itself.
# Usage: live-git.sh <scratch dir> <receipts dir> <settings file>
set -u
SCRATCH="$1"
OUT="$2"
SETTINGS="$3"
rm -rf "$SCRATCH" && mkdir -p "$SCRATCH" "$OUT" && cd "$SCRATCH" || exit 1
git init -q . && printf 'a\n' > a.txt && printf 'b\n' > b.txt && git add . && git -c user.email=t@t -c user.name=t commit -qm init
git config user.email t@t && git config user.name t
KEY=$(pwd -W | tr 'A-Z' 'a-z' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g')
DIR="$HOME/.claude/bws-board/$KEY"
GO="$SCRATCH/../git-live-go.flag"
rm -f "$GO"
rm -rf "$DIR"
echo "board dir: $DIR" > "$OUT/board-dir.txt"
TOOLS="mcp__bws-board__board_status"
COMMON=(--settings "$SETTINGS" --permission-mode acceptEdits --model haiku --output-format stream-json --verbose)

BWS_AGENT_ROLE=api claude -p "Do these steps in order. 1) Use the Write tool to overwrite a.txt with the single line: from A. 2) Run this Bash command exactly: git add a.txt 3) Run this Bash command exactly (it waits for a signal): until [ -f $GO ]; do sleep 2; done; echo go 4) Run this Bash command exactly: git add a.txt && git commit -m 'A: a.txt' and report its output. Then reply A-DONE." \
  --allowedTools "Bash(git:*)" "Bash(until:*)" $TOOLS "${COMMON[@]}" > "$OUT/A.jsonl" 2> "$OUT/A.err" &
APID=$!

for i in $(seq 1 90); do
  if grep -q '"verb": "add"' "$DIR"/*.json 2>/dev/null; then break; fi
  sleep 1
done
T_ADD=$(date +%s)
echo "A took the lease at $(date -u +%H:%M:%S)Z" > "$OUT/timeline.txt"

printf 'from B\n' > b.txt
BWS_AGENT_ROLE=tests claude -p "Run this Bash command exactly once: git add b.txt && git commit -m 'B: b.txt' and then report exactly what happened, quoting any refusal in full. Do not retry it and do not work around it. Then reply B1-DONE." \
  --allowedTools "Bash(git:*)" $TOOLS "${COMMON[@]}" > "$OUT/B1.jsonl" 2> "$OUT/B1.err"
echo "B1 finished at $(date -u +%H:%M:%S)Z ($(( $(date +%s) - T_ADD )) s after A's add)" >> "$OUT/timeline.txt"

# Let the one-minute lease lapse; A is still live and still claims a.txt.
while [ $(( $(date +%s) - T_ADD )) -lt 70 ]; do sleep 2; done
echo "B2 starts at $(date -u +%H:%M:%S)Z ($(( $(date +%s) - T_ADD )) s after A's add)" >> "$OUT/timeline.txt"
BWS_AGENT_ROLE=tests claude -p "Step 1: run this Bash command exactly: git add -A && git commit -m 'B: all changes' and quote what happened in full. Step 2: if it was refused, follow the refusal's instructions so that you commit only your own file b.txt with the message 'B: b.txt' (do not touch a.txt's content). Step 3: run git log --stat -2 and git status --short and quote them. Then reply B2-DONE." \
  --allowedTools "Bash(git:*)" $TOOLS "${COMMON[@]}" > "$OUT/B2.jsonl" 2> "$OUT/B2.err"
echo "B2 finished at $(date -u +%H:%M:%S)Z" >> "$OUT/timeline.txt"

touch "$GO"
wait $APID
echo "A finished at $(date -u +%H:%M:%S)Z" >> "$OUT/timeline.txt"
sleep 1

MSYS_NO_PATHCONV=1 claude -p "/board digest" --output-format stream-json --verbose > "$OUT/digest-cmd.jsonl" 2> "$OUT/digest-cmd.err"
mkdir -p "$OUT/history"
cp "$DIR"/history/*.json "$OUT/history/" 2>/dev/null
cp "$DIR/digest.html" "$OUT/digest.html" 2>/dev/null
git log --stat > "$OUT/git-log.txt"
git status --short > "$OUT/git-status.txt"
rm -f "$GO"
echo "live run finished"
