"""bws-codex job supervisor: runs one Codex turn outside Claude Code, then commits what Codex changed.

    python supervise.py launch <jobdir> <turn>       write stdin's files, start `run` detached (no inherited handles), print its pid
    python supervise.py run <jobdir> <turn>          run turn-<turn>.json's argv; write status.json; commit; write diff.patch
    python supervise.py wait <jobdir> <turn> <secs>  block until that turn ends or secs pass; print status.json
    python supervise.py cancel <jobdir>              stop the running turn; print status.json
    python supervise.py reap <folder>                remove a folder in the background, retrying for 30 minutes

The mod (hooks/register.ts) sends job.json, turn-<n>.json and turn-<n>.prompt.txt to `launch`, and reads only small files back:
status.json (atomic), turn-<n>.events.jsonl (Codex's --json stream with long fields cut) and turn-<n>.last.txt.
Codex's stdout and stderr go to files, never pipes: a sandbox helper can hold an inherited pipe for minutes.
Stdlib only.
"""
import json
import os
import subprocess
import sys
import time

DETACHED_PROCESS, CREATE_NEW_PROCESS_GROUP, CREATE_NO_WINDOW = 0x8, 0x200, 0x08000000
IS_WIN = os.name == "nt"
TERMINAL = ("done", "failed", "cancelled", "timed_out")
LINGER_S = 30  # codex.exe lingers after turn.completed; kill it after this
BEAT_S = 15  # status.json heartbeat while a turn runs
OUTPUT_MAX = 300  # chars kept of a command's aggregated_output in the events file
TEXT_MAX = 8000  # chars kept of an agent message
# Build junk a repo without a .gitignore would otherwise get committed: new files under these are never staged. They
# are pathspecs, so the repo's .gitignore, info/exclude and the user's global excludes still apply, no git config is
# touched, and a file the repo already tracks still commits.
JUNK = ("**/__pycache__/**", "**/*.py[co]", "**/.pytest_cache/**", "**/.mypy_cache/**", "**/.ruff_cache/**",
        "**/.tox/**", "**/.venv/**", "**/node_modules/**", "**/.DS_Store", "**/Thumbs.db")


def now_ms():
    return int(time.time() * 1000)


def path(jobdir, name):
    return os.path.join(jobdir, name)


def log(jobdir, msg):
    try:
        with open(path(jobdir, "supervisor.log"), "a", encoding="utf-8") as fh:
            fh.write(f"{time.strftime('%H:%M:%S')} {os.getpid()} {msg}\n")
    except OSError:
        pass


def read_json(p, default=None):
    try:
        with open(p, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return default


def write_json(p, obj):
    tmp = f"{p}.{os.getpid()}.tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, ensure_ascii=False)
    for _ in range(20):
        try:
            os.replace(tmp, p)
            return
        except PermissionError:  # a reader has it open on Windows
            time.sleep(0.05)
    os.replace(tmp, p)


def alive(pid):
    if not pid:
        return False
    if IS_WIN:
        import ctypes
        k = ctypes.windll.kernel32
        h = k.OpenProcess(0x1000, False, int(pid))  # PROCESS_QUERY_LIMITED_INFORMATION
        if not h:
            return False
        code = ctypes.c_ulong()
        ok = k.GetExitCodeProcess(h, ctypes.byref(code))
        k.CloseHandle(h)
        return bool(ok) and code.value == 259  # STILL_ACTIVE
    try:
        os.kill(int(pid), 0)
        return True
    except OSError:
        return False


def kill_tree(pid):
    if not pid:
        return
    if IS_WIN:
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(pid)], capture_output=True, creationflags=CREATE_NO_WINDOW)
    else:
        try:
            os.killpg(int(pid), 9)
        except OSError:
            pass


def git(cwd, *args):
    r = subprocess.run(["git", "-C", cwd, *args], capture_output=True, text=True, encoding="utf-8", errors="replace",
                       creationflags=CREATE_NO_WINDOW if IS_WIN else 0)
    return r.returncode, r.stdout, r.stderr


