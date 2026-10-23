"""Old vs new /enhance rewriter through the real mod: two bws-enhance copies differing only in lib.ts; opus judges blind (A/B order shuffled).

python eval.py gen     -> out/gen.json   (cases x {old,new} x SAMPLES)
python eval.py judge   -> out/judge.json (one blind pairwise judgement per case and sample)
python eval.py report  -> out/report.md
"""
import json, os, random, re, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OUT = HERE / "out"
SCRATCH = Path(os.environ.get("EVAL_CWD", "/tmp/enhance-eval-cwd"))
SAMPLES = int(os.environ.get("EVAL_SAMPLES", "2"))
GEN_MODEL = "haiku"
JUDGE_MODEL = "opus"
TARGET = "claude-sonnet-5-5"
SONNET_NOTE = ('Sonnet may stop early to check in, and adds unrequested tests or docs: include "keep working until the '
               'Done-when checks pass, then stop and report" and say not to add tests or docs beyond what is asked '
               'unless the project requires them.')
# Child runs must not inherit this cloud session's identity, or they write into its transcript.
ENV = {k: v for k, v in os.environ.items() if k not in {
    "CLAUDE_CODE_SESSION_ID", "CLAUDE_CODE_REMOTE_SESSION_ID", "CLAUDE_CODE_REMOTE_SDK_URL", "CLAUDE_CODE_TEE_SDK_STDOUT",
    "CLAUDE_CODE_MESSAGING_SOCKET", "CLAUDE_CODE_MESSAGING_TOKEN", "CLAUDE_CODE_SYNC_SESSION_REFS"}}
SKIP = {".git", "node_modules", "runs", "dist", "build", "out", "types", "__pycache__", ".cache"}


def system(path):
    m = re.search(r"export const SYSTEM = `(.*?)`\n", (HERE / path).read_text(), re.S)
    return m.group(1)


def tree(base, depth=2, limit=150):
    lines = []
    def walk(d, lvl):
        items = sorted(d.iterdir(), key=lambda p: (not p.is_dir(), p.name))
        for p in items:
            if len(lines) >= limit or (p.is_dir() and p.name in SKIP) or p.name == ".claude-plugin" and lvl > 0:
                continue
            lines.append("  " * lvl + p.name + ("/" if p.is_dir() else ""))
            if p.is_dir() and lvl + 1 < depth:
                walk(p, lvl + 1)
    walk(base, 0)
    return "\n".join(lines)


COMMANDS = "\n".join([
    "/plugin-authoring — Make a mod: a change to Claude's own interface or behaviour, such as a panel, band, status line or hook.",
    "/code-review — Review the current diff for correctness bugs.",
    "/simplify — Review changed code for reuse and simplification, then apply fixes.",
    "/bounce — Sets the prompt bouncer for this session.",
    "/cockpit — Opens the bws-cockpit dashboard.",
    "/reload-plugins — Reload plugins in this session.",
])


def user_prompt(case):
    agents = (ROOT / "AGENTS.md").read_text()[:6000]
    conv = "\n".join(f"{r}: {t}" for r, t in case.get("conversation", [])) or "(new session, nothing said yet)"
    return "\n\n".join([
        f"<project_root>C:/dev/bws-claude-mods-dev</project_root>",
        f'<project_tree depth="2">\n{tree(ROOT)}\n</project_tree>',
        f'<target_model name="{TARGET}">{SONNET_NOTE}</target_model>',
        f'<instruction_files>\n<file path="C:/dev/bws-claude-mods-dev/AGENTS.md">\n{agents}\n</file>\n</instruction_files>',
        f"<skills_and_commands>\n{COMMANDS}\n</skills_and_commands>",
        "<mcp_servers>github</mcp_servers>",
        f"<recent_conversation>\n{conv}\n</recent_conversation>",
        f"<rough_request>\n{case['rough']}\n</rough_request>",
        "Rewrite <rough_request> as the prompt Claude Code should receive. Output only that prompt.",
    ])


def claude(model, sys_prompt, prompt):
    SCRATCH.mkdir(parents=True, exist_ok=True)
    r = subprocess.run(
        ["claude", "-p", "--model", model, "--system-prompt", sys_prompt, "--tools", "", "--strict-mcp-config",
         "--no-session-persistence"],
        input=prompt, capture_output=True, text=True, cwd=SCRATCH, timeout=300, env=ENV)
    return r.stdout.strip() if r.returncode == 0 else f"[error {r.returncode}] {r.stderr.strip()[:300]}"


def clean(t):  # cleanReply in lib.ts
    t = t.strip()
    m = re.match(r"^```[\w-]*\n([\s\S]*?)\n```$", t)
    if m: t = m.group(1).strip()
    return re.sub(r"^(here(?:'s| is) (?:the |an |your )?(?:rewritten|enhanced|refined|improved)? ?prompt[^\n]*:)\s*\n", "", t, flags=re.I).strip()


