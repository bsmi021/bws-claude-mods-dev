"""Live check of bws-sidechat 0.3.0 in a real interactive claude (ConPTY via pywinpty).

Steps: one main turn; /side model haiku; ask in the side chat; read the side session file for the model that answered;
check the main session file gained no message from the side chat. Optional steps follow: REFRESH=1, PULL=1 (/side pull),
BUTTON=1 (a real mouse click on the pane's "Send to main" button, found on a pyte-rendered screen), SENDBACK=1.
Run: python live.py <out-dir>   (needs pywinpty and pyte; not -I, which hides user site-packages)
"""
import json
import os
import re
import sys
import threading
import time

import pyte
from winpty import PtyProcess

OUT = sys.argv[1]
REPO = 'C:/Projects/bws.mods.claude-code'
EXE = 'C:/Users/bsmi0/.local/bin/claude.exe'
PROJ = 'C:/Users/bsmi0/.claude/projects/C--Projects-bws-mods-claude-code'
os.makedirs(OUT, exist_ok=True)

env = {k: v for k, v in os.environ.items() if k not in ('CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_CHILD_SESSION', 'NO_COLOR')}
p = PtyProcess.spawn([EXE, '--plugin-dir', REPO + '/bws-sidechat'], cwd=REPO, env=env, dimensions=(50, 200))
buf = []
lock = threading.Lock()
term = pyte.Screen(200, 50)
term_stream = pyte.Stream(term)


def pump():
    while True:
        try:
            data = p.read(4096)
        except Exception:
            return
        if not data:
            return
        with lock:
            buf.append(data)
            term_stream.feed(data)


threading.Thread(target=pump, daemon=True).start()
ANSI = re.compile(r'\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)|\x1b[()][A-Z0-9]')


def screen():
    with lock:
        raw = ''.join(buf)
    return ANSI.sub('', raw)


def wait_for(pattern, secs, since=0):
    end = time.time() + secs
    while time.time() < end:
        s = screen()[since:]
        m = re.search(pattern, s)
        if m:
            return True
        time.sleep(0.5)
    return False


NL = chr(10)


def flat(text):
    return text.replace(NL, ' ')


def find_cell(text, last=True):
    # (row, col), 1-based, of `text` on the rendered screen; the lowest match by default
    with lock:
        lines = list(term.display)
    hits = [(r + 1, line.index(text) + 1) for r, line in enumerate(lines) if text in line]
    return (hits[-1] if last else hits[0]) if hits else None


def click(row, col):
    esc = chr(27)
    p.write('%s[<0;%d;%dM' % (esc, col, row))  # SGR mouse press, then release
    time.sleep(0.15)
    p.write('%s[<0;%d;%dm' % (esc, col, row))


def say(text, enter=True):
    p.write(text)
    time.sleep(0.6)
    if enter:
        p.write('\r')


def sessions():
    out = {}
    for f in os.listdir(PROJ):
        if f.endswith('.jsonl'):
            out[f[:-6]] = os.path.getmtime(PROJ + '/' + f)
    return out


def msgs(sid):
    rows = []
    with open(PROJ + '/' + sid + '.jsonl', encoding='utf-8') as fh:
        for line in fh:
            try:
                rows.append(json.loads(line))
            except Exception:
                pass
    return rows


def log(msg):
    print(msg, flush=True)
    with open(OUT + '/live.log', 'a', encoding='utf-8') as fh:
        fh.write(msg + '\n')


before_sessions = set(sessions())
log('waiting for the prompt')
ready = wait_for(r'(?s)(Try "|\? for shortcuts|bypass|accept edits)', 90)
log(f'ready={ready}')
time.sleep(3)
mark = len(screen())
say('Reply with exactly the word: ok')
log('main answered: %s' % wait_for(r'\bok\b', 120, mark))
time.sleep(4)
new = [s for s in sessions() if s not in before_sessions]
log(f'new session files: {new}')
main = new[0] if new else max(sessions(), key=sessions().get)
main_rows_before = msgs(main)
log(f'main session {main}: {len(main_rows_before)} rows')

mark = len(screen())
say('/side model haiku')
ok = wait_for(r'Side\s*chat\s*model:\s*haiku', 40, mark)
log(f'model command answered: {ok}')
time.sleep(2)

mark = len(screen())
asked_at = time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime())
say('what is 2 plus 2? answer in one short line')
ok = wait_for(r'(?i)claude\W*(2\s*\+\s*2\s*=\s*)?(4|four)\b|2\s*\+\s*2\s*=\s*4|2 plus 2 (is|equals) (4|four)', 150, mark)
log(f'side answered: {ok}')
time.sleep(4)
open(OUT + '/screen-after-ask.txt', 'w', encoding='utf-8').write(screen()[-6000:])

side = [s for s in sessions() if s not in before_sessions and s != main]
log(f'side session files: {side}')
for sid in side:
    rows = msgs(sid)
    models = sorted({r.get('message', {}).get('model') for r in rows if r.get('type') == 'assistant' and isinstance(r.get('message'), dict) and str(r.get('timestamp', '')) >= asked_at} - {None})
    log(f'side {sid}: {len(rows)} rows, assistant models written after the ask: {models}')
