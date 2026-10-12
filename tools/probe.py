"""The one way to run a live Claude Code probe of a mod (it spends real model money).

    python tools/probe.py --plugin bws-cockpit --prompt "/cacheclock status" --out runs/<unit>/receipts/m1-probe.json
    python tools/probe.py --plugin bws-memory --prompt "remember that X" --settings path/to/settings.json

Runs `claude -p <prompt> --plugin-dir ./<plugin> --output-format stream-json --verbose` with CLAUDE_CODE_PLUGIN_DIRS
emptied (so the user's own mods never load into the probe), MSYS_NO_PATHCONV set (slash commands survive Git Bash),
with `--setting-sources project,local` (installed plugins do not load), and writes the stream to --out (default: stdout). Inside a harness worker session it is charged against the
per-task run budget (exit 3 when refused).
"""
import argparse
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def charge(label: str) -> None:
    home = os.environ.get("HARNESS_HOME")
    if not home:
        return
    sys.path.insert(0, home)
    import run_budget  # type: ignore

    ok, msg = run_budget.charge(label)
    if not ok:
        print(msg)
        sys.exit(3)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--plugin", required=True, help="plugin folder name, e.g. bws-cockpit")
    ap.add_argument("--prompt", help="prompt text; from Git Bash prefix the call with MSYS_NO_PATHCONV=1 if it starts with /")
    ap.add_argument("--prompt-file", help="read the prompt from this file (safe for slash commands and long text)")
    ap.add_argument("--out")
    ap.add_argument("--settings", help="settings JSON file (pluginConfigs for the plugin's options)")
    ap.add_argument("--model", default="haiku")
    ap.add_argument("--timeout", type=int, default=180)
    a = ap.parse_args()
    if a.prompt_file:
        a.prompt = Path(a.prompt_file).read_text(encoding="utf-8").strip()
    if not a.prompt:
        print("give --prompt or --prompt-file", file=sys.stderr)
        return 2
    if a.prompt.startswith("C:/Program Files/Git/"):
        print("Git Bash turned your leading / into a Windows path. Use --prompt-file, or prefix the call with "
              "MSYS_NO_PATHCONV=1.", file=sys.stderr)
        return 2
    if not (ROOT / a.plugin / ".claude-plugin" / "plugin.json").exists():
        print(f"no plugin folder {a.plugin}", file=sys.stderr)
        return 2
    charge(f"probe {a.plugin}: {a.prompt[:60]}")
    cmd = ["claude", "-p", a.prompt, "--plugin-dir", f"./{a.plugin}", "--output-format", "stream-json",
           "--verbose", "--model", a.model,
           "--setting-sources", "project,local"]  # project,local: the user's installed mods stay out of the probe
    if a.settings:
        cmd += ["--settings", a.settings]
    env = dict(os.environ, CLAUDE_CODE_PLUGIN_DIRS="", MSYS_NO_PATHCONV="1", NO_COLOR="1")
    try:
        r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace",
                           timeout=a.timeout, env=env, stdin=subprocess.DEVNULL)
    except subprocess.TimeoutExpired:
        print(f"probe timed out after {a.timeout}s", file=sys.stderr)
        return 1
    if a.out:
        out = Path(a.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(r.stdout, encoding="utf-8")
        print(f"wrote {a.out} ({len(r.stdout)} chars, exit {r.returncode})")
    else:
        sys.stdout.write(r.stdout)
    if r.stderr.strip():
        print(r.stderr.strip()[-1500:], file=sys.stderr)
    return r.returncode


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
