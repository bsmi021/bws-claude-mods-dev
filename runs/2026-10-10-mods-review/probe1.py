import json, glob, os, re, collections as C, datetime as dt
ROOT = os.path.expanduser('~/.claude/projects')
CUT = dt.datetime(2026, 10, 3, 4, tzinfo=dt.timezone.utc).timestamp()
lc = C.Counter(); resume_prompts = []
for f in glob.glob(ROOT + '/**/*.jsonl', recursive=True):
    if os.path.getmtime(f) < CUT: continue
    for line in open(f, encoding='utf-8', errors='replace'):
        if 'local_command' not in line and 'Resume the run' not in line and 'resume' not in line.lower(): continue
        try: d = json.loads(line)
        except Exception: continue
        if d.get('subtype') == 'local_command':
            t = str(d.get('content')); m = re.search(r'<command-name>/?([^<]+)', t)
            lc[m.group(1) if m else re.sub(r'\s+',' ',t)[:70]] += 1
        elif d.get('type') == 'user' and isinstance((d.get('message') or {}).get('content'), str):
            c = d['message']['content']
            if re.search(r'resume (the )?(newest )?run|runs/\S+.*(RUNLOG|finish line)', c, re.I) and not c.startswith('<') and len(resume_prompts) < 15:
                resume_prompts.append((d.get('entrypoint'), c[:160]))
print(lc.most_common(40))
for r in resume_prompts: print(r)
