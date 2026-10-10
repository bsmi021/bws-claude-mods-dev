"""Every Bash/PowerShell command from the last 30 days of ~/.claude/projects transcripts, deduped,
as JSON lines {tool, command}. Day-job projects are excluded. Usage: corpus_build.py <out.jsonl>"""
import json, os, glob, sys, time
from pathlib import Path

ROOT = Path.home() / '.claude' / 'projects'
CUT = time.time() - 30 * 86400
out_path = Path(sys.argv[1])
seen = set()
n = 0
with out_path.open('w', encoding='utf-8') as out:
    for f in glob.glob(str(ROOT / '**' / '*.jsonl'), recursive=True):
        if os.path.getmtime(f) < CUT or 'sas-ai-governance' in f:
            continue
        for line in open(f, encoding='utf-8', errors='replace'):
            if '"tool_use"' not in line or len(line) > 3_000_000:
                continue
            try:
                d = json.loads(line)
            except Exception:
                continue
            content = (d.get('message') or {}).get('content')
            if d.get('type') != 'assistant' or not isinstance(content, list):
                continue
            for b in content:
                if isinstance(b, dict) and b.get('type') == 'tool_use' and b.get('name') in ('Bash', 'PowerShell'):
                    cmd = (b.get('input') or {}).get('command')
                    if isinstance(cmd, str) and (b['name'], cmd) not in seen:
                        seen.add((b['name'], cmd))
                        out.write(json.dumps({'tool': b['name'], 'command': cmd}) + '\n')
                        n += 1
print('commands', n)
