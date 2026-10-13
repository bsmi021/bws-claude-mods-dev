"""The one gate for this repo's mods: validate + plugin test + tsc (strict) for every plugin folder.

    python tools/mods-gate.py                 # every plugin, plus the kit sync check when tools/sync-kit.py exists
    python tools/mods-gate.py --plugin bws-enhance   # one plugin (a fast check while working)
    python tools/mods-gate.py --plugin bws-kit       # the kit folder: its tests and tsc (it is not a plugin)

Exit 0 only when everything passes. Failures print the tail of the failing command.
A plugin folder is any top-level folder with .claude-plugin/plugin.json.
"""
import argparse
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TSC = os.environ.get(
    "MODS_TSC",
    "C:/Users/bsmi0/AppData/Local/pnpm/global/5/.pnpm/typescript@5.8.3/node_modules/typescript/bin/tsc",
)


def main_tree() -> Path | None:
    """The main checkout when this is a linked worktree (types are gitignored, so copy them from there)."""
    r = subprocess.run(["git", "rev-parse", "--git-common-dir"], cwd=ROOT, capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if r.returncode != 0:
        return None
    common = Path(r.stdout.strip())
    common = common if common.is_absolute() else (ROOT / common)
    top = common.resolve().parent
    return top if top != ROOT else None


def run(cmd: list[str], cwd: Path, timeout: int = 300) -> tuple[bool, str]:
    env = dict(os.environ, NO_COLOR="1")
    try:
        r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace",
                           timeout=timeout, env=env)
    except subprocess.TimeoutExpired:
        return False, f"timed out after {timeout}s"
    out = (r.stdout or "") + (r.stderr or "")
    return r.returncode == 0, out.strip()


def plugins() -> list[Path]:
    return sorted(p.parent.parent for p in ROOT.glob("*/.claude-plugin/plugin.json"))


def bootstrap_types(plugin: Path) -> None:
    if (plugin / ".claude-plugin" / "types").is_dir():
        return
    src_root = main_tree()
    if src_root is None:
        return
    src = src_root / plugin.name / ".claude-plugin" / "types"
    if src.is_dir():
        shutil.copytree(src, plugin / ".claude-plugin" / "types")


def check(plugin: Path) -> list[str]:
    problems: list[str] = []
    bootstrap_types(plugin)
    ok, out = run(["claude", "plugin", "validate", f"./{plugin.name}"], ROOT)
    if not ok or "Validation passed" not in out:
        problems.append(f"{plugin.name}: validate failed\n{out[-1500:]}")
    ok, out = run(["claude", "plugin", "test"], plugin)
    if not ok:
        problems.append(f"{plugin.name}: plugin test failed\n{out[-2500:]}")
    ok, out = run(["node", TSC, "-p", str(plugin), "--noEmit"], ROOT)
    if not ok:
        problems.append(f"{plugin.name}: tsc failed\n{out[-2500:]}")
    return problems


KIT = ROOT / "bws-kit"


def check_kit() -> list[str]:
    """bws-kit is a folder of pure modules, not a plugin: run its tests and type-check it against cockpit's types."""
    bootstrap_types(ROOT / "bws-cockpit")
    problems: list[str] = []
    ok, out = run(["claude", "plugin", "test"], KIT)
    if not ok:
        problems.append(f"bws-kit: plugin test failed\n{out[-2500:]}")
    ok, out = run(["node", TSC, "-p", str(KIT), "--noEmit"], ROOT)
    if not ok:
        problems.append(f"bws-kit: tsc failed\n{out[-2500:]}")
    return problems


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--plugin", help="check one plugin folder only")
    a = ap.parse_args()
    t0 = time.time()
    todo = [p for p in plugins() if a.plugin in (None, p.name)]
    do_kit = KIT.is_dir() and a.plugin in (None, "bws-kit")
    if not todo and not do_kit:
        print(f"no plugin folder matches {a.plugin!r}", file=sys.stderr)
        return 2
    problems: list[str] = []
    for p in todo:
        found = check(p)
        print(f"{'FAIL' if found else 'ok  '} {p.name}")
        problems += found
    if do_kit:
        found = check_kit()
        print(f"{'FAIL' if found else 'ok  '} bws-kit")
        problems += found
    sync = ROOT / "tools" / "sync-kit.py"
    if a.plugin is None and sync.exists():
        ok, out = run([sys.executable, str(sync), "--check"], ROOT)
        print(f"{'ok  ' if ok else 'FAIL'} kit sync")
        if not ok:
            problems.append(f"kit sync failed\n{out[-1500:]}")
    print(f"{len(todo)} plugin(s){' + kit' if do_kit else ''}, {time.time() - t0:.0f}s")
    for pr in problems:
        print("\n---\n" + pr)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
