#!/usr/bin/env bash
# Live two-session check of the bws-cockpit Session Bus. bws-cockpit loads through
# CLAUDE_CODE_PLUGIN_DIRS, so no --plugin-dir. Usage: live.sh <scratch dir> <receipts dir>
set -u
SCRATCH="$1"
OUT="$2"
rm -rf "$SCRATCH" && mkdir -p "$SCRATCH" && cd "$SCRATCH" || exit 1
git init -q . && printf 'from nobody\n' > notes.txt && git add . && git -c user.email=t@t -c user.name=t commit -qm init
KEY=$(pwd -W | tr 'A-Z' 'a-z' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g')
BUS="$HOME/.claude/bws-cockpit/bus/$KEY.json"
echo "bus file: $BUS" > "$OUT/live-bus-path.txt"
rm -f "$BUS"

# A: claims notes.txt by writing it, then holds the session open with a 90 s sleep.
claude -p "Use the Write tool to overwrite notes.txt with the single line: from A. Then run this Bash command exactly: sleep 90. Then reply A-DONE." \
  --permission-mode acceptEdits --allowedTools "Bash(sleep:*)" --model haiku \
  --output-format stream-json --verbose > "$OUT/live-A.jsonl" 2> "$OUT/live-A.err" &
APID=$!

# Wait until A's claim on notes.txt is on the bus.
for i in $(seq 1 60); do
  if [ -f "$BUS" ] && grep -q '"path": ".*notes.txt"' "$BUS"; then break; fi
  sleep 2
done
cp "$BUS" "$OUT/live-bus-1-A-claimed.json" 2>/dev/null

# B: starts in the same folder, reports what the bus told it, then tries to edit A's file.
claude -p "Before anything else: quote verbatim any 'Session bus' context you were given about other sessions in this folder (or say there was none). Then use the Edit tool to replace 'from A' with 'from B' in notes.txt (read it first). Report exactly what happened to the edit, quoting any error text verbatim. Then call mcp__bws-cockpit__bus_send to the other session with the text: B wants notes.txt, please release it." \
  --permission-mode acceptEdits --model haiku \
  --output-format stream-json --verbose > "$OUT/live-B.jsonl" 2> "$OUT/live-B.err"
cp "$BUS" "$OUT/live-bus-2-after-B-exit.json" 2>/dev/null

wait $APID
sleep 1
if [ -f "$BUS" ]; then cp "$BUS" "$OUT/live-bus-3-after-A-exit.json"; else echo "no bus file" > "$OUT/live-bus-3-after-A-exit.json"; fi
cp notes.txt "$OUT/live-notes-final.txt"
echo "live run finished"
