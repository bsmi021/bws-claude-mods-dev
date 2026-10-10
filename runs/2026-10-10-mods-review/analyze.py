"""7-day session review: baseline usage, per-mod traces and outcomes, friction signals for new mods.
Window: 2026-10-03 00:00 EDT -> now. Reads ~/.claude/projects/**/*.jsonl (incl. subagent logs)."""
import json, os, re, glob, collections as C, datetime as dt, sys

ROOT = os.path.expanduser('~/.claude/projects')
CUT = dt.datetime(2026, 10, 3, 4, 0, tzinfo=dt.timezone.utc)
OUT = os.path.dirname(os.path.abspath(__file__))

BUCKETS = [
    ('glob/grep timeout', r'timed out after \d+ seconds'),
    ('shell-lint deny', r'bws-shell-lint \['),
    ('cockpit guard', r'bws-cockpit:'),
    ('user rejected', r"doesn't want to proceed|user rejected|rejected by the user"),
    ('exit code only', r'^exit code \d+\s*$'),
    ('command not found', r'command not found|is not recognized as|not found in path'),
    ('edit mismatch', r'String to replace not found|must Read|has been modified since|Found \d+ matches|File has not been read'),
    ('file not found', r'no such file|cannot find (the )?(path|file)|does not exist|ENOENT'),
    ('path quoting', r'unexpected EOF|syntax error near|unterminated|unexpected token|unexpected end of file'),
    ('timeout/killed', r'timed? ?out|Command timed out|killed|terminated'),
    ('permission/denied', r'permission|denied|blocked by|not allowed'),
    ('file locked', r'being used by another process|EBUSY|access is denied'),
    ('compile/build', r'error C\d{4}|error CS\d{4}|LNK\d{4}|Build failed|BUILD FAILED|error TS\d+'),
    ('python error', r'Traceback|SyntaxError'),
    ('editor/conn', r'ECONNREFUSED|connection refused|not connected|session expired'),
    ('encoding', r'UnicodeEncodeError|charmap'),
]
BRE = [(n, re.compile(p, re.I)) for n, p in BUCKETS]
def bucket(t):
    for n, r in BRE:
        if r.search(t):
            return n
    return 'other'

def ts(s):
    try:
        return dt.datetime.fromisoformat(s.replace('Z', '+00:00'))
    except Exception:
        return None

def text_of(c):
    if isinstance(c, str):
        return c
    if isinstance(c, list):
        return ' '.join(b.get('text', '') if isinstance(b, dict) else str(b) for b in c)
    return json.dumps(c)

COCKPIT_SLASH = {'cockpit', 'resume-run', 'loop-watch', 'repo-sessions', 'projects', 'handoff'}
GUARD_KINDS = [
    ('glob refused', r'bws-cockpit: a Glob for project files'),
    ('glob from index', r'answered from the bws-cockpit project index|from the project index'),
    ('unreal-mcp down', r'bws-cockpit: Unreal MCP at'),
    ('adb no device', r'bws-cockpit: no Android device'),
    ('unity not running', r'bws-cockpit: no Unity editor is running'),
    ('ue already open', r'is already open in UnrealEditor'),
    ('ue low-vram', r'bws-cockpit: other GPU apps are running|low-VRAM'),
    ('unity -automated', r'-automated'),
]
GRE = [(n, re.compile(p)) for n, p in GUARD_KINDS]
CORR = re.compile(r"^(no[,. !]|nope|wrong|stop|that.?s not|not what|still (broken|not|fail)|didn.?t work|doesn.?t work|you (forgot|missed|didn.?t)|why did you|i said|again[,.]|revert|undo)", re.I)

