"""Eyeball check for bws-better 0.3.0: old (main) vs new headless upgrade, and the new interview questions."""
import json, os, re, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from eval import ENV, ROOT, HERE, claude

OLD = sys.argv[1]
ROUGH = [c["rough"] for c in json.loads((HERE / "cases-vague.json").read_text())] + [
    "make the bouncer tests pass on linux too", "add a light/dark theme toggle to the cockpit dashboard"]
lib = (ROOT / "bws-better" / "hooks" / "lib.ts").read_text()
QS = re.search(r"export const QUESTIONS_SYSTEM = `(.*?)`\n", lib, re.S).group(1)

def better(plugin, rough):
    r = subprocess.run(["claude", "-p", f"/better {rough}", "--plugin-dir", plugin, "--no-session-persistence"],
                       capture_output=True, text=True, cwd=ROOT, timeout=300, env=ENV)
    t = r.stdout.strip()
    return t[len("bws-better: "):] if t.startswith("bws-better: ") else t

def one(rough):
    q = claude("haiku", QS, f"<request>\n{rough}\n</request>")
    m = re.search(r"\{.*\}", q, re.S)
    qs = json.loads(m.group(0)).get("questions", []) if m else q
    return {"rough": rough, "old": better(OLD, rough), "new": better(str(ROOT / "bws-better"), rough), "questions": qs}

with ThreadPoolExecutor(6) as ex:
    out = list(ex.map(one, ROUGH))
(HERE / "out-better").mkdir(exist_ok=True)
(HERE / "out-better" / "check.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
for o in out:
    print("#####", o["rough"])
    print("-- new questions:", json.dumps(o["questions"], ensure_ascii=False))
    for v in ("old", "new"):
        print(f"-- {v} upgrade ({len(o[v].split())} words):"); print(o[v]); print()
