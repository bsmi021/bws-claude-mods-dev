import os, subprocess, time, re
src = open(os.path.expanduser("~/.agents/skills/harness-loop/templates/harness.py"), encoding="utf-8").read()
m = re.search(r"# bws-nowindow-shim.*?subprocess\.Popen = _PopenNoWindow\n", src, re.S)
exec(m.group(0))
for _ in range(3):
    subprocess.run(["git", "--version"], capture_output=True); time.sleep(2)
subprocess.run(["powershell", "-NoProfile", "-Command", "1"], capture_output=True)
open("C:/Projects/bws.mods.claude-code/runs/2026-10-06-headless-flash/receipts/shim_check.done", "w").write("done")
