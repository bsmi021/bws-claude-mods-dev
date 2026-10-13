"""Vendors bws-kit modules into the plugins that list them (mods cannot import across plugins).

    python tools/sync-kit.py                    # write every plugin's hooks/kit/ from its kit.json
    python tools/sync-kit.py --check            # exit 1 when any vendored copy differs from the kit
    python tools/sync-kit.py --plugin bws-memory
    python tools/sync-kit.py --root DIR         # another repo root (the tests use a temp one)

A plugin's `kit.json` names the kit modules it wants:   { "modules": ["classify-fork", "summary"] }
A module's sibling imports (`./transcript`) come along. Each copy is `<plugin>/hooks/kit/<module>.ts` with a
header saying it is vendored; files in hooks/kit/ that the list no longer asks for are stale (removed on sync,
reported by --check). Line endings are compared as LF, so autocrlf checkouts do not flap.
"""
import argparse
import json
import re
import sys
from pathlib import Path

DEFAULT_ROOT = Path(__file__).resolve().parent.parent
HEADER = "// vendored from bws-kit/{name}.ts by tools/sync-kit.py, do not edit: change the kit and run `python tools/sync-kit.py`\n"
SIBLING = re.compile(r"""(?:from|import)\s+['"]\./([\w-]+)['"]""")


def lf(text: str) -> str:
    return text.replace("\r\n", "\n")


def read_modules(plugin: Path) -> list[str]:
    """The modules listed in <plugin>/kit.json, or raises ValueError with what is wrong with it."""
    try:
        data = json.loads((plugin / "kit.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        raise ValueError(f"{plugin.name}: kit.json unreadable ({e})")
    mods = data.get("modules") if isinstance(data, dict) else None
    if not isinstance(mods, list) or not all(isinstance(m, str) and re.fullmatch(r"[\w-]+", m) for m in mods):
        raise ValueError(f"{plugin.name}: kit.json needs {{\"modules\": [\"name\", ...]}}")
    return mods


def closure(kit: Path, names: list[str]) -> list[str]:
    """The listed modules plus every sibling they import, sorted; ValueError for a module the kit lacks."""
    seen: dict[str, str] = {}
    todo = list(names)
    while todo:
        n = todo.pop()
        if n in seen:
            continue
        f = kit / f"{n}.ts"
        if not f.is_file():
            raise ValueError(f"bws-kit has no module {n!r}")
        seen[n] = lf(f.read_text(encoding="utf-8"))
        todo += SIBLING.findall(seen[n])
    return sorted(seen)


def expected(kit: Path, names: list[str]) -> dict[str, str]:
    return {f"{n}.ts": HEADER.format(name=n) + lf((kit / f"{n}.ts").read_text(encoding="utf-8")) for n in closure(kit, names)}


def plugins_with_kit(root: Path, only: str | None) -> list[Path]:
    return sorted(p.parent for p in root.glob("*/kit.json") if only in (None, p.parent.name))


def sync(root: Path, only: str | None, check: bool) -> list[str]:
    """Writes (or, with check, compares) the copies; returns one line per problem."""
    kit = root / "bws-kit"
    problems: list[str] = []
    for plugin in plugins_with_kit(root, only):
        try:
            want = expected(kit, read_modules(plugin))
        except ValueError as e:
            problems.append(str(e))
            continue
        out = plugin / "hooks" / "kit"
        have = {f.name for f in out.glob("*.ts")} if out.is_dir() else set()
        for name, text in want.items():
            f = out / name
            same = f.is_file() and lf(f.read_text(encoding="utf-8")) == text
            if same:
                continue
            if check:
                problems.append(f"{plugin.name}/hooks/kit/{name}: {'differs from the kit' if f.is_file() else 'missing'}")
            else:
                out.mkdir(parents=True, exist_ok=True)
                f.write_text(text, encoding="utf-8", newline="\n")
        for name in sorted(have - set(want)):
            if check:
                problems.append(f"{plugin.name}/hooks/kit/{name}: stale (kit.json does not ask for it)")
            else:
                (out / name).unlink()
    return problems


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--plugin")
    ap.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    a = ap.parse_args()
    if not (a.root / "bws-kit").is_dir():
        print("no bws-kit folder", file=sys.stderr)
        return 2
    problems = sync(a.root, a.plugin, a.check)
    for p in problems:
        print(p, file=sys.stderr if not a.check else sys.stdout)
    n = len(plugins_with_kit(a.root, a.plugin))
    print(f"{'checked' if a.check else 'synced'} {n} plugin(s) with a kit.json" + (f", {len(problems)} problem(s)" if problems else ""))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