MODS = Path(os.environ.get("EVAL_MODS", "/tmp/enhance-eval-mods"))  # mods/old and mods/new: bws-enhance copies differing only in hooks/lib.ts


def run(args, timeout=300):
    r = subprocess.run(["claude", "-p", *args], capture_output=True, text=True, cwd=ROOT, timeout=timeout, env=ENV)
    return r


def setup_session(case):
    """A real earlier turn for cases that need conversation; each rewrite forks from it."""
    import uuid
    r = run([case["setup"], "--tools", "", "--output-format", "json", "--session-id", str(uuid.uuid4())])
    j = json.loads(r.stdout)
    return j["session_id"], j.get("result", "")


def gen():
    """The real pipeline: `claude -p "/enhance <rough>" --plugin-dir mods/<variant>` from the repo root."""
    cases = json.loads((HERE / "cases.json").read_text())
    bases = {c["id"]: setup_session(c) for c in cases if "setup" in c}
    OUT.mkdir(exist_ok=True)
    (OUT / "setup.json").write_text(json.dumps(bases, indent=1, ensure_ascii=False))
    jobs = [(c, v, s) for c in cases for v in ("old", "new") for s in range(SAMPLES)]
    def one(j):
        c, v, s = j
        args = [f"/enhance {c['rough']}", "--plugin-dir", str(MODS / v)]
        args += ["--resume", bases[c["id"]][0], "--fork-session"] if c["id"] in bases else ["--no-session-persistence"]
        r = run(args)
        t = r.stdout.strip()
        t = t[len("bws-enhance: "):] if t.startswith("bws-enhance: ") else t
        if r.returncode != 0: t = f"[error {r.returncode}] {t} {r.stderr.strip()[:300]}"
        return {"case": c["id"], "variant": v, "sample": s, "text": t}
    with ThreadPoolExecutor(6) as ex:
        rows = list(ex.map(one, jobs))
    (OUT / "gen.json").write_text(json.dumps(rows, indent=1, ensure_ascii=False))
    print(f"{len(rows)} rewrites, {sum(r['text'].startswith('[error') for r in rows)} errors")


JUDGE = """You grade rewrites of a developer's rough request into a prompt for Claude Code, an agentic coding assistant that reads the project's code and chooses its own approach.

The developer wants GOAL- AND OUTCOME-ORIENTED prompts: say what must be true when the work is done, why when not obvious, and how to verify it; leave the method (steps, design, which files/functions to edit) to Claude, unless the developer chose a method themselves, in which case it must be kept.

Score each rewrite 1-5 on:
- outcome: opens with and centres the end state/result rather than activities or steps.
- method_left: leaves the how to Claude (no step lists, no prescribed design, no picking files/functions the developer did not name). 5 = none, 1 = a step-by-step plan. If the developer chose a method, keeping it is required, and dropping it scores 1.
- intent: keeps the developer's intent and scope exactly; adds nothing they did not ask for (e.g. an investigation must not turn into code changes).
- grounded: invents no file paths, symbols, APIs or facts not given in the context.
- verifiable: has a clear, checkable finish line (a check Claude can run, or an observable result).
- concise: no padding; length fits the task.
Then pick the rewrite you would rather hand to Claude Code: "A", "B" or "tie".

<context_given_to_rewriter>
Recent conversation: {conv}
Project: a repo of Claude Code mods. The rewriter was given the repo's AGENTS.md (mod rules; the gate is `python tools/mods-gate.py --plugin <mod>`; `claude plugin test`; bws-kit is shared code vendored with tools/sync-kit.py), installed skills/commands, and this file tree (paths in it are real, not invented):
{tree}
</context_given_to_rewriter>

<rough_request>
{rough}
</rough_request>

<rewrite_A>
{a}
</rewrite_A>

<rewrite_B>
{b}
</rewrite_B>

Answer with JSON only, no prose and no code fence:
{{"A": {{"outcome": n, "method_left": n, "intent": n, "grounded": n, "verifiable": n, "concise": n}}, "B": {{...same keys}}, "winner": "A"|"B"|"tie", "why": "one sentence"}}"""


TREE = tree(ROOT, depth=3, limit=400)


