import json, os, re, glob, collections as C, datetime as dt, sys
ROOT = os.path.expanduser('~/.claude/projects')
CUT = dt.datetime(2026, 9, 2, tzinfo=dt.timezone.utc)
OUT = os.path.dirname(os.path.abspath(__file__))


def ts(s):
    try:
        return dt.datetime.fromisoformat(s.replace('Z', '+00:00'))
    except Exception:
        return None


def domain(proj, exts):
    p = proj.lower()
    if any(k in p for k in ['tms', 'heim', 'unreal']):
        return 'unreal'
    u = exts.get('.cs', 0) + exts.get('.unity', 0) + exts.get('.prefab', 0) + exts.get('.asset', 0)
    ue = exts.get('.cpp', 0) + exts.get('.h', 0) + exts.get('.uasset', 0)
    w = sum(exts.get(e, 0) for e in ['.ts', '.tsx', '.js', '.jsx', '.html', '.css', '.astro', '.vue', '.svelte', '.mjs'])
    k = exts.get('.kt', 0) + exts.get('.kts', 0)
    py = exts.get('.py', 0)
    m = max([(ue, 'unreal'), (u, 'unity'), (w, 'web'), (k, 'android'), (py, 'python/tools')])
    return m[1] if m[0] > 0 else 'other'


S = {}
tools = C.Counter(); tool_err = C.Counter(); err_samples = C.defaultdict(list)
cmd_first = C.Counter(); mcp_srv = C.Counter(); mcp_err = C.Counter(); skills = C.Counter(); agents = C.Counter()
slash = C.Counter(); interrupts = 0; compacts = C.Counter(); api_err = C.Counter()
corrections = []; prompts = []; hook_fail = C.Counter(); deny = C.Counter()
model_tok = C.Counter(); model_turns = C.Counter(); refusal_fallback = 0
CORR = re.compile(r"^(no[,. !]|nope|wrong|stop|that.?s not|not what|still (broken|not|fail)|didn.?t work|doesn.?t work|you (forgot|missed|didn.?t)|why did you|i said|again[,.]|revert|undo)", re.I)

files = [f for f in glob.glob(ROOT + '/**/*.jsonl', recursive=True) if os.path.getmtime(f) >= CUT.timestamp()]
for i, f in enumerate(files):
    rel = os.path.relpath(f, ROOT).replace('\\', '/')
    proj = rel.split('/')[0]
    sub = '/subagents/' in rel
    try:
        fh = open(f, encoding='utf-8', errors='replace')
    except Exception:
        continue
    pend = {}
    for line in fh:
        if len(line) > 3_000_000:
            continue
        try:
            d = json.loads(line)
        except Exception:
            continue
        t = d.get('type')
        sid = (d.get('sessionId') or rel) + ('#sub:' + rel if sub else '')
        tm = ts(d['timestamp']) if d.get('timestamp') else None
        if tm and tm < CUT:
            continue
        s = S.setdefault(sid, dict(proj=proj, sub=sub, first=None, last=None, entry=None, prompts=0, tools=0, errs=0,
                                   cost=0.0, added=0, removed=0, models=C.Counter(), exts=C.Counter(), compacts=0,
                                   interrupts=0, out_tok=0))
        if tm:
            if not s['first'] or tm < s['first']: s['first'] = tm
            if not s['last'] or tm > s['last']: s['last'] = tm
        if t == 'cost-state':
            s['cost'] = d.get('totalCostUSD') or 0
            s['added'] = d.get('totalLinesAdded') or 0
            s['removed'] = d.get('totalLinesRemoved') or 0
            continue
        if t == 'system':
            st = d.get('subtype')
            if st == 'compact_boundary':
                s['compacts'] += 1; compacts[proj] += 1
            elif st == 'api_error':
                api_err[str(d.get('error') or d.get('content') or '')[:100]] += 1
            elif st == 'model_refusal_fallback':
                refusal_fallback += 1
            continue
        if t == 'attachment':
            a = d.get('attachment') or {}
            at = a.get('type', '')
            if at.startswith('hook_') and at not in ('hook_success', 'hook_additional_context'):
                hook_fail[(at, str(a.get('hookName')), str(a.get('command', ''))[:70])] += 1
            continue
        msg = d.get('message') or {}
        if t == 'user':
            if s['entry'] is None:
                s['entry'] = d.get('entrypoint')
            c = msg.get('content')
            if isinstance(c, str):
                if sub or d.get('isMeta') or d.get('isCompactSummary'):
                    continue
                m = re.search(r'<command-name>/?([^<]+)</command-name>', c)
                if m:
                    slash[m.group(1).strip()] += 1; continue
                if '[Request interrupted' in c:
                    interrupts += 1; s['interrupts'] += 1; continue
                if c.startswith('<') or c.startswith('Caveat:'):
                    continue
                s['prompts'] += 1
                prompts.append((proj, d.get('entrypoint'), d.get('timestamp'), c[:600]))
                if CORR.search(c.strip()):
                    corrections.append((proj, d.get('timestamp'), c[:400]))
            elif isinstance(c, list):
                for b in c:
                    if not isinstance(b, dict):
                        continue
                    if b.get('type') == 'text' and '[Request interrupted' in b.get('text', ''):
                        interrupts += 1; s['interrupts'] += 1
                    if b.get('type') == 'tool_result' and b.get('is_error'):
                        name = pend.get(b.get('tool_use_id'), '?')
                        tool_err[name] += 1; s['errs'] += 1
                        if name.startswith('mcp__'): mcp_err[name.split('__')[1]] += 1
                        cc = b.get('content')
                        txt = cc if isinstance(cc, str) else json.dumps(cc)[:600]
                        low = txt.lower()
                        if "doesn't want to proceed" in low or 'rejected' in low or 'permission' in low and 'denied' in low:
                            deny[name] += 1
                        if len(err_samples[name]) < 60:
                            err_samples[name].append((proj, txt[:350]))
        elif t == 'assistant':
            mdl = msg.get('model'); u = msg.get('usage') or {}
            if mdl and mdl != '<synthetic>':
                s['models'][mdl] += 1; model_turns[mdl] += 1
                ot = u.get('output_tokens') or 0
                model_tok[mdl] += ot; s['out_tok'] += ot
            for b in msg.get('content') or []:
                if not isinstance(b, dict) or b.get('type') != 'tool_use':
                    continue
                n = b.get('name', '?'); inp = b.get('input') or {}
                pend[b.get('id')] = n; tools[n] += 1; s['tools'] += 1
                if n.startswith('mcp__'):
                    mcp_srv[n.split('__')[1]] += 1
                if n in ('Bash', 'PowerShell'):
                    cmd = str(inp.get('command', '')).strip()
                    cmd = re.sub(r'^cd\s+\S+\s*(&&|;)\s*', '', cmd)
                    w = re.split(r'[\s;|&]+', cmd)
                    if w and w[0]:
                        cmd_first[(n, w[0][:40])] += 1
                if n == 'Skill':
                    skills[inp.get('skill', '?')] += 1
                if n in ('Agent', 'Task'):
                    agents[inp.get('subagent_type') or 'general-purpose'] += 1
                fp = inp.get('file_path') or ''
                if n in ('Edit', 'Write', 'MultiEdit', 'NotebookEdit') and fp:
                    s['exts'][os.path.splitext(fp)[1].lower()] += 1
    fh.close()
    if i % 300 == 0:
        print(i, len(files), file=sys.stderr)

