"""Second pass: classify every tool error, and capture build/editor command patterns."""
import json, os, re, glob, collections as C, datetime as dt
ROOT = os.path.expanduser('~/.claude/projects')
CUT = dt.datetime(2026, 9, 2, tzinfo=dt.timezone.utc).timestamp()
OUT = os.path.dirname(os.path.abspath(__file__))

BUCKETS = [
    ('glob/grep timeout', r'timed out after \d+ seconds'),
    ('exit code only', r'^exit code \d+\s*$'),
    ('command not found', r'command not found|is not recognized as|not found in path|No such file or directory.*(bin|exe)'),
    ('file not found', r'no such file|cannot find (the )?(path|file)|does not exist|File does not exist|ENOENT'),
    ('timeout/killed', r'timed? ?out|Command timed out|killed|terminated'),
    ('permission/denied', r"doesn't want to proceed|permission|denied|blocked by|not allowed"),
    ('file locked/in use', r'being used by another process|locked|EBUSY|access is denied'),
    ('edit mismatch', r'String to replace not found|must Read|has been modified since|Found \d+ matches'),
    ('compile/build error', r'error C\d{4}|error CS\d{4}|LNK\d{4}|UnrealBuildTool|Build failed|BUILD FAILED|compilation failed|error TS\d+|SyntaxError|Traceback'),
    ('python error', r'Traceback|Error:|Exception'),
    ('unreal editor', r'Live ?Coding|UnrealEditor|editor (is )?not (running|connected)|connection refused|ECONNREFUSED'),
    ('unicode/encoding', r'UnicodeEncodeError|codec|charmap'),
    ('path quoting', r'unexpected EOF|syntax error near|unterminated|MSYS|unexpected token'),
]
BRE = [(n, re.compile(p, re.I)) for n, p in BUCKETS]

def bucket(txt):
    for n, r in BRE:
        if r.search(txt):
            return n
    return 'other'

err_b = C.Counter(); err_bt = C.Counter(); err_ex = C.defaultdict(list)
build_cmds = C.Counter(); polls = C.Counter(); bash_read_like = C.Counter()
unreal_tool_calls = C.Counter(); ue_err = C.Counter(); ue_err_ex = C.defaultdict(list)
long_runs = []
BUILD = re.compile(r'(Build\.bat|RunUAT|UnrealBuildTool|UnrealEditor-Cmd|UnrealEditor\.exe|LiveCoding|unity(\.exe)?\b|gradlew|dotnet (build|test)|npm (run )?(build|test|dev)|npx (vite|tsc|playwright|vitest)|pytest|adb |cargo |msbuild)', re.I)

for f in glob.glob(ROOT + '/**/*.jsonl', recursive=True):
    if os.path.getmtime(f) < CUT:
        continue
    proj = os.path.relpath(f, ROOT).replace('\\', '/').split('/')[0]
    pend = {}
    for line in open(f, encoding='utf-8', errors='replace'):
        if len(line) > 3_000_000:
            continue
        try:
            d = json.loads(line)
        except Exception:
            continue
        msg = d.get('message') or {}
        c = msg.get('content')
        if d.get('type') == 'assistant' and isinstance(c, list):
            for b in c:
                if isinstance(b, dict) and b.get('type') == 'tool_use':
                    n = b.get('name'); inp = b.get('input') or {}
                    cmd = str(inp.get('command', ''))
                    pend[b.get('id')] = (n, cmd[:300], d.get('timestamp'), inp)
                    if n in ('Bash', 'PowerShell'):
                        m = BUILD.search(cmd)
                        if m:
                            build_cmds[(proj, m.group(1).lower().strip())] += 1
                        if re.search(r'\b(sleep|Start-Sleep|until|while)\b', cmd):
                            polls[proj] += 1
                        first = re.sub(r'^cd\s+\S+\s*(&&|;)\s*', '', cmd.strip()).split(' ')[0]
                        if first in ('cat', 'head', 'tail', 'sed', 'grep', 'find', 'ls', 'Get-Content', 'Select-String', 'Get-ChildItem'):
                            bash_read_like[first] += 1
                    if n == 'mcp__unreal-mcp__call_tool':
                        unreal_tool_calls[str(inp.get('toolset', inp.get('tool', inp.get('name', '?'))))[:60] + '.' + str(inp.get('method', inp.get('function', '')))[:40]] += 1
        elif d.get('type') == 'user' and isinstance(c, list):
            for b in c:
                if isinstance(b, dict) and b.get('type') == 'tool_result':
                    n, cmd, t0, inp = pend.get(b.get('tool_use_id'), ('?', '', None, {}))
                    if t0 and d.get('timestamp'):
                        try:
                            dur = (dt.datetime.fromisoformat(d['timestamp'].replace('Z', '+00:00')) - dt.datetime.fromisoformat(t0.replace('Z', '+00:00'))).total_seconds()
                            if dur > 300 and n in ('Bash', 'PowerShell'):
                                long_runs.append((proj, round(dur), cmd[:160]))
                        except Exception:
                            pass
                    if not b.get('is_error'):
                        continue
                    cc = b.get('content')
                    txt = cc if isinstance(cc, str) else json.dumps(cc)[:2000]
                    bk = bucket(txt[:2000])
                    err_b[bk] += 1; err_bt[(n, bk)] += 1
                    if len(err_ex[bk]) < 15:
                        err_ex[bk].append((proj[11:35], n, cmd[:140], re.sub(r'\s+', ' ', txt)[:220]))
                    if n and n.startswith('mcp__unreal'):
                        k = re.sub(r'\s+', ' ', txt)[:90]
                        ue_err[k] += 1
                        if len(ue_err_ex[k]) < 2:
                            ue_err_ex[k].append(json.dumps(inp)[:200])

long_runs.sort(key=lambda r: -r[1])
lr = C.Counter()
for p, dsec, cmd in long_runs:
    lr[p] += dsec
res = dict(err_buckets=err_b.most_common(), err_by_tool=[[list(k), v] for k, v in err_bt.most_common(40)],
           examples=err_ex, build_cmds=[[list(k), v] for k, v in build_cmds.most_common(60)], polls=polls.most_common(20),
           bash_read_like=bash_read_like.most_common(), unreal_tool_calls=unreal_tool_calls.most_common(40),
           ue_errors=ue_err.most_common(30), ue_err_ex=ue_err_ex, long_runs_top=long_runs[:40],
           long_run_secs_by_proj=lr.most_common(20), n_long_runs=len(long_runs))
json.dump(res, open(os.path.join(OUT, 'errors.json'), 'w'), indent=1)
print('ok')
