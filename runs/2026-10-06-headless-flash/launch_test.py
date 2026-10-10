import subprocess, sys
mode = sys.argv[1]
probe = "C:/Projects/bws.mods.claude-code/runs/2026-10-06-headless-flash/probe"
log = "C:/Projects/bws.mods.claude-code/runs/2026-10-06-headless-flash/receipts/probe.log"
with open(log, "a") as f: f.write(f"=== mode={mode}\n")
flags = 0x08000000 if mode == "nowin" else 0
prompt = "Run these in order: Bash tool `echo hi && git --version`; PowerShell tool `Get-Date`; then reply done."
p = subprocess.Popen(["claude", "-p", prompt, "--plugin-dir", probe, "--allowedTools", "Bash", "PowerShell", "--output-format", "text"],
                     stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, creationflags=flags)
out, _ = p.communicate(timeout=240)
with open(log, "a") as f: f.write(f"exit={p.returncode} out={out.strip()[:120]!r}\n")
