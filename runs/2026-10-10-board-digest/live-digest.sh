#!/usr/bin/env bash
# Live two-session run for bws-board 0.2.0 (PLAN.md finish line, check 3): two headless sessions
# work in a scratch repo, then /board digest writes the team page from their history files.
# bws-board loads from the user settings' CLAUDE_CODE_PLUGIN_DIRS (this repo's working tree).
# Usage: live-digest.sh <scratch dir> <receipts dir>
set -u
SCRATCH="$1"
OUT="$2"
rm -rf "$SCRATCH" && mkdir -p "$SCRATCH" "$OUT" && cd "$SCRATCH" || exit 1
git init -q . && printf 'from nobody\n' > notes.txt && git add . && git -c user.email=t@t -c user.name=t commit -qm init
KEY=$(pwd -W | tr 'A-Z' 'a-z' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g')
DIR="$HOME/.claude/bws-board/$KEY"
ANSWERED="$SCRATCH/answered.flag"
echo "board dir: $DIR" > "$OUT/live-board-dir.txt"
rm -rf "$DIR"
TOOLS="mcp__bws-board__board_status mcp__bws-board__board_ask mcp__bws-board__board_take mcp__bws-board__board_done mcp__bws-board__board_send"

# A (api): claims notes.txt, asks the tests role, waits until the script sees the ask done.
BWS_AGENT_ROLE=api claude -p "Do these steps in order. 1) Use the Write tool to overwrite notes.txt with the single line: from A. 2) Call mcp__bws-board__board_ask with to \"tests\" and text \"Run the auth suite against /login\". 3) Run this Bash command exactly (it waits for the answer): until [ -f $ANSWERED ]; do sleep 2; done; echo answered 4) Call mcp__bws-board__board_status and quote it verbatim. Then reply A-DONE." \
  --permission-mode acceptEdits --allowedTools "Bash(until:*)" $TOOLS --model haiku \
  --output-format stream-json --verbose > "$OUT/live-A.jsonl" 2> "$OUT/live-A.err" &
APID=$!

for i in $(seq 1 60); do
  if ls "$DIR"/*.json >/dev/null 2>&1 && grep -q '"text": "Run the auth suite' "$DIR"/*.json; then break; fi
  sleep 2
done

# B (tests): is refused A's file, takes and finishes the ask, then asks A (urgent) to release the file.
BWS_AGENT_ROLE=tests claude -p "Do these steps in order. 1) Read notes.txt, then use the Edit tool to replace 'from A' with 'from B' in it, and report exactly what happened. Do not retry it another way. 2) Call mcp__bws-board__board_take with the id of the open ask addressed to tests. 3) The auth suite in this repository is the command: echo 12 passed. Run it with Bash, then call mcp__bws-board__board_done with that ask id and the note set to its exact output. 4) Call mcp__bws-board__board_ask with to \"api\", urgent true, and text \"Please release notes.txt when you are done with it\", and quote its result verbatim. Then reply B-DONE." \
  --permission-mode acceptEdits --allowedTools "Bash(echo:*)" $TOOLS --model haiku \
  --output-format stream-json --verbose > "$OUT/live-B.jsonl" 2> "$OUT/live-B.err"

for i in $(seq 1 30); do
  if grep -l '"state": "done"' "$DIR"/*.json >/dev/null 2>&1; then break; fi
  sleep 2
done
touch "$ANSWERED"
wait $APID
sleep 1

# The digest, as a person would type it.
MSYS_NO_PATHCONV=1 claude -p "/board digest" --output-format stream-json --verbose > "$OUT/live-digest-cmd.jsonl" 2> "$OUT/live-digest-cmd.err"
mkdir -p "$OUT/history"
cp "$DIR"/history/*.json "$OUT/history/"
cp "$DIR/digest.html" "$OUT/digest.html"
cp notes.txt "$OUT/live-notes-final.txt"
echo "live run finished"
