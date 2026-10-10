"""Tool calls after the prove-motion finish-line block, until the next real prompt."""
import json, glob, os
ROOT = os.path.expanduser('~/.claude/projects')
for f in glob.glob(ROOT + '/C--Projects-bws-applications-motion-capture*/*.jsonl'):
    on = False
    for line in open(f, encoding='utf-8', errors='replace'):
        try: d = json.loads(line)
        except Exception: continue
        c = (d.get('message') or {}).get('content')
        if d.get('type') == 'user' and isinstance(c, str):
            if 'bws-cockpit finish line' in c and 'prove-motion' in c:
                on = True; print('BLOCK', d['timestamp'], f[-50:]); continue
            if on and not d.get('isMeta') and not c.startswith('<'):
                print('NEXT PROMPT', c[:100]); on = False
        if on and d.get('type') == 'assistant' and isinstance(c, list):
            for b in c:
                if isinstance(b, dict) and b.get('type') == 'tool_use':
                    i = b.get('input') or {}
                    print(' ', b['name'], str(i.get('command') or i.get('file_path') or i.get('description') or '')[:110].replace('\n', ' '))
                if isinstance(b, dict) and b.get('type') == 'text': print('  TEXT', b['text'][:160].replace('\n', ' '))
