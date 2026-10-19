"""Release bws-mods: refresh the orphan `publish` branch from main, check it, then print (or run) the push commands.

    python tools/publish.py                                    # verify: publish tip matches main for every published mod
    python tools/publish.py bws-board bws-cockpit --version 1.8.0          # dry run a release (default)
    python tools/publish.py bws-board bws-cockpit --version 1.8.0 --push   # the same, then commit, push, tag, release

A release, in order (any failure stops it and removes the scratch worktree):
  1. each named mod's plugin.json version on main is above its version on the publish tip, and its CHANGELOG.md
     has a `## <version>` entry; the marketplace version on main equals --version and is above the publish tip's;
     a published mod that changed on main but is not named stops the release
  2. a scratch worktree on `publish` gets `git restore --source=<main> --staged --worktree` of the named mod
     folders and .claude-plugin/marketplace.json (restore, not checkout, so files main dropped go too)
  3. the restored paths match main exactly: `git ls-files` = `git ls-tree -r <main>`, `git diff --cached --quiet <main>`
  4. privacy scan of every line the release adds vs the publish tip (names, project and game names, serials,
     Windows user paths, keys); any hit stops the release (--allow REGEX waives a reviewed line)
  5. each mod's gitignored .claude-plugin/types/ is copied in from this checkout, then tools/mods-gate.py gates
     the worktree
  6. the commit, push, tag and `gh release create` commands are printed; --push runs them

Never pushes main to `mods`: the publish branch goes to mods' main by an explicit refspec. Verify mode (no mods
named) restores every published mod folder and the marketplace and reports whether publish is current; it
needs no version bump and skips the gate.
"""
import argparse
import json
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MARKET = ".claude-plugin/marketplace.json"
LEAN_MCP_TYPES = 400_000  # a live --plugin-dir run bloats claude-code-mcp types to ~500 KB; tsc then fails (TS2589)

# (label, pattern). Matched against each added line. The bsmi021 handle and the C:/Projects default are public.
PRIVATE = [
    ("Windows user path", re.compile(r"[A-Za-z]:(?:\\\\|\\|/)Users(?:\\\\|\\|/)(?!<|\{|%|\$|you\b|USER|Public\b|Default\b)", re.I)),
    ("user name", re.compile(r"\bbsmi0(?!21)", re.I)),
    ("personal email", re.compile(r"[\w.+-]+@(?:gmail|outlook|hotmail|yahoo|icloud|proton(?:mail)?)\.(?:com|me)", re.I)),
    ("person name", re.compile(r"\b(?:Brian|Smith)\b")),
    ("game name", re.compile(r"Monastery|\bHeim\b|\bTMS\b|tmsUnreal|bws\.game", re.I)),
    ("day-job name", re.compile(r"sas-ai|\bSAS\b")),
    ("private tool name", re.compile(r"Chronicler|pink-gill", re.I)),
    ("key or token", re.compile(r"\b(?:sk-(?:ant-)?[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_\w{20,}|AKIA[0-9A-Z]{16})")),
    ("serial", re.compile(r"\b[A-Z0-9]{5}(?:-[A-Z0-9]{5}){4}\b|serial(?:\s*(?:number|no\.?))?\s*[:=#]\s*\w", re.I)),
]


class Stop(Exception):
    pass


