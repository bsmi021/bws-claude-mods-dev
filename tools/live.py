"""Live check of mods in a real interactive Claude Code (ConPTY via pywinpty, screen rendered by pyte).

    python tools/live.py --plugin bws-cockpit --plugin bws-diagram --out runs/<run>/receipts/live \\
        --step "say:/dashboard" --step "wait:Assumptions.*Shelf.*Board" --step "dump:dashboard"
    python tools/live.py --plugin bws-cockpit --steps runs/<run>/live-steps.txt --out runs/<run>/receipts/live

Starts `claude --plugin-dir <each mod's source folder>` at --size COLSxROWS (default 170x50) in a fixed scratch folder
(default <temp>/bws-live, so its transcripts stay out of this repo's project dir and the trust prompt is answered once),
answers the trust prompt, waits for the prompt box, runs the steps, types /exit, and saves screen dumps to --out.
Environment: NO_COLOR and the parent session's CLAUDECODE / CLAUDE_CODE_* markers are cleared, MSYS_NO_PATHCONV=1 is
set, and CLAUDE_CODE_PLUGIN_DIRS is emptied so only the --plugin mods load from source (installed copies still load
unless --source-only, which passes --setting-sources project,local).

Steps, one per --step or per line of --steps (blank lines and # comments skipped):
  say:TEXT         type TEXT, then Enter
  type:TEXT        type TEXT without Enter
  key:NAME[*N]     enter, tab, shift+tab, esc, up, down, left, right, backspace, space, ctrl+<letter>; N repeats
  click:LABEL[@+K] SGR mouse press + release on the lowest cell showing LABEL (K columns right of its first letter)
  wait:REGEX[@SECS] wait until the rendered screen matches REGEX (default 30 s); text scrolled off screen won't match
  sleep:SECS       pause
  dump:NAME        save the rendered screen to <out>/NAME.txt
A failed wait or click saves <out>/fail-<step>.txt and stops the run with exit 1. Every step is logged to <out>/live.log.

After the run, any <mod>/.claude-plugin/types/claude-code-mcp/index.d.ts over 400 KB (a live session rewrites it with
every connected MCP server's tools, which breaks tsc) is replaced with bws-board's lean copy.
Needs `python -m pip install --user pywinpty pyte`; run with plain python, not -I (that hides user site-packages).
Steps that start a model turn spend real money; mod commands alone do not.
"""
import argparse
import os
import re
import shutil
import sys
import tempfile
import threading
import time
from pathlib import Path

import pyte
from winpty import PtyProcess

ROOT = Path(__file__).resolve().parent.parent
MAIN_ROOT = Path('C:/Projects/bws.mods.claude-code')  # the main checkout; a fresh worktree has no generated types
READY = r'Try "|\? for shortcuts|bypass permissions|accept edits'
TRUST = r'[Tt]rust (the files in )?this folder'
IMPORTS = r'Allow external CLAUDE\.md file imports'
MCP_TYPES = '.claude-plugin/types/claude-code-mcp/index.d.ts'
BLOAT = 400 * 1024
ESC = chr(27)
KEYS = {
    'enter': '\r', 'tab': '\t', 'shift+tab': ESC + '[Z', 'esc': ESC, 'backspace': '\x7f', 'space': ' ',
    'up': ESC + '[A', 'down': ESC + '[B', 'right': ESC + '[C', 'left': ESC + '[D',
}


class Fail(Exception):
    pass


