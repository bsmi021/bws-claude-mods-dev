"""Prints the newest main-thread replies' cache_creation objects, newest first, one JSON object per line.

Usage: python ttl.py <transcript.jsonl>. bws-cockpit's cache clock reads which TTL (5m or 1h) Anthropic wrote the
cache with from them. Reads only the file's last 2 MB; prints nothing when no reply wrote to the cache.
"""
import json
import sys

TAIL = 2_000_000
WANT = 5


def main() -> int:
    if len(sys.argv) < 2:
        return 2
    with open(sys.argv[1], 'rb') as f:
        f.seek(0, 2)
        size = f.tell()
        f.seek(max(0, size - TAIL))
        lines = f.read().decode('utf-8', 'ignore').splitlines()
    if size > TAIL:
        lines = lines[1:]  # the first line was cut
    found = 0
    for line in reversed(lines):
        try:
            j = json.loads(line)
        except ValueError:
            continue
        if not isinstance(j, dict) or j.get('type') != 'assistant' or j.get('isSidechain'):
            continue
        cc = ((j.get('message') or {}).get('usage') or {}).get('cache_creation')
        if not isinstance(cc, dict):
            continue
        if not (cc.get('ephemeral_5m_input_tokens') or cc.get('ephemeral_1h_input_tokens')):
            continue
        print(json.dumps(cc))
        found += 1
        if found >= WANT:
            break
    return 0


if __name__ == '__main__':
    sys.exit(main())
