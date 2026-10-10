"""Finish-line blocks: did this session itself write to the blocked run folder? Context around each block. Guard hard fires."""
import json, glob, os, re, collections as C, datetime as dt, sys
ROOT = os.path.expanduser('~/.claude/projects')
CUT = dt.datetime(2026, 10, 3, 4, tzinfo=dt.timezone.utc)
out = []; guard = []
for f in glob.glob(ROOT + '/**/*.jsonl', recursive=True):
    if os.path.getmtime(f) < CUT.timestamp(): continue
    rows = []
    for line in open(f, encoding='utf-8', errors='replace'):
        if len(line) > 3_000_000: continue
        try: rows.append(json.loads(line))
        except Exception: pass
    written = set(); last_text = ''; pend = {}
    for i, d in enumerate(rows):
        if d.get('timestamp') and d['timestamp'] < '2026-10-03T04': continue
        m = d.get('message') or {}; c = m.get('content')
        if d.get('type') == 'assistant' and isinstance(c, list):
            for b in c:
                if not isinstance(b, dict): continue
                if b.get('type') == 'text': last_text = b['text']
                if b.get('type') == 'tool_use':
                    inp = b.get('input') or {}
                    pend[b.get('id')] = (b.get('name'), str(inp.get('command', ''))[:400])
                    blob = json.dumps(inp).replace('\\', '/')
                    for r in re.findall(r'runs/(20\d\d-\d\d-\d\d-[\w.-]+)', blob): written.add(r)
        if d.get('type') == 'user' and isinstance(c, list):
            for b in c:
                if isinstance(b, dict) and b.get('type') == 'tool_result':
                    t = b.get('content'); t = t if isinstance(t, str) else json.dumps(t)
                    if t.startswith('<tool_use_error>bws-cockpit:') or 'bws-cockpit: ' in t[:40]:
                        guard.append((f.split(os.sep)[-2][11:35] if os.sep in f else f[-60:], pend.get(b.get('tool_use_id')), t[:200]))
        if d.get('type') == 'user' and isinstance(c, str) and 'bws-cockpit finish line' in c:
            rf = re.search(r'runs/(20\d\d-\d\d-\d\d-[\w.-]+?) still', c)
            rf = rf.group(1) if rf else None
            nxt = ''
            for d2 in rows[i+1:i+40]:
                c2 = (d2.get('message') or {}).get('content')
                if d2.get('type') == 'user' and isinstance(c2, str) and not d2.get('isMeta') and not c2.startswith('<'):
                    nxt = c2[:160]; break
            out.append(dict(file=os.path.relpath(f, ROOT)[11:60], entry=d.get('entrypoint'), folder=rf,
                            session_touched_folder=(rf in written) if rf else None,
                            kind='evidence' if 'cites no' in c else 'open', reply_before=last_text[-300:], next_prompt=nxt))
json.dump(dict(blocks=out, guard=guard), open('receipts/finish_guard_detail.json', 'w'), indent=1)
print('blocks', len(out), 'open-item blocks where session never touched folder:',
      sum(1 for o in out if o['kind'] == 'open' and o['session_touched_folder'] is False), '/', sum(1 for o in out if o['kind'] == 'open'))
print('guard hard fires', len(guard))
for g in guard: print(g)
