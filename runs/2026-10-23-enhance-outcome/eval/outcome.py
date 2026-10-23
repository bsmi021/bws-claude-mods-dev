"""Eval A: does the agent do better work from the raw prompt, the old rewrite or the new rewrite?

Each run: a fresh git worktree at BASE (main, which has none of this eval's notes), `claude -p <prompt>` with the
executor model, then objective checks and a blind judge (it does not see the arm or the executor).

python outcome.py run     -> out-a/runs.json   (TASKS x ARMS x EXECUTORS)
python outcome.py judge   -> out-a/judge.json
python outcome.py report  -> out-a/report.md
"""
import json, os, re, subprocess, sys, threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from eval import ENV, ROOT, HERE

OUT = HERE / "out-a"
WT = Path(os.environ.get("EVAL_WT", "/tmp/enhance-eval-wt"))
BASE = "b5f8015"  # main when this eval was written
REWRITES = HERE / "out-b-haiku" / "gen.json"  # the default enhancer's rewrites, sample 0
TASKS = ["linux-tests", "method-given", "investigate", "docs"]
ARMS = ["raw", "old", "new"]
EXECUTORS = ["sonnet", "opus"]
TIMEOUT = 1500
GIT = threading.Lock()  # worktree add/remove share .git/worktrees
TOOLS = ["Bash", "Read", "Edit", "Write", "Glob", "Grep"]

REFERENCE = {
    "linux-tests": """On Linux, 4 tests fail before any change: three bouncer glossary tests in bws-enhance/tests/bounce.test.ts and the headless /enhance test in tests/enhance.test.ts. Cause: the fixtures use Windows paths ("C:/proj/..."), which Linux resolves relative to the cwd (the engine reports ENOENT .../bws-enhance/C:/proj/AGENTS.md). Good outcome: `claude plugin test` in bws-enhance is green on Linux, the tests still assert the same behaviour (no skips, no deleted or loosened assertions), Windows behaviour is unchanged, and the change stays small.""",
    "method-given": """commandsText in bws-enhance/hooks/lib.ts sorts with `rank` only (builtin last). The developer asked for ONE comparator ordering by source, then name. Note the trap: the existing test expects '/interview (user)' before '/clear (builtin)'; a plain alphabetical source order puts 'builtin' first and breaks that. Good outcome: a single comparator by source then name, the tests pass (either the comparator keeps built-ins last, or the test is updated with that change called out), nothing else changed.""",
    "investigate": """Known answer, from the repo's AGENTS.md: "`$.model.fork` gives `nothing-to-fork` on a resumed session's first command: fall back to `$.session.messages()` + `$.model.complete`." A resumed session has no live model conversation to fork until a turn has run there. Good outcome: the answer names this (the nothing-to-fork result on the first command after /resume) with evidence from the repo, says what it could not confirm, suggests the fallback at most, and changes NO files.""",
    "docs": """bws-kit/README.md should describe the current bws-kit modules and how mods use them (vendored with tools/sync-kit.py per a mod's kit.json). Good outcome: only bws-kit/README.md changes; every name, export and behaviour it states exists in the code; stale claims are removed; nothing is invented.""",
}


def sh(cmd, cwd, timeout=600):
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout, env=ENV, shell=isinstance(cmd, str))
    return r.returncode, (r.stdout + r.stderr)


def prompts():
    cases = {c["id"]: c for c in json.loads((HERE / "cases.json").read_text())}
    gen = json.loads(REWRITES.read_text())
    pick = lambda t, v: next(r["text"] for r in gen if r["case"] == t and r["variant"] == v and r["sample"] == 0)
    return {t: {"raw": cases[t]["rough"], "old": pick(t, "old"), "new": pick(t, "new")} for t in TASKS}


def plugin_test(wt):
    code, out = sh(["claude", "plugin", "test"], wt / "bws-enhance", timeout=300)
    p = re.search(r"(\d+) pass", out); f = re.search(r"(\d+) fail", out)
    return {"pass": int(p.group(1)) if p else None, "fail": int(f.group(1)) if f else None}


