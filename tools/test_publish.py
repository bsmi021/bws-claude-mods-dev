"""Tests for tools/publish.py, run against a temp repo (main, an orphan publish, bare remotes) through the command line.

    python tools/test_publish.py
"""
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent / "publish.py"


def git(cwd: Path, *args: str) -> str:
    r = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, encoding="utf-8")
    if r.returncode != 0:
        raise AssertionError(f"git {' '.join(args)}: {r.stdout}{r.stderr}")
    return r.stdout.strip()


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def mod(root: Path, name: str, version: str, log: str | None = None) -> None:
    write(root / name / ".claude-plugin" / "plugin.json", json.dumps({"name": name, "version": version}, indent=2) + "\n")
    write(root / name / "CHANGELOG.md", f"# Changelog\n\n## {version}\n- {log or 'First.'}\n")


def market(root: Path, version: str) -> None:
    plugins = [{"name": n, "source": f"./{n}"} for n in ("bws-a", "bws-b")]
    write(root / ".claude-plugin" / "marketplace.json", json.dumps({"name": "m", "plugins": plugins, "metadata": {"version": version}}, indent=2) + "\n")


def world(tmp: Path) -> Path:
    repo = tmp / "repo"
    repo.mkdir()
    git(repo, "init", "-q", "-b", "main")
    for k, v in (("user.name", "T"), ("user.email", "t@example.com"), ("commit.gpgsign", "false"), ("core.autocrlf", "false")):
        git(repo, "config", k, v)
    mod(repo, "bws-a", "0.1.0")
    write(repo / "bws-a" / "hooks" / "register.ts", "export const a = 1\n")
    write(repo / "bws-a" / "old.txt", "dropped later\n")
    mod(repo, "bws-b", "0.3.0")
    market(repo, "1.0.0")
    write(repo / "runs" / "2026-01-01-x" / "RUNLOG.md", "private notes\n")
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", "main 1")
    git(repo, "checkout", "-q", "--orphan", "publish")
    git(repo, "rm", "-q", "-r", "--cached", "runs")
    write(repo / "README.md", "landing\n")
    git(repo, "add", "README.md")
    git(repo, "commit", "-q", "-m", "bws-mods 1.0.0")
    git(repo, "checkout", "-q", "-f", "main")
    for remote in ("mods", "private"):
        bare = tmp / f"{remote}.git"
        git(tmp, "init", "-q", "--bare", bare.as_posix())
        git(repo, "remote", "add", remote, bare.as_posix())
    git(repo, "config", "remote.mods.push", "refs/heads/publish:refs/heads/main")
    git(repo, "push", "-q", "mods", "publish:main")
    git(repo, "push", "-q", "private", "main")
    git(repo, "fetch", "-q", "private")
    return repo


def bump(repo: Path, version: str = "1.1.0", line: str = "export const a = 2\n") -> None:
    mod(repo, "bws-a", "0.2.0", "Second.")
    write(repo / "bws-a" / "hooks" / "register.ts", line)
    (repo / "bws-a" / "old.txt").unlink()
    market(repo, version)
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", "bump bws-a")