def judge():
    cases = {c["id"]: c for c in json.loads((HERE / "cases.json").read_text())}
    rows = json.loads((OUT / "gen.json").read_text())
    setup = json.loads((OUT / "setup.json").read_text())
    by = {(r["case"], r["variant"], r["sample"]): r["text"] for r in rows}
    rng = random.Random(7)
    jobs = []
    for cid, c in cases.items():
        for s in range(SAMPLES):
            flip = rng.random() < 0.5
            a, b = ("new", "old") if flip else ("old", "new")
            jobs.append((cid, s, a, b))
    def one(j):
        cid, s, a, b = j
        c = cases[cid]
        conv = f"user: {c['setup']} | assistant: {setup[cid][1]}" if cid in setup else "(none)"
        for _ in range(2):
          raw = claude(JUDGE_MODEL, "You are a strict, fair evaluator. Output only JSON.",
                     JUDGE.format(tree=TREE, conv=conv, rough=c["rough"], a=by[(cid, a, s)], b=by[(cid, b, s)]))
          m = re.search(r"\{.*\}", raw, re.S)
          try:
              v = json.loads(m.group(0)); break
          except Exception:
              v = None
        if v is None:
            return {"case": cid, "sample": s, "error": raw[:300]}
        w = v.get("winner")
        return {"case": cid, "sample": s, "old": v["A" if a == "old" else "B"],
                "new": v["A" if a == "new" else "B"], "winner": {"A": a, "B": b}.get(w, "tie"), "why": v.get("why", "")}
    with ThreadPoolExecutor(6) as ex:
        out = list(ex.map(one, jobs))
    (OUT / "judge.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
    print(f"{len(out)} judgements, {sum('error' in o for o in out)} errors")


def metrics(t):
    lines = t.splitlines()
    return {
        "words": len(t.split()),
        "step_lines": sum(bool(re.match(r"\s*(\d+[.)]|[-*•])\s", l)) for l in lines),
        "steps_header": bool(re.search(r"^\s*(\*\*)?steps?\b", t, re.I | re.M)),
        "paths": len(set(re.findall(r"[\w./-]+\.(?:tsx?|md|json|py)\b", t))),
        "done_when": bool(re.search(r"done when", t, re.I)),
        "meta": bool(re.match(r"\s*(I |I'm|I don't|Sorry|Note:)", t)),
    }


def report():
    cases = json.loads((HERE / "cases.json").read_text())
    gen_rows = json.loads((OUT / "gen.json").read_text())
    judged = [j for j in json.loads((OUT / "judge.json").read_text()) if "error" not in j]
    keys = ["outcome", "method_left", "intent", "grounded", "verifiable", "concise"]
    md = ["# Eval: old vs new /enhance rewriter", "",
          f"{len(cases)} rough requests x {SAMPLES} samples, through the real mod (`claude -p \"/enhance ...\" --plugin-dir`, enhancer model haiku, the default). Blind pairwise judge {JUDGE_MODEL} (A/B shuffled).", ""]
    wins = {"new": 0, "old": 0, "tie": 0}
    for j in judged: wins[j["winner"]] += 1
    md += [f"**Pairwise:** new {wins['new']}, old {wins['old']}, tie {wins['tie']} (of {len(judged)})", "",
           "| Rubric (1-5, mean) | old | new |", "| --- | --- | --- |"]
    for k in keys:
        o = sum(j["old"][k] for j in judged) / len(judged); n = sum(j["new"][k] for j in judged) / len(judged)
        md.append(f"| {k} | {o:.2f} | {n:.2f} |")
    md += ["", "| Mechanical (all rewrites) | old | new |", "| --- | --- | --- |"]
    for k in ["words", "step_lines", "paths"]:
        vals = {v: [metrics(r["text"])[k] for r in gen_rows if r["variant"] == v] for v in ("old", "new")}
        md.append(f"| mean {k} | {sum(vals['old'])/len(vals['old']):.1f} | {sum(vals['new'])/len(vals['new']):.1f} |")
    for k in ["steps_header", "done_when", "meta"]:
        vals = {v: sum(metrics(r["text"])[k] for r in gen_rows if r["variant"] == v) for v in ("old", "new")}
        n = len(gen_rows) // 2
        md.append(f"| has {k} | {vals['old']}/{n} | {vals['new']}/{n} |")
    md += ["", "## Per case", "", "| case | kind | winners | judge's reason (s0) |", "| --- | --- | --- | --- |"]
    for c in cases:
        js = sorted([j for j in judged if j["case"] == c["id"]], key=lambda j: j["sample"])
        why = js[0]["why"].replace("|", "/") if js else ""
        md.append(f"| {c['id']} | {c['kind']} | {', '.join(j['winner'] for j in js)} | {why} |")
    md += ["", "## Rewrites (sample 0)", ""]
    for c in cases:
        md += [f"### {c['id']}: `{c['rough'].splitlines()[0]}`", ""]
        for v in ("old", "new"):
            t = next(r["text"] for r in gen_rows if r["case"] == c["id"] and r["variant"] == v and r["sample"] == 0)
            md += [f"**{v}** ({len(t.split())} words)", "", "> " + t.replace("\n", "\n> "), ""]
    (OUT / "report.md").write_text("\n".join(md))
    print("\n".join(md[:30]))


if __name__ == "__main__":
    {"gen": gen, "judge": judge, "report": report}[sys.argv[1]]()
