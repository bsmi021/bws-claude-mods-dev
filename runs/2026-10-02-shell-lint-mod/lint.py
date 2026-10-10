r"""Reference implementation of the shell-lint rules (ported 1:1 to bws-shell-lint/hooks/lint.ts).

Every rule takes the Bash command exactly as the model wrote it and returns a finding or None.

Two facts from the corpus drive the rules:
  * On this machine bash receives the command after one more round of backslash parsing:
    a run of n backslashes NOT followed by a double quote reaches bash as ceil(n/2)
    backslashes; a run followed by a double quote arrives untouched. Probe (2.1.287):
    `echo 'A: p<2 bs>q  B: x<2 bs>"y  E: end<2 bs>'` prints `A: p<1 bs>q  B: x<2 bs>"y  E: end<1 bs>`.
    It holds inside single quotes and quoted heredocs, where bash itself would keep them.
  * Bash commands longer than about 7.7k characters (counting each `'` as 4, the cost of
    escaping it as '\'') reach bash cut short, and bash fails with "unexpected EOF".

Regexes stay inside the subset JavaScript and Python share: no lookbehind, no named groups.
"""
import re

BS = chr(92)

LONG_LIMIT = 7800          # 2026-10-10 replay: 152 of 154 cut-offs caught, 10 of 73,470 ok commands refused
HARD_LIMIT = 32000         # past this the spawn itself fails with ENAMETOOLONG

HEREDOC_OPEN = re.compile(r"<<(-?)[ \t]*(['\"]?)([A-Za-z_][A-Za-z0-9_.-]*)\2")
PY_HEREDOC_LINE = re.compile(r"(^|[\s;&|(])(python[0-9.]*|py)(\.exe)?([ \t][^\n<]*)?<<|>[ \t]*['\"]?[^\s'\"]+\.py['\"]?[ \t]*<<|<<[^\n]*>[ \t]*['\"]?[^\s'\"]+\.py")
PY_DASH_C = re.compile(r"(^|[\s;&|(])(python[0-9.]*|py)(\.exe)?[ \t]+(-[A-Za-z]+[ \t]+)*-c[ \t]+(['\"])")
WIN_PATH_DQ = re.compile(r"(^|[\s=(])\"([A-Za-z]:\\[^\"\n]*?)(\\+)\"([\s|;&)<>]|$)")


BS_RUN = re.compile(r'(\\+)("?)')


