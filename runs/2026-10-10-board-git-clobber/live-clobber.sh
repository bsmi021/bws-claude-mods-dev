#!/usr/bin/env bash
# Live run for the bws-board 0.4.0 overwrite guard (PLAN.md finish line, "Live run"). Headless haiku
# sessions in a scratch repo; bws-board loads from the user settings' CLAUDE_CODE_PLUGIN_DIRS (this
# repo's tree), with default options. No session ever runs git before B, so no git lease is involved.
#   A (api)    changes tracked a.txt and creates untracked new.txt (both claimed), then holds its turn.
#   The script changes b.txt itself, outside any session: dirty but claimed by nobody.
#   B (tests)  runs git stash, git checkout ., git reset --hard, git clean -fd (each must be refused),
#              then git stash push -- b.txt (must go through).
#   Proof:     a.txt and new.txt are copied out after the run; git status and git stash list too.
# Usage: live-clobber.sh <scratch dir> <receipts dir>
set -u
SCRATCH="$1"
OUT="$2"
rm -rf "$SCRATCH" && mkdir -p "$SCRATCH" "$OUT" && cd "$SCRATCH" || exit 1
git init -q . && printf 'a\n' > a.txt && printf 'b\n' > b.txt && git add . && git -c user.email=t@t -c user.name=t commit -qm init
git config user.email t@t && git config user.name t
KEY=$(pwd -W | tr 'A-Z' 'a-z' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g')
DIR="$HOME/.claude/bws-board/$KEY"
GO="$SCRATCH/../clobber-live-go.flag"
rm -f "$GO"
rm -rf "$DIR"
echo "board dir: $DIR" > "$OUT/board-dir.txt"
COMMON=(--permission-mode acceptEdits --model haiku --output-format stream-json --verbose)

BWS_AGENT_ROLE=api claude -p "Do these steps in order. 1) Use the Write tool to overwrite a.txt with the single line: from A. 2) Use the Write tool to create new.txt with the single line: new work from A. 3) Run this Bash command exactly (it waits for a signal): until [ -f $GO ]; do sleep 2; done; echo go 4) Reply A-DONE." \
  --allowedTools "Bash(until:*)" "${COMMON[@]}" > "$OUT/A.jsonl" 2> "$OUT/A.err" &
APID=$!

for i in $(seq 1 90); do
  if grep -q 'new.txt' "$DIR"/*.json 2>/dev/null; then break; fi
  sleep 1
done
echo "A claimed a.txt and new.txt at $(date -u +%H:%M:%S)Z" > "$OUT/timeline.txt"

printf 'from B\n' > b.txt
BWS_AGENT_ROLE=tests claude -p "Run each of these Bash commands exactly once, in order, one per tool call, and for each report whether it ran or was refused, quoting any refusal's first sentence. Do not retry a refused command and do not work around a refusal. 1) git stash 2) git checkout . 3) git reset --hard 4) git clean -fd 5) git stash push -m mine -- b.txt 6) git stash list. Then reply B-DONE." \
  --allowedTools "Bash(git:*)" "${COMMON[@]}" > "$OUT/B.jsonl" 2> "$OUT/B.err"
echo "B finished at $(date -u +%H:%M:%S)Z" >> "$OUT/timeline.txt"

# Before A is released: A's files as B left them.
cp a.txt "$OUT/a-after-B.txt" 2>/dev/null || echo "a.txt missing" > "$OUT/a-after-B.txt"
cp new.txt "$OUT/new-after-B.txt" 2>/dev/null || echo "new.txt missing" > "$OUT/new-after-B.txt"
git status --short > "$OUT/git-status-after-B.txt"
git stash list > "$OUT/git-stash-list.txt"

touch "$GO"
wait $APID
echo "A finished at $(date -u +%H:%M:%S)Z" >> "$OUT/timeline.txt"
sleep 1

MSYS_NO_PATHCONV=1 claude -p "/board digest" --output-format stream-json --verbose > "$OUT/digest-cmd.jsonl" 2> "$OUT/digest-cmd.err"
mkdir -p "$OUT/history"
cp "$DIR"/history/*.json "$OUT/history/" 2>/dev/null
cp "$DIR/digest.html" "$OUT/digest.html" 2>/dev/null
rm -f "$GO"
echo "live run finished"