S = {}
tools = C.Counter(); tool_err = C.Counter(); err_b = C.Counter(); err_bt = C.Counter(); err_ex = C.defaultdict(list)
mcp_err = C.Counter(); mcp_err_ex = C.defaultdict(list); slash = C.Counter(); skills = C.Counter(); agents = C.Counter()
hook_events = C.Counter(); hook_ex = C.defaultdict(list); api_err = C.Counter()
prompts = []; corrections = []; interrupts = C.Counter()
# mods
lint = C.Counter(); lint_after = C.Counter(); lint_ex = []
guard = C.Counter(); guard_ex = C.defaultdict(list)
fl_block = C.Counter(); fl_ex = []; fl_after_tools = []; fl_line = 0; fl_sessions = set(); fl_followups = []
find_proj = C.Counter(); find_proj_ex = []
ctx_inject = C.Counter()
agent_model = C.Counter()
cmd_first = C.Counter(); polls = C.Counter(); long_runs = []

files = [f for f in glob.glob(ROOT + '/**/*.jsonl', recursive=True) if os.path.getmtime(f) >= CUT.timestamp()]
for i, f in enumerate(files):
    rel = os.path.relpath(f, ROOT).replace('\\', '/')
    proj = rel.split('/')[0]
    sub = '/subagents/' in rel
    pend = {}
    lint_pending = None   # set after a lint deny, resolved by next Bash result
    fl_pending = None     # [tool count] after a finish-line block, until next real prompt or block
    last_block_kind = None
    try:
        fh = open(f, encoding='utf-8', errors='replace')
    except Exception:
        continue
    for line in fh:
        if len(line) > 3_000_000:
            continue
        try:
            d = json.loads(line)
        except Exception:
            continue
        tm = ts(d['timestamp']) if d.get('timestamp') else None
        if tm and tm < CUT:
            continue
        t = d.get('type')
        sid = (d.get('sessionId') or rel) + ('#sub:' + rel if sub else '')
        s = S.setdefault(sid, dict(proj=proj, sub=sub, first=None, last=None, entry=None, prompts=0, tools=0, errs=0,
                                   cwd=d.get('cwd'), compacts=0))
        if tm:
            if not s['first'] or tm < s['first']: s['first'] = tm
            if not s['last'] or tm > s['last']: s['last'] = tm
        if t == 'system':
            st = d.get('subtype')
            if st == 'compact_boundary': s['compacts'] += 1
            elif st == 'api_error': api_err[str(d.get('error') or d.get('content') or '')[:90]] += 1
            continue
        if t == 'attachment':
            a = d.get('attachment') or {}
            at = a.get('type', '')
            raw = json.dumps(d.get('rendered') or a)[:4000]
            if '# bwsCockpit' in raw:
                ctx_inject['first-message run context'] += 1
                if 'Project Locator' in raw or 'newest projects' in raw.lower():
                    ctx_inject['home-folder project list'] += 1
            if at.startswith('hook_') and at not in ('hook_success', 'hook_additional_context'):
                k = (at, str(a.get('hookName') or a.get('hookEvent')), str(a.get('command', ''))[:60])
                hook_events[k] += 1
                if len(hook_ex[str(k)]) < 3:
                    hook_ex[str(k)].append(json.dumps(a)[:400])
            continue
        msg = d.get('message') or {}
        c = msg.get('content')
        if t == 'user':
            if s['entry'] is None: s['entry'] = d.get('entrypoint')
            if isinstance(c, str):
                if c.startswith('Stop hook feedback:'):
                    if 'bws-cockpit finish line' in c:
                        kind = 'evidence' if 'cites no' in c else 'open items'
                        fl_block[kind] += 1; fl_sessions.add(sid)
                        if fl_pending is not None: fl_after_tools.append((last_block_kind, fl_pending))
                        fl_pending = 0; last_block_kind = kind
                        if len(fl_ex) < 40: fl_ex.append((proj, s['entry'], kind, c[20:420]))
                    continue
                if sub or d.get('isMeta') or d.get('isCompactSummary'):
                    continue
                m = re.search(r'<command-name>/?([^<]+)</command-name>', c)
                if m:
                    slash[m.group(1).strip()] += 1; continue
                if '[Request interrupted' in c:
                    interrupts[proj] += 1; continue
                if c.startswith('<') or c.startswith('Caveat:'):
                    continue
                if fl_pending is not None:
                    fl_after_tools.append((last_block_kind, fl_pending))
                    if len(fl_followups) < 60: fl_followups.append((proj, last_block_kind, fl_pending, c[:200]))
                    fl_pending = None
                s['prompts'] += 1
                prompts.append((proj, d.get('entrypoint'), d.get('timestamp'), c[:600]))
                if CORR.search(c.strip()):
                    corrections.append((proj, d.get('timestamp'), c[:400]))
            elif isinstance(c, list):
                for b in c:
                    if not isinstance(b, dict):
                        continue
                    if b.get('type') == 'text' and '[Request interrupted' in b.get('text', ''):
                        interrupts[proj] += 1
                    if b.get('type') != 'tool_result':
                        continue
                    n, cmd, t0, inp = pend.get(b.get('tool_use_id'), ('?', '', None, {}))
                    txt = text_of(b.get('content'))[:3000]
                    if t0 and d.get('timestamp') and n in ('Bash', 'PowerShell'):
                        a0, a1 = ts(t0), ts(d['timestamp'])
                        if a0 and a1 and (a1 - a0).total_seconds() > 300:
                            long_runs.append((proj, round((a1 - a0).total_seconds()), cmd[:160]))
                    for gk, gr in GRE:
                        if 'bws-cockpit' in txt and gr.search(txt):
                            guard[gk] += 1
                            if len(guard_ex[gk]) < 6: guard_ex[gk].append((proj, n, cmd[:160], txt[:300]))
                            break
                    if n in ('Bash', 'PowerShell') and lint_pending is not None and 'bws-shell-lint' not in txt:
                        lint_after[(lint_pending, 'error' if b.get('is_error') else 'ok')] += 1
                        lint_pending = None
                    if not b.get('is_error'):
                        continue
                    tool_err[n] += 1; s['errs'] += 1
                    bk = bucket(txt[:2000]); err_b[bk] += 1; err_bt[(n, bk)] += 1
                    if len(err_ex[bk]) < 15:
                        err_ex[bk].append((proj[11:40], n, cmd[:140], re.sub(r'\s+', ' ', txt)[:240]))
                    if n.startswith('mcp__'):
                        srv = n.split('__')[1]; mcp_err[srv] += 1
                        k = srv + ': ' + re.sub(r'\s+', ' ', txt)[:80]
                        if len(mcp_err_ex[srv]) < 8: mcp_err_ex[srv].append((n, re.sub(r'\s+', ' ', txt)[:200]))
                    m = re.search(r'bws-shell-lint \[([a-z-]+)\]', txt)
                    if m:
                        lint[m.group(1)] += 1; lint_pending = m.group(1)
                        if len(lint_ex) < 30: lint_ex.append((proj, m.group(1), cmd[:200]))
        elif t == 'assistant':
            if isinstance(c, list):
                for b in c:
                    if not isinstance(b, dict):
                        continue
                    if b.get('type') == 'text' and '⚑ finish line' in b.get('text', ''):
                        fl_line += 1
                    if b.get('type') != 'tool_use':
                        continue
                    n = b.get('name', '?'); inp = b.get('input') or {}
                    pend[b.get('id')] = (n, str(inp.get('command', ''))[:300], d.get('timestamp'), inp)
                    tools[n] += 1; s['tools'] += 1
                    if fl_pending is not None: fl_pending += 1
                    if n == 'mcp__bws-cockpit__find_project':
                        find_proj[proj] += 1
                        if len(find_proj_ex) < 20: find_proj_ex.append((proj, json.dumps(inp)[:120]))
                    if n == 'Skill': skills[inp.get('skill', '?')] += 1
                    if n in ('Agent', 'Task'):
                        st = inp.get('subagent_type') or 'general-purpose'
                        agents[st] += 1
                        agent_model[(st, inp.get('model') or '-')] += 1
                    if n in ('Bash', 'PowerShell'):
                        cmd = re.sub(r'^cd\s+\S+\s*(&&|;)\s*', '', str(inp.get('command', '')).strip())
                        w = re.split(r'[\s;|&]+', cmd)
                        if w and w[0]: cmd_first[(n, w[0][:40])] += 1
                        if re.search(r'\b(sleep|Start-Sleep|until|while)\b', cmd): polls[proj] += 1
    fh.close()
    if fl_pending is not None:
        fl_after_tools.append((last_block_kind, fl_pending))
    if i % 100 == 0:
        print(i, len(files), file=sys.stderr)