def one(job):
    task, arm, ex, prompt = job
    name = f"{task}--{arm}--{ex}"
    wt = WT / name
    with GIT:
        if wt.exists():
            sh(["git", "worktree", "remove", "--force", str(wt)], ROOT)
        sh(["git", "worktree", "add", "--detach", str(wt), BASE], ROOT)
    args = ["claude", "-p", prompt, "--model", ex, "--output-format", "json", "--no-session-persistence",
            "--strict-mcp-config", "--allowedTools", *TOOLS, "--disallowedTools", "Bash(git push:*)"]
    try:
        r = subprocess.run(args, cwd=wt, capture_output=True, text=True, timeout=TIMEOUT, env=ENV)
        j = json.loads(r.stdout) if r.stdout.strip().startswith("{") else {"result": f"[exit {r.returncode}] {r.stderr[-500:]}"}
    except subprocess.TimeoutExpired:
        j = {"result": "[timeout]"}
    sh("git add -A", wt)
    _, diff = sh(["git", "diff", "--cached", BASE, "--", ".", ":(exclude).claude-plugin/types", ":(exclude)**/.claude-plugin/types/**"], wt)
    _, files = sh(["git", "diff", "--cached", "--name-only", BASE], wt)
    files = [f for f in files.split() if "/.claude-plugin/types/" not in f]
    checks = {"files_changed": files}
    if task in ("linux-tests", "method-given"):
        checks["plugin_test"] = plugin_test(wt)
    row = {"task": task, "arm": arm, "executor": ex, "prompt": prompt, "result": j.get("result", ""),
           "turns": j.get("num_turns"), "cost_usd": j.get("total_cost_usd"), "duration_s": (j.get("duration_ms") or 0) / 1000,
           "diff": diff[:30000], "checks": checks}
    (OUT / "runs").mkdir(parents=True, exist_ok=True)
    (OUT / "runs" / f"{name}.json").write_text(json.dumps(row, indent=1, ensure_ascii=False))
    with GIT:
        sh(["git", "worktree", "remove", "--force", str(wt)], ROOT)
    print(f"done {name}: turns={row['turns']} cost={row['cost_usd']} files={len(files)} {checks.get('plugin_test', '')}", flush=True)
    return row


def run():
    P = prompts()
    OUT.mkdir(exist_ok=True)
    (OUT / "prompts.json").write_text(json.dumps(P, indent=1, ensure_ascii=False))
    jobs = [(t, a, e, P[t][a]) for t in TASKS for a in ARMS for e in EXECUTORS]
    only = os.environ.get("EVAL_ONLY")  # e.g. "linux-tests--new--sonnet" for a smoke run
    if only: jobs = [j for j in jobs if f"{j[0]}--{j[1]}--{j[2]}" == only]
    with ThreadPoolExecutor(int(os.environ.get("EVAL_PAR", "4"))) as ex:
        rows = list(ex.map(one, jobs))
    if not only:
        (OUT / "runs.json").write_text(json.dumps(rows, indent=1, ensure_ascii=False))


JUDGE = """You grade the WORK an AI coding agent did on a task in a repository of Claude Code mods. You see what the developer actually wanted, a reference for what a good outcome is, objective check results, the agent's final report, and its diff. You do not see the prompt it was given; judge only the work.

<what_the_developer_wanted>
{rough}
</what_the_developer_wanted>

<reference>
{ref}
</reference>

<objective_checks>
{checks}
</objective_checks>

<agent_final_report>
{result}
</agent_final_report>

<diff_against_start>
{diff}
</diff_against_start>

Score 1-5:
- outcome: did it achieve what the developer wanted (per the reference)? 5 = fully, 1 = not at all.
- correctness: is what it did or said right (code correct, claims true, root cause right)?
- scope: did it stay within what was asked (no unrequested changes, no weakened tests, read-only when asked)?
- report: is the final report accurate and useful (says what was done, what was verified, what is uncertain)?
Answer with JSON only: {{"outcome": n, "correctness": n, "scope": n, "report": n, "why": "one sentence"}}"""