# ---------- launch ----------

def launch(jobdir, turn):
    # The mod hands over the turn's files on stdin ({"files": {name: text}}), so it never writes inside .git itself.
    os.makedirs(path(jobdir, "tmp"), exist_ok=True)
    sys.stdin.reconfigure(encoding="utf-8")
    data = sys.stdin.read()
    files = (json.loads(data) if data.strip() else {}).get("files") or {}
    for name, text in files.items():
        if os.path.basename(name) != name or name in ("", ".", ".."):
            raise SystemExit(f"bad file name {name!r}")
        with open(path(jobdir, name), "w", encoding="utf-8", newline="\n") as fh:
            fh.write(text)
    try:
        os.remove(path(jobdir, "cancel"))  # a previous turn's; a cancel sent after this point still counts
    except OSError:
        pass
    write_json(path(jobdir, "status.json"), {"turn": int(turn), "state": "starting", "supervisorPid": None, "codexPid": None,
                                             "startedAt": now_ms(), "beatAt": now_ms()})
    flags = DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW if IS_WIN else 0
    p = subprocess.Popen([sys.executable, os.path.abspath(__file__), "run", jobdir, str(turn)],
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                         close_fds=True, creationflags=flags, start_new_session=not IS_WIN)
    print(p.pid)


# ---------- run ----------

def compact(ev):
    """The event with long fields cut, so the mod can read the whole events file."""
    item = ev.get("item")
    if isinstance(item, dict):
        item = dict(item)
        out = item.get("aggregated_output")
        if isinstance(out, str) and len(out) > OUTPUT_MAX:
            item["aggregated_output"] = out[:OUTPUT_MAX] + f"... [{len(out)} chars]"
        text = item.get("text")
        if isinstance(text, str) and len(text) > TEXT_MAX:
            item["text"] = text[:TEXT_MAX] + "..."
        ev = {**ev, "item": item}
    return ev


class Pump:
    """Copies new complete lines of Codex's raw stream into the compact events file; notes the turn's end."""

    def __init__(self, raw, events):
        self.raw, self.events, self.pos, self.buf = raw, events, 0, b""
        self.ended_at = None
        self.failed = None

    def step(self):
        try:
            with open(self.raw, "rb") as fh:
                fh.seek(self.pos)
                chunk = fh.read()
        except OSError:
            return
        if not chunk:
            return
        self.pos += len(chunk)
        self.buf += chunk
        *lines, self.buf = self.buf.split(b"\n")
        out = []
        for line in lines:
            line = line.strip()
            if not line:
                continue
            try:
                ev = json.loads(line.decode("utf-8", errors="replace"))
            except ValueError:
                continue
            if not isinstance(ev, dict):
                continue
            kind = ev.get("type")
            if kind in ("turn.completed", "turn.failed") and self.ended_at is None:
                self.ended_at = time.time()
            if kind == "turn.failed":
                err = ev.get("error") if isinstance(ev.get("error"), dict) else {}
                self.failed = str(err.get("message") or "turn failed")
            out.append(json.dumps(compact(ev), ensure_ascii=False))
        if out:
            with open(self.events, "a", encoding="utf-8") as fh:
                fh.write("\n".join(out) + "\n")


def stage(wt):
    """Stages the turn's changes: every change to a tracked file, and new files that are not build junk (JUNK)."""
    rc, out, err = git(wt, "add", "-u")
    if rc != 0:
        return rc, out, err
    return git(wt, "add", "-A", "--", ".", *(f":(exclude,glob){p}" for p in JUNK))