def git(cwd: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess:
    r = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if check and r.returncode != 0:
        raise Stop(f"git {' '.join(args)} failed:\n{(r.stdout + r.stderr).strip()}")
    return r


def show(root: Path, ref: str, path: str) -> str | None:
    r = git(root, "show", f"{ref}:{path}", check=False)
    return r.stdout if r.returncode == 0 else None


def version_tuple(v: str) -> tuple[int, ...]:
    m = re.fullmatch(r"v?(\d+(?:\.\d+)*)", v.strip())
    if not m:
        raise Stop(f"not a version: {v!r}")
    return tuple(int(x) for x in m.group(1).split("."))


def manifest_version(root: Path, ref: str, mod: str) -> str | None:
    text = show(root, ref, f"{mod}/.claude-plugin/plugin.json")
    return None if text is None else str(json.loads(text).get("version", ""))


def market(root: Path, ref: str) -> dict:
    text = show(root, ref, MARKET)
    if text is None:
        raise Stop(f"{ref} has no {MARKET}")
    return json.loads(text)


def market_mods(m: dict) -> list[str]:
    return [p["source"].removeprefix("./").rstrip("/") for p in m.get("plugins", [])]


def changelog_entry(text: str, version: str) -> str | None:
    """The body under `## <version>` (up to the next `## `), or None when there is no such heading."""
    m = re.search(rf"^##\s+v?{re.escape(version)}\b[^\n]*\n(.*?)(?=^##\s|\Z)", text, re.M | re.S)
    return None if m is None else m.group(1).strip()


def tree_differs(root: Path, a: str, b: str, path: str) -> bool:
    return git(root, "diff", "--quiet", a, b, "--", path, check=False).returncode != 0


def scan(diff: str, allow: list[re.Pattern]) -> list[str]:
    """Privacy hits in the added lines of a unified diff, as `file:line: label: text`."""
    hits: list[str] = []
    path, line = "?", 0
    for raw in diff.splitlines():
        if raw.startswith("+++ "):
            path = raw[6:] if raw.startswith("+++ b/") else raw[4:]
        elif raw.startswith("@@"):
            m = re.search(r"\+(\d+)", raw)
            line = int(m.group(1)) if m else 0
        elif raw.startswith("+"):
            text = raw[1:]
            if not any(a.search(text) for a in allow):
                for label, pat in PRIVATE:
                    if pat.search(text):
                        hits.append(f"{path}:{line}: {label}: {text.strip()[:160]}")
                        break
            line += 1
        elif not raw.startswith("-") and not raw.startswith("\\"):
            line += 1
    return hits


def copy_types(root: Path, wt: Path, mods: list[str]) -> list[str]:
    """Copy each mod's gitignored generated types into the worktree; swap a bloated claude-code-mcp for a lean one."""
    notes: list[str] = []
    lean = None
    for mod in mods:
        f = root / mod / ".claude-plugin" / "types" / "claude-code-mcp" / "index.d.ts"
        if f.is_file() and f.stat().st_size <= LEAN_MCP_TYPES and (lean is None or f.stat().st_size < lean.stat().st_size):
            lean = f
    for mod in mods:
        src = root / mod / ".claude-plugin" / "types"
        dst = wt / mod / ".claude-plugin" / "types"
        if not src.is_dir() or not (wt / mod).is_dir():
            continue
        if dst.exists():
            shutil.rmtree(dst)
        shutil.copytree(src, dst)
        mcp = dst / "claude-code-mcp" / "index.d.ts"
        if mcp.is_file() and mcp.stat().st_size > LEAN_MCP_TYPES and lean is not None:
            shutil.copyfile(lean, mcp)
            notes.append(f"{mod}: bloated claude-code-mcp types replaced with {lean.parent.parent.parent.parent.name}'s lean copy")
    return notes


def release_notes(version: str, rows: list[tuple[str, str, str]]) -> str:
    out = [f"| Mod | Version |", "|---|---|"]
    out += [f"| {mod} | {ver} |" for mod, ver, _ in rows]
    for mod, ver, entry in rows:
        out += ["", f"## {mod} {ver}", entry or "(no CHANGELOG text)"]
    first = rows[0][0] if rows else "bws-cockpit"
    out += ["", "## Update", "```bash", "claude plugin marketplace update bws-mods",
            f"claude plugin update {first}@bws-mods", "```",
            "Repeat the update line for each installed mod, then `/reload-plugins`.", ""]
    return "\n".join(out)


def quote(argv: list[str]) -> str:
    return " ".join(shlex.quote(a) for a in argv)


def run_release(a: argparse.Namespace) -> int:
    root = Path(a.root).resolve() if a.root else ROOT
    main_sha = git(root, "rev-parse", "--verify", f"{a.source}^{{commit}}").stdout.strip()
    pub_sha = git(root, "rev-parse", "--verify", f"{a.branch}^{{commit}}").stdout.strip()
    main_market, pub_market = market(root, main_sha), market(root, a.branch)
    published = market_mods(main_market)
    main_ver = str(main_market.get("metadata", {}).get("version", ""))
    pub_ver = str(pub_market.get("metadata", {}).get("version", ""))
    changed = [m for m in published if tree_differs(root, pub_sha, main_sha, m)]
    market_changed = tree_differs(root, pub_sha, main_sha, MARKET)
    print(f"source {a.source} {main_sha[:7]} (marketplace {main_ver}), {a.branch} tip {pub_sha[:7]} (marketplace {pub_ver})")

    verify = not a.mods
    if verify:
        if changed or market_changed:
            what = changed + ([MARKET] if market_changed else [])
            print(f"publish is behind {a.source}: {', '.join(what)}")
            print("name the mods to release and pass --version")
            return 1
        mods = published
    else:
        if not a.version:
            raise Stop("--version is required when releasing mods")
        mods = list(dict.fromkeys(a.mods))
        unknown = [m for m in mods if m not in published]
        if unknown:
            raise Stop(f"not in {a.source}'s marketplace: {', '.join(unknown)}")
        problems: list[str] = []
        for mod in mods:
            new, old = manifest_version(root, main_sha, mod), manifest_version(root, pub_sha, mod)
            if not new:
                problems.append(f"{mod}: no version in plugin.json on {a.source}")
                continue
            if old and version_tuple(new) <= version_tuple(old):
                problems.append(f"{mod}: version {new} is not above the published {old}")
            log = show(root, main_sha, f"{mod}/CHANGELOG.md")
            if log is None or changelog_entry(log, new) is None:
                problems.append(f"{mod}: CHANGELOG.md has no `## {new}` entry")
        if main_ver != a.version:
            problems.append(f"{MARKET} on {a.source} says {main_ver}, not {a.version}")
        elif version_tuple(a.version) <= version_tuple(pub_ver):
            problems.append(f"marketplace version {a.version} is not above the published {pub_ver}")
        unlisted = [m for m in changed if m not in mods]
        if unlisted:
            problems.append(f"changed on {a.source} but not named (bump and name them, or revert): {', '.join(unlisted)}")
        unchanged = [m for m in mods if m not in changed]
        if unchanged:
            problems.append(f"named but identical to the publish tip: {', '.join(unchanged)}")
        if git(root, "rev-parse", "-q", "--verify", f"refs/tags/v{a.version}", check=False).returncode == 0:
            problems.append(f"tag v{a.version} already exists")
        if problems:
            print("release refused:")
            for p in problems:
                print(f"  - {p}")
            return 1
        dirty = git(root, "status", "--porcelain", "--", *mods, MARKET).stdout.strip()
        if dirty and a.source in ("HEAD", git(root, "branch", "--show-current").stdout.strip()):
            print(f"note: uncommitted changes under the released paths are not published (the commit is):\n{dirty}")

    paths = [*mods, MARKET]
    wt = Path(a.worktree).resolve() if a.worktree else Path(tempfile.mkdtemp(prefix="bws-publish-")) / "wt"
    git(root, "worktree", "add", wt.as_posix(), a.branch)
    keep = a.keep_worktree
    try:
        git(wt, "restore", f"--source={main_sha}", "--staged", "--worktree", "--", *paths)
        have = sorted(git(wt, "ls-files", "-z", "--", *paths).stdout.split("\0"))
        want = sorted(git(wt, "ls-tree", "-r", "-z", "--name-only", main_sha, "--", *paths).stdout.split("\0"))
        if have != want:
            extra, missing = sorted(set(have) - set(want)), sorted(set(want) - set(have))
            raise Stop(f"restored file list differs from {a.source}: extra {extra[:10]}, missing {missing[:10]}")
        if git(wt, "diff", "--cached", "--quiet", main_sha, "--", *paths, check=False).returncode != 0:
            raise Stop(f"restored content differs from {a.source}")
        print(f"ok   {a.branch} worktree matches {a.source} for {len(mods)} mod folder(s) and the marketplace")
        status = git(wt, "diff", "--cached", "--name-status", pub_sha, "--", *paths).stdout.strip()
        if verify:
            if status:
                raise Stop(f"unexpected diff vs the {a.branch} tip:\n{status}")
            print(f"ok   no diff vs {a.branch} tip ({pub_ver}): nothing to release")
            return 0
        print(f"diff vs {a.branch} tip: {len(status.splitlines())} file(s)")

        hits = scan(git(wt, "diff", "--cached", "-U0", "--no-color", "--no-ext-diff", pub_sha, "--", *paths).stdout,
                    [re.compile(x) for x in a.allow])
        if hits:
            print(f"FAIL privacy scan: {len(hits)} hit(s); fix them on {a.source} or waive a reviewed line with --allow REGEX")
            for h in hits:
                print(f"  {h}")
            return 1
        print("ok   privacy scan of the added lines")

        if a.no_gate:
            print("skip gate (--no-gate)")
        else:
            for n in copy_types(root, wt, [p.parent.parent.name for p in wt.glob("*/.claude-plugin/plugin.json")]):
                print(f"note {n}")
            gate = subprocess.run([sys.executable, a.gate_script, "--root", str(wt)], cwd=wt, capture_output=True,
                                  text=True, encoding="utf-8", errors="replace")
            out = (gate.stdout + gate.stderr).strip()
            if gate.returncode != 0:
                print(f"FAIL gate in the worktree:\n{out[-4000:]}")
                return 1
            print(f"ok   gate in the worktree ({out.splitlines()[-1] if out else 'no output'})")

        rows = []
        for mod in mods:
            ver = manifest_version(root, main_sha, mod) or ""
            rows.append((mod, ver, changelog_entry(show(root, main_sha, f"{mod}/CHANGELOG.md") or "", ver) or ""))
        notes = Path(tempfile.mkdtemp(prefix="bws-publish-notes-")) / f"v{a.version}.md"
        notes.write_text(Path(a.notes).read_text(encoding="utf-8") if a.notes else release_notes(a.version, rows),
                         encoding="utf-8")
        message = a.message or f"bws-mods {a.version}: " + ", ".join(f"{m} {v}" for m, v, _ in rows)
        tag = f"v{a.version}"
        cmds: list[list[str]] = []
        if a.source == "main" and git(root, "merge-base", "--is-ancestor", main_sha, f"{a.private}/main",
                                      check=False).returncode != 0:
            cmds.append(["git", "-C", root.as_posix(), "push", a.private, "main"])
        cmds += [
            ["git", "-C", wt.as_posix(), "commit", "-m", message],
            ["git", "-C", root.as_posix(), "push", a.remote, f"refs/heads/{a.branch}:refs/heads/main"],
            ["git", "-C", root.as_posix(), "tag", tag, f"refs/heads/{a.branch}"],
            ["git", "-C", root.as_posix(), "push", a.remote, f"refs/tags/{tag}"],
            [*shlex.split(a.gh), "release", "create", tag, "--repo", a.repo, "--title", f"bws-mods {a.version}",
             "--notes-file", notes.as_posix()],
        ]
        if not a.push:
            print(f"\nrelease notes: {notes.as_posix()}\ndry run: nothing committed or pushed. With --push this runs:")
            for c in cmds:
                print(f"  {quote(c)}")
            return 0
        for c in cmds:
            print(f"$ {quote(c)}")
            r = subprocess.run(c, capture_output=True, text=True, encoding="utf-8", errors="replace")
            out = (r.stdout + r.stderr).strip()
            if out:
                print(out[-2000:])
            if r.returncode != 0:
                keep = True
                print(f"FAIL; the worktree is kept at {wt.as_posix()} so you can finish by hand")
                return 1
        print(f"released {tag}; log it in the run folder's RUNLOG")
        return 0
    finally:
        if not keep:
            git(root, "worktree", "remove", "--force", wt.as_posix(), check=False)
            shutil.rmtree(wt if a.worktree else wt.parent, ignore_errors=True)
        else:
            print(f"worktree kept: {wt.as_posix()} (git worktree remove --force {wt.as_posix()})")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("mods", nargs="*", help="mod folders to release; none = verify publish is current")
    ap.add_argument("--version", help="the new marketplace version (must match marketplace.json on the source)")
    ap.add_argument("--push", action="store_true", help="commit, push, tag and create the GitHub release")
    ap.add_argument("--allow", action="append", default=[], help="regex: skip privacy hits on lines it matches")
    ap.add_argument("--message", help="publish commit message (default: bws-mods X: mod ver, ...)")
    ap.add_argument("--notes", help="release notes file (default: a table and each mod's CHANGELOG entry)")
    ap.add_argument("--no-gate", action="store_true", help="skip tools/mods-gate.py in the worktree")
    ap.add_argument("--keep-worktree", action="store_true", help="leave the scratch worktree in place")
    ap.add_argument("--root", help="repo root (default: this repo)")
    ap.add_argument("--source", default="main", help="ref to publish from (default main)")
    ap.add_argument("--branch", default="publish", help="the orphan publish branch")
    ap.add_argument("--remote", default="mods", help="the public marketplace remote")
    ap.add_argument("--private", default="private", help="the private remote main is pushed to")
    ap.add_argument("--repo", default="bsmi021/bws-claude-mods", help="GitHub repo for the release")
    ap.add_argument("--worktree", help="scratch worktree path (default: a temp folder)")
    ap.add_argument("--gate-script", default=str(ROOT / "tools" / "mods-gate.py"), help=argparse.SUPPRESS)
    ap.add_argument("--gh", default="gh", help=argparse.SUPPRESS)
    try:
        return run_release(ap.parse_args())
    except Stop as e:
        print(f"stopped: {e}")
        return 1


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