def judge():
    from eval import claude
    cases = {c["id"]: c for c in json.loads((HERE / "cases.json").read_text())}
    rows = [json.loads(p.read_text()) for p in sorted((OUT / "runs").glob("*.json"))]
    def g(r):
        checks = json.dumps(r["checks"]) + (f" (before any change: 51 pass, 4 fail)" if "plugin_test" in r["checks"] else "")
        for _ in range(2):
            raw = claude("opus", "You are a strict, fair evaluator of engineering work. Output only JSON.",
                         JUDGE.format(rough=cases[r["task"]]["rough"], ref=REFERENCE[r["task"]], checks=checks,
                                      result=r["result"][:6000], diff=r["diff"][:20000] or "(no changes)"))
            m = re.search(r"\{.*\}", raw, re.S)
            try:
                return {**{k: r[k] for k in ("task", "arm", "executor")}, **json.loads(m.group(0))}
            except Exception:
                pass
        return {**{k: r[k] for k in ("task", "arm", "executor")}, "error": raw[:300]}
    with ThreadPoolExecutor(6) as ex:
        out = list(ex.map(g, rows))
    (OUT / "judge.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
    print(f"{len(out)} judged, {sum('error' in o for o in out)} errors")


def report():
    rows = {(r["task"], r["arm"], r["executor"]): r for r in (json.loads(p.read_text()) for p in (OUT / "runs").glob("*.json"))}
    J = {(j["task"], j["arm"], j["executor"]): j for j in json.loads((OUT / "judge.json").read_text()) if "error" not in j}
    K = ["outcome", "correctness", "scope", "report"]
    md = ["# Eval A: agent work from raw vs old vs new prompts", "",
          f"Tasks {', '.join(TASKS)}; executors {', '.join(EXECUTORS)}; one run each; worktrees at {BASE}; blind opus judge.", ""]
    for ex in EXECUTORS:
        md += [f"## {ex}", "", "| arm | " + " | ".join(K) + " | mean | turns | cost $ | minutes |", "| --- " * (len(K) + 5) + "|"]
        for a in ARMS:
            js = [J[(t, a, ex)] for t in TASKS if (t, a, ex) in J]
            rs = [rows[(t, a, ex)] for t in TASKS if (t, a, ex) in rows]
            if not js: continue
            means = [sum(j[k] for j in js) / len(js) for k in K]
            md.append(f"| {a} | " + " | ".join(f"{m:.2f}" for m in means) + f" | **{sum(means)/len(K):.2f}** | "
                      f"{sum(r['turns'] or 0 for r in rs)/len(rs):.0f} | {sum(r['cost_usd'] or 0 for r in rs)/len(rs):.2f} | "
                      f"{sum(r['duration_s'] for r in rs)/len(rs)/60:.1f} |")
        md.append("")
    md += ["## Per run", "", "| task | executor | arm | outcome | corr | scope | report | checks | judge |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"]
    for t in TASKS:
        for ex in EXECUTORS:
            for a in ARMS:
                j = J.get((t, a, ex)); r = rows.get((t, a, ex))
                if not (j and r): continue
                c = r["checks"]; pt = c.get("plugin_test")
                ck = (f"tests {pt['pass']}/{pt['fail']} fail; " if pt else "") + f"{len(c['files_changed'])} files"
                md.append(f"| {t} | {ex} | {a} | {j['outcome']} | {j['correctness']} | {j['scope']} | {j['report']} | {ck} | {j['why'].replace('|', '/')} |")
    (OUT / "report.md").write_text("\n".join(md))
    print("\n".join(md))


if __name__ == "__main__":
    {"run": run, "judge": judge, "report": report}[sys.argv[1]]()