def commit(spec, jobdir, status):
    """Commits the worktree's changes on the job branch (repo hooks off) and refreshes diff.patch vs the base."""
    wt, base = spec["cwd"], spec["base"]
    rc, out, err = git(wt, "status", "--porcelain")
    if rc != 0:
        status["commitError"] = (err or out).strip()[-400:]
    elif out.strip():
        rc, out, err = stage(wt)
        if rc != 0:
            status["commitError"] = (err or out).strip()[-400:]
    # Nothing staged (no changes, or only junk): no commit.
    if status.get("commitError") is None and git(wt, "diff", "--cached", "--quiet")[0] != 0:
        msg = spec.get("commitMessage") or "codex: job turn"
        if status["state"] != "done":
            msg += f" ({status['state']})"
        rc, out, err = git(wt, "-c", f"core.hooksPath={path(jobdir, 'no-hooks')}", "commit", "-q", "-m", msg)
        if rc != 0:
            status["commitError"] = (err or out).strip()[-400:]
        else:
            status["commit"] = git(wt, "rev-parse", "HEAD")[1].strip()
    status["head"] = git(wt, "rev-parse", "HEAD")[1].strip() or None
    status["stat"] = git(wt, "diff", "--stat=100", base, "HEAD")[1].rstrip()[-4000:]
    status["shortstat"] = git(wt, "diff", "--shortstat", base, "HEAD")[1].strip()
    rc, patch, _ = git(wt, "diff", base, "HEAD")
    if rc == 0:
        with open(path(jobdir, "diff.patch"), "w", encoding="utf-8", newline="\n") as fh:
            fh.write(patch)


def run(jobdir, turn):
    n = int(turn)
    spec = read_json(path(jobdir, f"turn-{n}.json"))
    status = {"turn": n, "state": "running", "supervisorPid": os.getpid(), "codexPid": None, "startedAt": now_ms(),
              "beatAt": now_ms(), "endedAt": None, "exitCode": None, "turnEnded": False, "error": None,
              "commit": None, "commitError": None, "head": None, "stat": "", "shortstat": ""}
    if not isinstance(spec, dict):
        status.update(state="failed", error=f"turn-{n}.json missing or unreadable", endedAt=now_ms())
        write_json(path(jobdir, "status.json"), status)
        return
    os.makedirs(path(jobdir, "tmp"), exist_ok=True)
    env = dict(os.environ)
    for k, v in (spec.get("env") or {}).items():
        env[k] = os.path.normpath(v) if k in ("TEMP", "TMP") else v
    raw, events = path(jobdir, f"turn-{n}.raw.jsonl"), path(jobdir, f"turn-{n}.events.jsonl")
    open(events, "w").close()
    fi = open(path(jobdir, f"turn-{n}.prompt.txt"), "rb")
    fo, fe = open(raw, "wb"), open(path(jobdir, f"turn-{n}.stderr"), "wb")
    try:
        p = subprocess.Popen(spec["argv"], stdin=fi, stdout=fo, stderr=fe, cwd=spec["cwd"], env=env,
                             creationflags=(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP) if IS_WIN else 0,
                             start_new_session=not IS_WIN)
    except OSError as e:
        for f in (fi, fo, fe):
            f.close()
        status.update(state="failed", error=f"could not start codex: {e}", endedAt=now_ms())
        write_json(path(jobdir, "status.json"), status)
        return
    status["codexPid"] = p.pid
    write_json(path(jobdir, "status.json"), status)
    log(jobdir, f"turn {n}: codex pid {p.pid}")
    pump = Pump(raw, events)
    t0, beat, reason = time.time(), time.time(), None
    timeout = float(spec.get("timeoutS") or 1800)
    while True:
        pump.step()
        if p.poll() is not None:
            break
        if os.path.exists(path(jobdir, "cancel")):
            reason = "cancelled"
        elif time.time() - t0 > timeout:
            reason = "timed_out"
        elif pump.ended_at is not None and time.time() - pump.ended_at > LINGER_S:
            reason = "linger"
        if reason:
            log(jobdir, f"turn {n}: {reason}; stopping codex")
            kill_tree(p.pid)
            break
        if time.time() - beat >= BEAT_S:
            beat = time.time()
            status["beatAt"] = now_ms()
            write_json(path(jobdir, "status.json"), status)
        time.sleep(0.5)
    try:
        p.wait(timeout=20)
    except subprocess.TimeoutExpired:
        kill_tree(p.pid)
    for f in (fi, fo, fe):
        f.close()
    pump.step()
    rc = p.returncode
    log(jobdir, f"turn {n}: codex exited {rc}")
    if reason in ("cancelled", "timed_out"):
        state = reason
    elif pump.failed is not None:
        state = "failed"
        status["error"] = pump.failed
    elif pump.ended_at is not None or rc == 0:
        state = "done"
    else:
        state = "failed"
        status["error"] = f"codex exited with code {rc} before the turn completed"
    status.update(state="committing", exitCode=rc, turnEnded=pump.ended_at is not None, beatAt=now_ms())
    write_json(path(jobdir, "status.json"), status)
    status["state"] = state
    try:
        commit(spec, jobdir, status)
    except Exception as e:  # the turn's outcome still has to land
        status["commitError"] = f"commit step failed: {e}"
    status.update(endedAt=now_ms(), beatAt=now_ms())
    write_json(path(jobdir, "status.json"), status)
    log(jobdir, f"turn {n}: {state}, commit {status.get('commit')}")