P = C.defaultdict(lambda: dict(sessions=0, sub=0, headless=0, prompts=0, tools=0, errs=0, cost=0.0, added=0, removed=0,
                               compacts=0, interrupts=0, exts=C.Counter(), hours=0.0, days=set(), out_tok=0))
for sid, s in S.items():
    p = P[s['proj']]
    if s['sub']:
        p['sub'] += 1
    else:
        p['sessions'] += 1
        if s['entry'] and 'sdk' in s['entry']:
            p['headless'] += 1
        if s['first'] and s['last']:
            p['hours'] += min((s['last'] - s['first']).total_seconds() / 3600, 12)
            p['days'].add(s['first'].date().isoformat())
    for k in ('prompts', 'tools', 'errs', 'cost', 'added', 'removed', 'compacts', 'interrupts', 'out_tok'):
        p[k] += s[k]
    p['exts'].update(s['exts'])
proj_rows = []
for k, p in P.items():
    proj_rows.append(dict(project=k, domain=domain(k, p['exts']), sessions=p['sessions'], subagent_logs=p['sub'],
                          headless=p['headless'], prompts=p['prompts'], tools=p['tools'], tool_errors=p['errs'],
                          cost_usd=round(p['cost'], 2), lines_added=p['added'], lines_removed=p['removed'],
                          compacts=p['compacts'], interrupts=p['interrupts'], active_days=len(p['days']),
                          span_hours=round(p['hours'], 1), out_tokens=p['out_tok'], top_exts=p['exts'].most_common(8)))
proj_rows.sort(key=lambda r: -r['tools'])
daily = C.Counter()
for s in S.values():
    if s['first'] and not s['sub']:
        daily[s['first'].date().isoformat()] += 1
res = dict(n_files=len(files), n_sessions=len(S), projects=proj_rows, tools=tools.most_common(100),
           tool_errors=tool_err.most_common(50), denials=deny.most_common(20),
           cmd_first=[[list(k), v] for k, v in cmd_first.most_common(100)], mcp_servers=mcp_srv.most_common(),
           mcp_errors=mcp_err.most_common(), skills=skills.most_common(), agents=agents.most_common(),
           slash=slash.most_common(80), interrupts=interrupts, compacts=compacts.most_common(),
           api_errors=api_err.most_common(15), refusal_fallback=refusal_fallback,
           hook_failures=[[list(k), v] for k, v in hook_fail.most_common(25)],
           model_out_tokens=model_tok.most_common(), model_turns=model_turns.most_common(),
           daily_sessions=sorted(daily.items()), n_prompts=len(prompts), n_corrections=len(corrections))
json.dump(res, open(os.path.join(OUT, 'usage.json'), 'w'), indent=1, default=str)
json.dump(err_samples, open(os.path.join(OUT, 'error_samples.json'), 'w'), indent=1)
with open(os.path.join(OUT, 'prompts.jsonl'), 'w', encoding='utf-8') as o:
    for r in prompts:
        o.write(json.dumps(r) + '\n')
with open(os.path.join(OUT, 'corrections.jsonl'), 'w', encoding='utf-8') as o:
    for r in corrections:
        o.write(json.dumps(r) + '\n')
print('done', len(files), len(S), len(prompts))