# aggregate
P = C.defaultdict(lambda: dict(sessions=0, interactive=0, headless=0, sub=0, prompts=0, tools=0, errs=0, compacts=0, days=set()))
for sid, s in S.items():
    p = P[s['proj']]
    if s['sub']:
        p['sub'] += 1
    else:
        p['sessions'] += 1
        if s['entry'] and ('sdk' in s['entry']): p['headless'] += 1
        elif s['prompts'] > 0: p['interactive'] += 1
        if s['first']: p['days'].add(s['first'].date().isoformat())
    for k in ('prompts', 'tools', 'errs', 'compacts'):
        p[k] += s[k]
proj_rows = sorted([dict(project=k, **{kk: (len(v) if kk == 'days' else v) for kk, v in p.items()}) for k, p in P.items()],
                   key=lambda r: -r['tools'])
fa = C.defaultdict(list)
for k, n in fl_after_tools: fa[k].append(n)
long_runs.sort(key=lambda r: -r[1])
top = S.values()
res = dict(
    window=[CUT.isoformat(), dt.datetime.now(dt.timezone.utc).isoformat()], n_files=len(files),
    sessions=dict(top=sum(1 for s in top if not s['sub']), sub=sum(1 for s in top if s['sub']),
                  headless=sum(1 for s in top if not s['sub'] and s['entry'] and 'sdk' in s['entry']),
                  interactive=sum(1 for s in top if not s['sub'] and not (s['entry'] and 'sdk' in s['entry']) and s['prompts'] > 0)),
    n_prompts=len(prompts), n_tools=sum(tools.values()), n_errors=sum(tool_err.values()),
    projects=proj_rows[:30], tools=tools.most_common(60), tool_errors=tool_err.most_common(30),
    err_buckets=err_b.most_common(), err_by_tool=[[list(k), v] for k, v in err_bt.most_common(40)], err_examples=err_ex,
    mcp_errors=mcp_err.most_common(), mcp_err_ex=mcp_err_ex, slash=slash.most_common(60), skills=skills.most_common(40),
    agents=agents.most_common(), agent_model=[[list(k), v] for k, v in agent_model.most_common(30)],
    hook_events=[[list(k), v] for k, v in hook_events.most_common(30)], hook_ex=hook_ex, api_errors=api_err.most_common(10),
    interrupts=interrupts.most_common(20), n_corrections=len(corrections),
    cmd_first=[[list(k), v] for k, v in cmd_first.most_common(60)], polls=polls.most_common(15),
    long_runs=long_runs[:30], n_long_runs=len(long_runs),
    mods=dict(
        shell_lint=dict(denies=lint.most_common(), next_shell_result=[[list(k), v] for k, v in lint_after.items()], examples=lint_ex),
        guard=dict(counts=guard.most_common(), examples=guard_ex),
        finish_line=dict(blocks=fl_block.most_common(), sessions=len(fl_sessions), visible_line=fl_line,
                         tools_after_block={k: dict(n=len(v), zero=sum(1 for x in v if x == 0), median=sorted(v)[len(v) // 2] if v else 0) for k, v in fa.items()},
                         examples=fl_ex, followup_prompts=fl_followups),
        project_locator=dict(find_project_calls=sum(find_proj.values()), by_project=find_proj.most_common(), examples=find_proj_ex),
        context=ctx_inject.most_common(),
        cockpit_slash={k: slash.get(k, 0) for k in COCKPIT_SLASH},
    ),
)
json.dump(res, open(os.path.join(OUT, 'usage.json'), 'w'), indent=1, default=str)
with open(os.path.join(OUT, 'prompts.jsonl'), 'w', encoding='utf-8') as o:
    for r in prompts: o.write(json.dumps(r) + '\n')
with open(os.path.join(OUT, 'corrections.jsonl'), 'w', encoding='utf-8') as o:
    for r in corrections: o.write(json.dumps(r) + '\n')
print('done', len(files), len(S), len(prompts))