class Live:
    def __init__(self, argv, cwd, env, cols, rows, out):
        self.out = out
        self.lock = threading.Lock()
        self.raw = []
        self.term = pyte.Screen(cols, rows)
        self.stream = pyte.Stream(self.term)
        self.proc = PtyProcess.spawn(argv, cwd=str(cwd), env=env, dimensions=(rows, cols))
        threading.Thread(target=self._pump, daemon=True).start()

    def _pump(self):
        while True:
            try:
                data = self.proc.read(4096)
            except Exception:
                return
            if not data:
                return
            with self.lock:
                self.raw.append(data)
                self.stream.feed(data)

    def screen(self):
        with self.lock:
            return '\n'.join(line.rstrip() for line in self.term.display)

    def mouse_on(self):
        with self.lock:
            raw = ''.join(self.raw)
        return any(ESC + code in raw for code in ('[?1000h', '[?1002h', '[?1003h'))

    def write(self, text):
        self.proc.write(text)

    def wait(self, pattern, secs):
        end = time.time() + secs
        while time.time() < end:
            if re.search(pattern, self.screen()):
                return True
            if not self.proc.isalive():
                return False
            time.sleep(0.3)
        return False

    def find_cell(self, label):
        # (row, col), 1-based, of the lowest line showing `label`
        with self.lock:
            lines = list(self.term.display)
        hits = [(r + 1, line.index(label) + 1) for r, line in enumerate(lines) if label in line]
        return hits[-1] if hits else None

    def click(self, row, col):
        self.write('%s[<0;%d;%dM' % (ESC, col, row))
        time.sleep(0.15)
        self.write('%s[<0;%d;%dm' % (ESC, col, row))

    def dump(self, name):
        path = self.out / (name + '.txt')
        path.write_text(self.screen() + '\n', encoding='utf-8')
        return path

    def log(self, msg):
        print(msg, flush=True)
        with open(self.out / 'live.log', 'a', encoding='utf-8') as fh:
            fh.write(msg + '\n')


def key_text(name):
    name = name.strip().lower()
    if name in KEYS:
        return KEYS[name]
    m = re.fullmatch(r'ctrl\+([a-z])', name)
    if m:
        return chr(ord(m.group(1)) - 96)
    raise Fail(f'unknown key {name!r}')


def run_step(live, n, step):
    kind, _, arg = step.partition(':')
    kind = kind.strip().lower()
    if kind == 'say':
        live.write(arg)
        time.sleep(0.6)
        live.write('\r')
    elif kind == 'type':
        live.write(arg)
    elif kind == 'key':
        name, _, times = arg.partition('*')
        for _ in range(int(times or 1)):
            live.write(key_text(name))
            time.sleep(0.15)
    elif kind == 'click':
        label, _, offset = arg.partition('@')
        if not live.mouse_on():
            raise Fail('mouse tracking is not on (no ESC[?1000h seen); a click would type into the box')
        cell = live.find_cell(label)
        if cell is None:
            raise Fail(f'no cell shows {label!r}')
        col = cell[1] + int(offset or 0)
        live.click(cell[0], col)
        return f'clicked ({cell[0]}, {col})'
    elif kind == 'wait':
        m = re.fullmatch(r'(.*?)(?:@(\d+(?:\.\d+)?))?', arg, re.S)
        pattern, secs = m.group(1), float(m.group(2) or 30)
        try:
            re.compile(pattern)
        except re.error as err:
            raise Fail(f'bad regex {pattern!r}: {err}')
        if not live.wait(pattern, secs):
            raise Fail(f'screen never matched {pattern!r} in {secs:g}s')
    elif kind == 'sleep':
        time.sleep(float(arg))
    elif kind == 'dump':
        return f'saved {live.dump(arg).name}'
    else:
        raise Fail(f'unknown step kind {kind!r}')
    return 'ok'


def startup(live, secs):
    # Answer the dialogs a fresh session can show before the prompt box: trust the scratch folder (its default is
    # "No, exit", so move to Yes first); keep the default "No" on external CLAUDE.md imports.
    end = time.time() + secs
    while True:
        left = end - time.time()
        if left <= 0 or not live.wait(f'{READY}|{TRUST}|{IMPORTS}', left):
            raise Fail('no prompt box (unknown startup dialog?)')
        text = live.screen()
        if re.search(TRUST, text):
            for _ in range(4):
                if re.search(r'❯\s*(\d\.\s*)?Yes', live.screen()):
                    break
                live.write(KEYS['down'])
                time.sleep(0.4)
            else:
                raise Fail('could not select Yes on the trust prompt')
            live.log('startup: trusted the scratch folder')
        elif re.search(IMPORTS, text):
            live.log('startup: external CLAUDE.md imports left off (the default)')
        else:
            time.sleep(2)
            return
        live.write('\r')
        time.sleep(1.5)


