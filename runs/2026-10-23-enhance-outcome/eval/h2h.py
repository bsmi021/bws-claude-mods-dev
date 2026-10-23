"""Which enhancer model writes the better new-prompt rewrite? Blind 3-way ranking of the haiku, sonnet and opus
rewrites for the same request and sample (order shuffled). python h2h.py -> out-h2h/{judge.json,report.md}"""
import json, random, re
from concurrent.futures import ThreadPoolExecutor

from eval import AGENTS, HERE, JUDGE, TREE, claude

MODELS = ["haiku", "sonnet", "opus"]
OUT = HERE / "out-h2h"

RANK = JUDGE.split("Score each rewrite")[0] + """Rank the three rewrites from best to worst: the one you would most rather hand to Claude Code first. Weigh outcome-first, leaving the method to Claude, keeping intent, inventing nothing, a checkable finish line and concision.

<context_given_to_rewriter>
Recent conversation: {conv}
Project file tree (paths in it are real):
{tree}
Generated, gitignored folders such as each mod's `.claude-plugin/types/` exist at runtime but are not in the tree.
The rewriter also had this instruction file; rules and paths cited from it are not invented:
<file path="AGENTS.md">
{agents}
</file>
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

<rewrite_C>
{c}
</rewrite_C>

Answer with JSON only: {{"ranking": ["A"|"B"|"C", ...3 letters best first], "why": "one sentence"}}"""


def main():
    cases = {c["id"]: c for c in json.loads((HERE / "cases.json").read_text())}
    gen = {m: {(r["case"], r["sample"]): r["text"] for r in json.loads((HERE / f"out-b-{m}" / "gen.json").read_text()) if r["variant"] == "new"} for m in MODELS}
    setup = json.loads((HERE / "out-b-haiku" / "setup.json").read_text())
    rng = random.Random(11)
    jobs = []
    for (cid, s) in sorted(gen["haiku"]):
        order = MODELS[:]; rng.shuffle(order)
        jobs.append((cid, s, order))
    def one(j):
        cid, s, order = j
        c = cases[cid]
        conv = f"user: {c['setup']} | assistant: {setup[cid][1]}" if cid in setup else "(none)"
        p = RANK.format(conv=conv, tree=TREE, agents=AGENTS, rough=c["rough"], a=gen[order[0]][(cid, s)], b=gen[order[1]][(cid, s)], c=gen[order[2]][(cid, s)])
        for _ in range(2):
            raw = claude("opus", "You are a strict, fair evaluator. Output only JSON.", p)
            m = re.search(r"\{.*\}", raw, re.S)
            try:
                v = json.loads(m.group(0))
                return {"case": cid, "sample": s, "ranking": [order["ABC".index(x)] for x in v["ranking"]], "why": v.get("why", "")}
            except Exception:
                pass
        return {"case": cid, "sample": s, "error": raw[:300]}
    with ThreadPoolExecutor(6) as ex:
        out = list(ex.map(one, jobs))
    OUT.mkdir(exist_ok=True)
    (OUT / "judge.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
    ok = [o for o in out if "error" not in o]
    md = ["# Enhancer models head to head (new prompt)", "", f"{len(ok)} blind 3-way rankings (opus judge).", "",
          "| model | 1st | 2nd | 3rd | mean rank |", "| --- | --- | --- | --- | --- |"]
    for m in MODELS:
        pos = [o["ranking"].index(m) + 1 for o in ok]
        md.append(f"| {m} | {pos.count(1)} | {pos.count(2)} | {pos.count(3)} | {sum(pos)/len(pos):.2f} |")
    md += ["", "| case | 1st per sample |", "| --- | --- |"]
    for cid in cases:
        md.append(f"| {cid} | {', '.join(o['ranking'][0] for o in ok if o['case'] == cid)} |")
    (OUT / "report.md").write_text("\n".join(md))
    print("\n".join(md))


if __name__ == "__main__":
    main()