main_rows_after = msgs(main)
log(f'main rows before={len(main_rows_before)} after={len(main_rows_after)}')
extra = main_rows_after[len(main_rows_before):]
for r in extra:
    msg = r.get('message')
    text = json.dumps(msg)[:160] if isinstance(msg, dict) else json.dumps(r)[:160]
    log(f'  main extra: type={r.get("type")} {text}')

def to_prompt():
    p.write('\x18')  # ctrl+x tab: the keys go back from the pane to the prompt box
    time.sleep(0.3)
    p.write('\t')
    time.sleep(1.5)


if os.environ.get('REFRESH') == '1':
    to_prompt()
    mark = len(screen())
    say('Reply with exactly the word: two')
    log('second main turn answered: %s' % wait_for(r'\btwo\b', 120, mark))
    time.sleep(5)
    open(OUT + '/screen-main-ahead.txt', 'w', encoding='utf-8').write(screen()[mark:][-9000:])
    mark = len(screen())
    say('/side refresh')
    log('refresh noted: %s' % wait_for(r'Refreshed\s*from\s*main', 30, mark))
    time.sleep(2)
    asked2 = time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime())
    say('what was my earlier question to you here? one short line')
    log('answer after refresh: %s' % wait_for(r'(?i)2\s*plus\s*2|two plus two|2\s*\+\s*2', 120, mark))
    time.sleep(5)
    open(OUT + '/screen-after-refresh.txt', 'w', encoding='utf-8').write(screen()[mark:][-9000:])
    again = [s for s in sessions() if s not in before_sessions and s != main and s not in side]
    log(f'session files after refresh: {again}')
    for sid in again:
        rows = msgs(sid)
        models = sorted({r.get('message', {}).get('model') for r in rows if r.get('type') == 'assistant' and isinstance(r.get('message'), dict) and str(r.get('timestamp', '')) >= asked2} - {None})
        log(f'refreshed side {sid}: {len(rows)} rows, models after the ask: {models}')

def texts(sid, role, since):
    out = []
    for r in msgs(sid):
        m = r.get('message')
        if r.get('type') == role and isinstance(m, dict) and str(r.get('timestamp', '')) >= since:
            c = m.get('content')
            t = c if isinstance(c, str) else ' '.join(b.get('text', '') for b in c if isinstance(b, dict) and b.get('type') == 'text')
            if t.strip():
                out.append(t)
    return out


def wait_texts(sid, role, since, needle, secs):
    end = time.time() + secs
    while time.time() < end:
        found = [t for t in texts(sid, role, since) if needle.lower() in t.lower()]
        if found:
            return found
        time.sleep(1)
    return []


def current_side():
    others = {k: v for k, v in sessions().items() if k not in before_sessions and k != main}
    return max(others, key=others.get)


if os.environ.get('PULL') == '1' or os.environ.get('BUTTON') == '1':
    to_prompt()
    word = 'pineapple'
    mark = len(screen())
    say('Reply with exactly the word: ' + word)
    log('main said the word: %s' % bool(wait_texts(main, 'assistant', '', word, 120)))
    time.sleep(3)
    main_before_pull = len(msgs(main))
    pulled_at = time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime())
    sid = current_side()
    say('/side pull which word did main just say? answer with that word only')
    got_user = wait_texts(sid, 'user', pulled_at, word, 150)
    log('pull: the side session received main reply as a message: %s' % bool(got_user))
    if got_user:
        log('  user row starts: ' + flat(got_user[0][:110]))
    got_answer = wait_texts(sid, 'assistant', pulled_at, word, 150)
    log(f'pull: the side chat answered with the word: {bool(got_answer)}; side models: ' + str(sorted({r.get('message', {}).get('model') for r in msgs(sid) if r.get('type') == 'assistant' and isinstance(r.get('message'), dict) and str(r.get('timestamp', '')) >= pulled_at} - {None})))
    time.sleep(4)
    log(f'pull: main rows before={main_before_pull} after={len(msgs(main))} (a /side echo or two is expected)')
    open(OUT + '/screen-after-pull.txt', 'w', encoding='utf-8').write(NL.join(term.display))

if os.environ.get('BUTTON') == '1':
    cell = find_cell('Send to main')
    log(f'Send to main button on the rendered screen at (row, col) = {cell}')
    if cell is not None:
        main_before_click = msgs(main)
        clicked_at = time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime())
        click(cell[0], cell[1] + 2)
        sent = wait_texts(main, 'user', clicked_at, word, 90)
        log(f'button: main received the answer as a user message: {bool(sent)}')
        for t in sent[:1]:
            log('  main user row: ' + flat(t[:160]))
        time.sleep(4)
        log(f'button: main rows before click={len(main_before_click)} after={len(msgs(main))}')
        open(OUT + '/screen-after-click.txt', 'w', encoding='utf-8').write(NL.join(term.display))

if os.environ.get('SENDBACK') == '1':
    mark = len(screen())
    p.write('\x18')  # ctrl+x tab: the keys go back from the pane to the prompt box
    time.sleep(0.3)
    p.write('\t')
    time.sleep(1.5)
    say('/side send-back')
    time.sleep(25)
    after = msgs(main)
    log(f'after send-back main rows: {len(after)}')
    for r in after[len(main_rows_after):]:
        msg = r.get('message')
        log(f'  main extra: type={r.get("type")} {json.dumps(msg)[:200] if isinstance(msg, dict) else json.dumps(r)[:200]}')

say('/exit')
time.sleep(3)
try:
    p.terminate(force=True)
except Exception:
    pass