class Publish(unittest.TestCase):
    def setUp(self) -> None:
        self._t = tempfile.TemporaryDirectory()
        self.tmp = Path(self._t.name)
        self.repo = world(self.tmp)
        self.marker = self.tmp / "gate.txt"
        self.gate_ok = self.tmp / "gate_ok.py"
        self.gate_ok.write_text(f"import sys\nopen({self.marker.as_posix()!r}, 'w').write(' '.join(sys.argv[1:]))\nprint('1 plugin(s), 0s')\n", encoding="utf-8")
        self.gate_fail = self.tmp / "gate_fail.py"
        self.gate_fail.write_text("print('FAIL bws-a')\nraise SystemExit(1)\n", encoding="utf-8")
        self.gh_log = self.tmp / "gh.txt"
        self.gh = self.tmp / "gh.py"
        self.gh.write_text(f"import sys\nopen({self.gh_log.as_posix()!r}, 'w').write(' '.join(sys.argv[1:]))\n", encoding="utf-8")

    def tearDown(self) -> None:
        subprocess.run(["git", "worktree", "prune"], cwd=self.repo, capture_output=True)
        self._t.cleanup()

    def cli(self, *args: str, gate: Path | None = None) -> subprocess.CompletedProcess:
        extra = ["--gate-script", str(gate or self.gate_ok), "--gh", f'"{Path(sys.executable).as_posix()}" "{self.gh.as_posix()}"']
        return subprocess.run([sys.executable, str(SCRIPT), "--root", str(self.repo), *extra, *args],
                              capture_output=True, text=True, encoding="utf-8")

    def worktrees(self) -> int:
        return git(self.repo, "worktree", "list").count("\n") + 1

    def test_verify_reports_no_diff_when_publish_is_current(self) -> None:
        r = self.cli()
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn("no diff vs publish tip (1.0.0)", r.stdout)
        self.assertEqual(self.worktrees(), 1)
        self.assertFalse(self.marker.exists())

    def test_verify_names_what_main_changed(self) -> None:
        bump(self.repo)
        r = self.cli()
        self.assertEqual(r.returncode, 1)
        self.assertIn("publish is behind main: bws-a, .claude-plugin/marketplace.json", r.stdout)

    def test_unbumped_mod_and_marketplace_are_refused(self) -> None:
        write(self.repo / "bws-a" / "hooks" / "register.ts", "export const a = 3\n")
        git(self.repo, "commit", "-q", "-am", "edit without bump")
        r = self.cli("bws-a", "--version", "1.0.0")
        self.assertEqual(r.returncode, 1)
        self.assertIn("bws-a: version 0.1.0 is not above the published 0.1.0", r.stdout)
        self.assertIn("marketplace version 1.0.0 is not above the published 1.0.0", r.stdout)

    def test_missing_changelog_entry_wrong_version_and_unlisted_mod_are_refused(self) -> None:
        bump(self.repo)
        write(self.repo / "bws-a" / "CHANGELOG.md", "# Changelog\n\n## 0.1.0\n- First.\n")
        write(self.repo / "bws-b" / "extra.ts", "export {}\n")
        git(self.repo, "add", "-A")
        git(self.repo, "commit", "-q", "-m", "drift")
        r = self.cli("bws-a", "--version", "1.2.0")
        self.assertEqual(r.returncode, 1)
        self.assertIn("bws-a: CHANGELOG.md has no `## 0.2.0` entry", r.stdout)
        self.assertIn("says 1.1.0, not 1.2.0", r.stdout)
        self.assertIn("changed on main but not named", r.stdout)
        self.assertIn("bws-b", r.stdout)

    def test_dry_run_checks_gates_and_prints_commands_without_touching_publish(self) -> None:
        bump(self.repo)
        tip = git(self.repo, "rev-parse", "publish")
        r = self.cli("bws-a", "--version", "1.1.0")
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn("ok   publish worktree matches main", r.stdout)
        self.assertIn("ok   privacy scan", r.stdout)
        self.assertIn("ok   gate in the worktree", r.stdout)
        self.assertIn("--root", self.marker.read_text(encoding="utf-8"))
        self.assertIn("dry run: nothing committed", r.stdout)
        self.assertIn("push mods refs/heads/publish:refs/heads/main", r.stdout)
        self.assertIn("release create v1.1.0 --repo bsmi021/bws-claude-mods", r.stdout)
        self.assertEqual(git(self.repo, "rev-parse", "publish"), tip)
        self.assertEqual(self.worktrees(), 1)
        self.assertFalse(self.gh_log.exists())

    def test_push_publishes_the_release_and_drops_deleted_files(self) -> None:
        bump(self.repo)
        r = self.cli("bws-a", "--version", "1.1.0", "--push")
        self.assertEqual(r.returncode, 0, r.stdout)
        files = git(self.repo, "ls-tree", "-r", "--name-only", "publish").splitlines()
        self.assertNotIn("bws-a/old.txt", files)
        self.assertIn("README.md", files)
        self.assertFalse(any(f.startswith("runs/") for f in files))
        self.assertIn('"version": "0.2.0"', git(self.repo, "show", "publish:bws-a/.claude-plugin/plugin.json"))
        self.assertEqual(git(self.repo, "log", "-1", "--format=%s", "publish"), "bws-mods 1.1.0: bws-a 0.2.0")
        mods = (self.tmp / "mods.git").as_posix()
        self.assertEqual(git(self.tmp, "--git-dir", mods, "rev-parse", "main"), git(self.repo, "rev-parse", "publish"))
        self.assertEqual(git(self.tmp, "--git-dir", mods, "rev-parse", "v1.1.0^{commit}"), git(self.repo, "rev-parse", "publish"))
        self.assertNotIn("runs/", git(self.tmp, "--git-dir", mods, "ls-tree", "-r", "--name-only", "main"))
        private = (self.tmp / "private.git").as_posix()
        self.assertEqual(git(self.tmp, "--git-dir", private, "rev-parse", "main"), git(self.repo, "rev-parse", "main"))
        gh = self.gh_log.read_text(encoding="utf-8")
        self.assertTrue(gh.startswith("release create v1.1.0 --repo bsmi021/bws-claude-mods --title bws-mods 1.1.0 --notes-file"))
        notes = Path(gh.split("--notes-file ")[1].strip()).read_text(encoding="utf-8")
        self.assertIn("| bws-a | 0.2.0 |", notes)
        self.assertIn("- Second.", notes)
        self.assertEqual(self.worktrees(), 1)

    def test_privacy_hit_stops_before_the_gate_and_allow_waives_it(self) -> None:
        bump(self.repo, line="const home = 'C:/Users/somebody/.claude'\n")
        r = self.cli("bws-a", "--version", "1.1.0")
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn("FAIL privacy scan: 1 hit(s)", r.stdout)
        self.assertIn("bws-a/hooks/register.ts:1: Windows user path", r.stdout)
        self.assertFalse(self.marker.exists())
        self.assertEqual(self.worktrees(), 1)
        r = self.cli("bws-a", "--version", "1.1.0", "--allow", "const home")
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_failing_gate_stops_the_release(self) -> None:
        bump(self.repo)
        r = self.cli("bws-a", "--version", "1.1.0", "--push", gate=self.gate_fail)
        self.assertEqual(r.returncode, 1)
        self.assertIn("FAIL gate in the worktree", r.stdout)
        self.assertFalse(self.gh_log.exists())
        self.assertEqual(git(self.repo, "log", "-1", "--format=%s", "publish"), "bws-mods 1.0.0")