def collapse(s):
    """What bash receives: each backslash run not followed by a double quote is halved (rounded up)."""
    return BS_RUN.sub(lambda m: m.group(0) if m.group(2) else BS * ((len(m.group(1)) + 1) // 2), s)


def split_heredocs(cmd):
    """Return (shell_text, bodies). shell_text keeps opener lines and drops bodies.

    bodies: list of dicts {opener, quoted, body, terminated}.
    """
    lines = cmd.split('\n')
    shell = []
    bodies = []
    i = 0
    while i < len(lines):
        line = lines[i]
        shell.append(line)
        i += 1
        pending = []
        for m in HEREDOC_OPEN.finditer(line):
            if m.start() > 0 and line[m.start() - 1] == '<':
                continue  # here-string <<<
            pending.append((m.group(1) == '-', m.group(2) != '', m.group(3)))
        for dash, quoted, tag in pending:
            body = []
            terminated = False
            while i < len(lines):
                ln = lines[i]
                i += 1
                probe = ln.lstrip('\t') if dash else ln
                if probe == tag or probe.rstrip('\r') == tag:
                    terminated = True
                    shell.append(ln)
                    break
                body.append(ln)
            bodies.append({'opener': line, 'quoted': quoted, 'body': '\n'.join(body), 'terminated': terminated})
    return '\n'.join(shell), bodies


# ---------------------------------------------------------------- python string scanner

HEX = re.compile(r'[0-9A-Fa-f]')


def bad_escape(lit_body):
    """True when a non-raw str literal body holds a \\x, \\u, \\U or \\N escape Python rejects."""
    i = 0
    n = len(lit_body)
    while i < n:
        if lit_body[i] == BS and i + 1 < n:
            c = lit_body[i + 1]
            need = {'x': 2, 'u': 4, 'U': 8}.get(c)
            if need:
                hexpart = lit_body[i + 2:i + 2 + need]
                if len(hexpart) < need or not all(HEX.match(h) for h in hexpart):
                    return True
            elif c == 'N':
                if i + 2 >= n or lit_body[i + 2] != '{':
                    return True
            i += 2
            continue
        i += 1
    return False


def scan_python(code):
    """Return None when every string literal closes and has valid escapes, else (line_no, line_text, why)."""
    i = 0
    n = len(code)
    while i < n:
        ch = code[i]
        if ch == '#':
            j = code.find('\n', i)
            i = n if j < 0 else j + 1
            continue
        if ch == "'" or ch == '"':
            # string prefix letters directly before the quote
            k = i
            while k > 0 and code[k - 1] in 'rRbBuUfF':
                k -= 1
            prefix = code[k:i].lower()
            if k > 0 and (code[k - 1].isalnum() or code[k - 1] == '_'):
                prefix = ''  # the letters belong to an identifier
            raw = 'r' in prefix
            is_bytes = 'b' in prefix
            if code.startswith(ch * 3, i):
                close = ch * 3
                j = i + 3
            else:
                close = ch
                j = i + 1
            start = j
            ok = False
            while j < n:
                c = code[j]
                if c == BS:
                    j += 2
                    continue
                if close == ch and c == '\n':
                    break
                if code.startswith(close, j):
                    ok = True
                    break
                j += 1
            if not ok:
                line_no = code.count('\n', 0, i) + 1
                return (line_no, code.split('\n')[line_no - 1], 'unterminated string literal')
            if not raw and not is_bytes and 'f' not in prefix and bad_escape(code[start:j]):
                line_no = code.count('\n', 0, i) + 1
                return (line_no, code.split('\n')[line_no - 1], 'bad \\x/\\u/\\U/\\N escape')
            i = j + len(close)
            continue
        i += 1
    return None


def dq_unescape(s):
    """What bash does to backslashes inside double quotes."""
    out = []
    i = 0
    while i < len(s):
        if s[i] == BS and i + 1 < len(s) and s[i + 1] in '\\"$`':
            out.append(s[i + 1])
            i += 2
            continue
        out.append(s[i])
        i += 1
    return ''.join(out)


def python_regions(cmd):
    """Yield (label, raw_code, effective_code) for python code inside the command."""
    shell, bodies = split_heredocs(cmd)
    for b in bodies:
        if PY_HEREDOC_LINE.search(b['opener']) and b['quoted']:
            yield ('heredoc', b['body'], collapse(b['body']))
    for m in PY_DASH_C.finditer(shell):
        q = m.group(5)
        start = m.end()
        if q == "'":
            end = shell.find("'", start)
            if end < 0:
                continue
            raw = shell[start:end]
            yield ('-c', raw, collapse(raw))
        else:
            j = start
            while j < len(shell):
                if shell[j] == BS:
                    j += 2
                    continue
                if shell[j] == '"':
                    break
                j += 1
            if j >= len(shell):
                continue
            raw = shell[start:j]
            # what the model meant (bash rules only) vs what python gets (collapse, then bash)
            yield ('-c', dq_unescape(raw), dq_unescape(collapse(raw)))


# ---------------------------------------------------------------- rules

def rule_long_command(cmd):
    # 2026-10-10: double quotes and backslashes count 2 as well, limit 7800 (runs/2026-10-10-mods-release)
    size = len(cmd.encode('utf-16-le')) // 2 + 3 * cmd.count("'") + cmd.count('"') + cmd.count(chr(92))
    if size >= LONG_LIMIT:
        return {'rule': 'long-command', 'detail': size}
    return None


def rule_py_backslash(cmd):
    for label, meant, effective in python_regions(cmd):
        if scan_python(meant) is not None:
            continue  # already broken as written: not the shell's doing
        hit = scan_python(effective)
        if hit is not None:
            return {'rule': 'py-backslash', 'detail': hit[1].strip()[:120], 'why': hit[2], 'where': label}
    return None


def rule_dq_trailing_backslash(cmd):
    shell, _ = split_heredocs(cmd)
    eff = collapse(shell)
    for m in WIN_PATH_DQ.finditer(eff):
        if len(m.group(3)) % 2 == 1:
            return {'rule': 'dq-trailing-backslash', 'detail': m.group(2) + m.group(3)}
    return None


RULES = [
    ('long-command', rule_long_command),
    ('dq-trailing-backslash', rule_dq_trailing_backslash),
    ('py-backslash', rule_py_backslash),
]


def lint(cmd, disabled=()):
    for name, fn in RULES:
        if name in disabled:
            continue
        f = fn(cmd)
        if f:
            return f
    return None