# ---------- wait / cancel ----------

def wait(jobdir, turn, secs):
    end = time.time() + float(secs)
    st = read_json(path(jobdir, "status.json"), {})
    while time.time() < end:
        st = read_json(path(jobdir, "status.json"), st)
        if st.get("turn") == int(turn) and st.get("state") in TERMINAL:
            break
        time.sleep(0.5)
    print(json.dumps(st, ensure_ascii=False))


def cancel(jobdir):
    with open(path(jobdir, "cancel"), "w") as fh:
        fh.write(str(now_ms()))
    end = time.time() + 20
    st = read_json(path(jobdir, "status.json"), {})
    while True:
        st = read_json(path(jobdir, "status.json"), st)
        if st.get("state") in TERMINAL:
            break
        if not alive(st.get("supervisorPid")) and st.get("state") != "starting":
            break
        # A commit under way gets longer before it is cut off.
        if time.time() > end + (40 if st.get("state") == "committing" else 0):
            break
        time.sleep(0.5)
    if st.get("state") not in TERMINAL:
        # The supervisor is gone or stuck: stop what is left and record the end ourselves.
        kill_tree(st.get("codexPid"))
        kill_tree(st.get("supervisorPid"))
        st.update(state="cancelled", endedAt=now_ms(), error=st.get("error") or "cancelled; the supervisor did not answer")
        write_json(path(jobdir, "status.json"), st)
    print(json.dumps(st, ensure_ascii=False))


def reap(folder):
    """Starts reap-run detached: a dropped worktree's folder can stay held by Codex's sandbox helper for minutes."""
    flags = DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW if IS_WIN else 0
    p = subprocess.Popen([sys.executable, os.path.abspath(__file__), "reap-run", folder],
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                         close_fds=True, creationflags=flags, start_new_session=not IS_WIN)
    print(p.pid)


def reap_run(folder, secs=1800):
    import shutil
    end = time.time() + secs
    while os.path.exists(folder) and time.time() < end:
        shutil.rmtree(folder, ignore_errors=True)
        if os.path.exists(folder):
            time.sleep(15)


if __name__ == "__main__":
    cmd, args = sys.argv[1], sys.argv[2:]
    if cmd == "launch":
        launch(*args)
    elif cmd == "run":
        run(*args)
    elif cmd == "wait":
        wait(*args)
    elif cmd == "cancel":
        cancel(*args)
    elif cmd == "reap":
        reap(*args)
    elif cmd == "reap-run":
        reap_run(*args)
    else:
        raise SystemExit(f"unknown command {cmd}")
