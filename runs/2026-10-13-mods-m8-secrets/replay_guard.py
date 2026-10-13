"""FR-SB-03 false-positive replay: the Bash rule of bws-secrets/hooks/guard.ts (bashTouches + dirForms, ported 1:1)
over the real Bash commands in this machine's Claude Code transcripts of the last 30 days. Read only. Prints counts,
and only the refused commands (which name the secrets folder), cut to 160 characters.

    python runs/2026-10-13-mods-m8-secrets/replay_guard.py > runs/2026-10-13-mods-m8-secrets/receipts/t04-corpus-replay.txt
"""
import json
import os
import re
import sys
import time
from pathlib import Path

HOME = str(Path.home()).replace("\\", "/")
DIR = f"{HOME}/.claude/bws-secrets"


def key(p: str) -> str:
    s = re.sub(r"/+", "/", p.replace("\\", "/").lower())
    return re.sub(r"(.)/$", r"\1", s)


def dir_forms(d: str, home: str, cwd: str) -> list[str]:
    d = key(d)
    forms = [d]
    m = re.match(r"^([a-z]):/(.*)$", d)
    if m:
        forms.append(f"/{m.group(1)}/{m.group(2)}")
    h = key(home)
    if h and d.startswith(h + "/"):
        rel = d[len(h) + 1:]
        for base in ["~", "$home", "${home}", "%userprofile%", "$env:userprofile", "${env:userprofile}"]:
            forms.append(f"{base}/{rel}")
    c = key(cwd)
    if c and d.startswith(c + "/"):
        forms.append(d[len(c) + 1:])
    return list(dict.fromkeys(forms))


def flat(command: str) -> str:
    s = command.replace("\\", "/").lower()
    s = re.sub(r"[\"'`]", "", s)
    return re.sub(r"/+", "/", s)


def touches(command: str, forms: list[str]) -> bool:
    c = flat(command)
    for f in forms:
        i = c.find(f)
        while i >= 0:
            after = c[i + len(f)] if i + len(f) < len(c) else ""
            if after == "" or after == "/" or not re.match(r"[a-z0-9_.-]", after):
                return True
            i = c.find(f, i + 1)
    return False


def main() -> int:
    root = Path.home() / ".claude" / "projects"
    since = time.time() - 30 * 86400
    files = [p for p in root.glob("*/*.jsonl") if p.stat().st_mtime >= since]
    total = 0
    refused: list[str] = []
    for p in files:
        try:
            lines = p.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            continue
        for line in lines:
            if '"Bash"' not in line:
                continue
            try:
                o = json.loads(line)
            except ValueError:
                continue
            msg = o.get("message") or {}
            content = msg.get("content") if isinstance(msg, dict) else None
            if not isinstance(content, list):
                continue
            cwd = o.get("cwd") or ""
            for b in content:
                if isinstance(b, dict) and b.get("type") == "tool_use" and b.get("name") == "Bash":
                    cmd = (b.get("input") or {}).get("command")
                    if not isinstance(cmd, str):
                        continue
                    total += 1
                    if touches(cmd, dir_forms(DIR, HOME, cwd)):
                        refused.append(cmd)
    print(f"bws-secrets FR-SB-03 corpus replay, {time.strftime('%Y-%m-%d %H:%M')}")
    print(f"secrets folder: ~/.claude/bws-secrets; transcripts (last 30 days): {len(files)}; Bash commands: {total}")
    print(f"refused: {len(refused)}")
    for c in refused:
        print("  - " + c.replace("\n", " ")[:160])
    return 0


if __name__ == "__main__":
    sys.exit(main())
