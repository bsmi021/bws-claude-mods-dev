#!/usr/bin/env bash
# Live two-session acceptance run for bws-board 0.1.0 (PLAN.md finish line, checks 1 and 2).
# bws-board loads with --plugin-dir. The user settings' CLAUDE_CODE_PLUGIN_DIRS still loads the
# other bws mods (a shell export does not override settings env), so cockpit's Session Bus is
# switched off with --settings to keep it out of the claim check.
# Usage: live.sh <scratch dir> <receipts dir> <plugin dir> <settings file>
set -u
SCRATCH="$1"
OUT="$2"
PLUGIN="$3"
SETTINGS="$4"
rm -rf "$SCRATCH" && mkdir -p "$SCRATCH" && cd "$SCRATCH" || exit 1
git init -q . && printf 'from nobody\n' > notes.txt && git add . && git -c user.email=t@t -c user.name=t commit -qm init
KEY=$(pwd -W | tr 'A-Z' 'a-z' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g')
DIR="$HOME/.claude/bws-board/$KEY"
ANSWERED="$SCRATCH/answered.flag"
FLAG="$SCRATCH/release.flag"
echo "board dir: $DIR" > "$OUT/live-board-dir.txt"
rm -rf "$DIR"
snap() { mkdir -p "$OUT/$1" && cp "$DIR"/*.json "$OUT/$1/" 2>/dev/null; }
TOOLS="mcp__bws-board__board_status mcp__bws-board__board_ask mcp__bws-board__board_take mcp__bws-board__board_done mcp__bws-board__board_send"

# A (api): claims notes.txt, asks the tests role, waits on a flag the script sets once A's own card
# records the ask done (the heartbeat that does that also queues the news for A's next tool
# result), then holds until /board has run, then reports. A cannot read the board folder itself:
# it is outside its working directory.
BWS_AGENT_ROLE=api claude -p "Do these steps in order. 1) Use the Write tool to overwrite notes.txt with the single line: from A. 2) Call mcp__bws-board__board_ask with to \"tests\" and text \"Run the auth suite against /login\". 3) Run this Bash command exactly (it waits for the answer): until [ -f $ANSWERED ]; do sleep 2; done; echo answered 4) Run this Bash command exactly: until [ -f $FLAG ]; do sleep 2; done; echo released 5) Call mcp__bws-board__board_status. Finally reply with: every piece of bws-board context you received after any tool result (it arrives as additional context, not in the tool output itself), quoted verbatim; then the board_status result verbatim; then A-DONE." \
  --plugin-dir "$PLUGIN" --settings "$SETTINGS" --permission-mode acceptEdits --allowedTools "Bash(until:*)" $TOOLS --model haiku \
  --output-format stream-json --verbose > "$OUT/live-A.jsonl" 2> "$OUT/live-A.err" &
APID=$!

# Wait until A's ask is on its card.
for i in $(seq 1 60); do
  if ls "$DIR"/*.json >/dev/null 2>&1 && grep -q '"text": "Run the auth suite' "$DIR"/*.json; then break; fi
  sleep 2
done
snap live-cards-1-A-asked

# B (tests): reports what the board told it, is refused A's file, takes the ask, runs the suite, finishes it.
BWS_AGENT_ROLE=tests claude -p "Do these steps in order. 1) Quote verbatim any 'Board:' context you were given about other sessions and asks (or say there was none). 2) Read notes.txt, then use the Edit tool to replace 'from A' with 'from B' in it, and report exactly what happened, quoting any error text verbatim. Do not retry it another way. 3) Call mcp__bws-board__board_take with the id of the open ask addressed to tests. 4) The auth suite in this repository is the command: echo 12 passed. Run it with Bash, then call mcp__bws-board__board_done with that ask id and the note set to its exact output. 5) Call mcp__bws-board__board_status and quote its result verbatim. Then reply B-DONE." \
  --plugin-dir "$PLUGIN" --settings "$SETTINGS" --permission-mode acceptEdits --allowedTools "Bash(echo:*)" $TOOLS --model haiku \
  --output-format stream-json --verbose > "$OUT/live-B.jsonl" 2> "$OUT/live-B.err"
snap live-cards-2-B-exited

# A's heartbeat settles the done into A's card (and queues the news); then let A's wait end.
for i in $(seq 1 30); do
  if grep -l '"state": "done"' "$DIR"/*.json >/dev/null 2>&1; then break; fi
  sleep 2
done
snap live-cards-2b-A-settled
touch "$ANSWERED"
sleep 5

# /board as a person would type it, while A is still live (A holds until the flag).
MSYS_NO_PATHCONV=1 claude -p "/board" --plugin-dir "$PLUGIN" --settings "$SETTINGS" --output-format stream-json --verbose > "$OUT/live-board-cmd.jsonl" 2> "$OUT/live-board-cmd.err"
touch "$FLAG"

wait $APID
sleep 1
snap live-cards-3-end
cp notes.txt "$OUT/live-notes-final.txt"
echo "live run finished"