def restore_mcp_types(log):
    # A live session regenerated the MCP tool types of every loaded mod; put the lean copy back where it bloated.
    lean = None
    for base in (ROOT, MAIN_ROOT):
        cand = base / 'bws-board' / MCP_TYPES
        if cand.is_file() and cand.stat().st_size <= BLOAT:
            lean = cand
            break
    for path in sorted(ROOT.glob('*/' + MCP_TYPES)):
        if path.stat().st_size <= BLOAT:
            continue
        if lean is None:
            log(f'types: {path.relative_to(ROOT)} is {path.stat().st_size // 1024} KB and no lean bws-board copy was found')
            continue
        shutil.copyfile(lean, path)
        log(f'types: restored {path.relative_to(ROOT)} from {lean}')


def find_claude():
    for cand in (shutil.which('claude.exe'), str(Path.home() / '.local/bin/claude.exe')):
        if cand and Path(cand).is_file():
            return cand
    sys.exit('claude.exe not found (never launch the npm .CMD shim)')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--plugin', action='append', default=[], help='mod folder to load from source (repeatable)')
    ap.add_argument('--step', action='append', default=[], help='one step (repeatable); see above')
    ap.add_argument('--steps', help='file with one step per line')
    ap.add_argument('--out', required=True, help='receipts folder for live.log and the dumps')
    ap.add_argument('--size', default='170x50', help='COLSxROWS (default 170x50)')
    ap.add_argument('--scratch', default=str(Path(tempfile.gettempdir()) / 'bws-live'), help='working folder for the session')
    ap.add_argument('--source-only', action='store_true', help='also skip installed plugins (--setting-sources project,local)')
    ap.add_argument('--ready-secs', type=float, default=90)
    ap.add_argument('--arg', action='append', default=[], help='extra claude argument (repeatable), e.g. --arg=--model --arg=haiku')
    a = ap.parse_args()

    sys.stdout.reconfigure(encoding='utf-8')
    steps = list(a.step)
    if a.steps:
        steps += [ln.rstrip('\n') for ln in open(a.steps, encoding='utf-8')]
    steps = [s for s in steps if s.strip() and not s.lstrip().startswith('#')]
    cols, rows = (int(x) for x in a.size.lower().split('x'))
    out = Path(a.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    (out / 'live.log').write_text('', encoding='utf-8')
    scratch = Path(a.scratch)
    scratch.mkdir(parents=True, exist_ok=True)

    argv = [find_claude()]
    for plugin in a.plugin:
        folder = (ROOT / plugin) if not Path(plugin).is_absolute() else Path(plugin)
        if not (folder / '.claude-plugin/plugin.json').is_file():
            sys.exit(f'{folder} is not a plugin folder')
        argv += ['--plugin-dir', folder.as_posix()]
    if a.source_only:
        argv += ['--setting-sources', 'project,local']
    argv += a.arg
    env = {k: v for k, v in os.environ.items()
           if k not in ('CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_CHILD_SESSION', 'NO_COLOR')}
    env['MSYS_NO_PATHCONV'] = '1'
    env['CLAUDE_CODE_PLUGIN_DIRS'] = ''

    live = Live(argv, scratch, env, cols, rows, out)
    live.log(f'start: {" ".join(argv[1:])}  size {cols}x{rows}  cwd {scratch.as_posix()}')
    code = 0
    try:
        startup(live, a.ready_secs)
        live.log(f'ready; mouse tracking {"on" if live.mouse_on() else "off"}')
        live.dump('00-ready')
        for n, step in enumerate(steps, 1):
            try:
                result = run_step(live, n, step)
            except Fail as err:
                live.log(f'{n:02d} {step}  FAIL: {err}')
                live.dump(f'fail-{n:02d}')
                code = 1
                break
            live.log(f'{n:02d} {step}  {result}')
    except Fail as err:
        live.log(f'FAIL: {err}')
        live.dump('fail-start')
        code = 1
    finally:
        live.dump('99-final')
        try:
            if live.proc.isalive():
                live.write(ESC)
                time.sleep(0.3)
                live.write('/exit\r')
            end = time.time() + 15
            while live.proc.isalive() and time.time() < end:
                time.sleep(0.3)
        except EOFError:
            pass
        finally:
            if live.proc.isalive():
                live.proc.terminate(force=True)
        restore_mcp_types(live.log)
        live.log(f'exit {code}')
    sys.exit(code)


if __name__ == '__main__':
    main()
