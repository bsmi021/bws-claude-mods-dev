import subprocess, sys
hd = "C:/Projects/bws.game.pit-maneuver"
out = open(hd + "/runs/2026-10-04-pitu-harness/board.out.log", "a", encoding="utf-8")
kw = dict(cwd=hd, stdout=out, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL)
argv = [sys.executable, hd + "/tools/pitu-harness/harness.py", "serve"]
try:
    p = subprocess.Popen(argv, creationflags=0x8 | 0x200 | 0x01000000, **kw)  # as harness._spawn_detached
except OSError:
    p = subprocess.Popen(argv, creationflags=0x8 | 0x200, **kw)
print("board pid", p.pid)
