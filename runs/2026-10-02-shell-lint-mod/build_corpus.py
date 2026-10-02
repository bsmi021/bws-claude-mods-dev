"""Extract every Bash/PowerShell tool_use (last 30 days) with its result into corpus.jsonl."""
import json, os, glob, re, datetime as dt
from pathlib import Path

ROOT = Path.home() / '.claude' / 'projects'
CUT = dt.datetime(2026, 9, 2, tzinfo=dt.timezone.utc).timestamp()
OUT = Path(__file__).resolve().parent / 'corpus.jsonl'

def result_text(c):
    if isinstance(c, str):
        return c
    if isinstance(c, list):
        return '\n'.join(b.get('text', '') for b in c if isinstance(b, dict) and b.get('type') == 'text')
    return ''

n = 0
seen = set()
with OUT.open('w', encoding='utf-8') as out:
    for f in glob.glob(str(ROOT / '**' / '*.jsonl'), recursive=True):
        if os.path.getmtime(f) < CUT:
            continue
        proj = Path(f).relative_to(ROOT).parts[0]
        if 'sas-ai-governance' in proj:
            continue  # day-job work: excluded
        pend = {}
        for line in open(f, encoding='utf-8', errors='replace'):
            if '"tool_use"' not in line and '"tool_result"' not in line:
                continue
            if len(line) > 3_000_000:
                continue
            try:
                d = json.loads(line)
            except Exception:
                continue
            msg = d.get('message') or {}
            c = msg.get('content')
            if not isinstance(c, list):
                continue
            if d.get('type') == 'assistant':
                for b in c:
                    if isinstance(b, dict) and b.get('type') == 'tool_use' and b.get('name') in ('Bash', 'PowerShell'):
                        cmd = (b.get('input') or {}).get('command')
                        if isinstance(cmd, str):
                            pend[b.get('id')] = (b.get('name'), cmd, d.get('timestamp'), d.get('version'), d.get('entrypoint'), d.get('cwd'), {k: v for k, v in (b.get('input') or {}).items() if k not in ('command', 'description')})
            elif d.get('type') == 'user':
                for b in c:
                    if isinstance(b, dict) and b.get('type') == 'tool_result' and b.get('tool_use_id') in pend:
                        tid = b['tool_use_id']
                        if tid in seen:
                            continue
                        seen.add(tid)
                        tool, cmd, ts, ver, entry, cwd, flags = pend.pop(tid)
                        txt = result_text(b.get('content'))
                        out.write(json.dumps({'id': tid, 'proj': proj, 'ts': ts, 'tool': tool, 'command': cmd, 'version': ver, 'entrypoint': entry, 'cwd': cwd, 'flags': flags,
                                              'is_error': bool(b.get('is_error')), 'text': txt[:1500]}) + '\n')
                        n += 1
print('records', n)