class Scan(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        spec = importlib.util.spec_from_file_location("publish", SCRIPT)
        assert spec and spec.loader
        cls.p = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.p)

    def hits(self, *lines: str) -> list[str]:
        diff = "+++ b/x.md\n@@ -0,0 +1,9 @@\n" + "".join(f"+{l}\n" for l in lines)
        return self.p.scan(diff, [])

    def test_public_handles_and_placeholders_pass(self) -> None:
        self.assertEqual(self.hits("https://github.com/bsmi021", "projectRoots: C:/Projects", "C:/Users/<you>/.claude",
                                   "%USERPROFILE%", "noreply@anthropic.com"), [])

    def test_private_terms_are_caught(self) -> None:
        for line in ("C:\\Users\\bob\\x", "C:\\\\Users\\\\bob", "bsmi0 home", "me@gmail.com", "ask Brian", "The Monastery",
                     "Heim lore", "ghp_" + "a" * 30, "ABCDE-12345-FGHIJ-67890-KLMNO", "serial number: X1"):
            self.assertEqual(len(self.hits(line)), 1, line)

    def test_line_numbers_follow_the_hunk(self) -> None:
        diff = "+++ b/f.ts\n@@ -3,0 +4,2 @@\n+ok\n+Brian\n"
        self.assertEqual(self.p.scan(diff, []), ["f.ts:5: person name: Brian"])

    def test_changelog_entry_reads_one_section(self) -> None:
        text = "# C\n\n## 0.2.0\n- two\n\n## 0.1.0\n- one\n"
        self.assertEqual(self.p.changelog_entry(text, "0.2.0"), "- two")
        self.assertIsNone(self.p.changelog_entry(text, "0.3.0"))


if __name__ == "__main__":
    unittest.main()
