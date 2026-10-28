"""bin/supervise.py's commit step against real git repos: build junk stays out of a job's commit.

    python -m unittest discover -s bws-codex/tests -p "test_*.py"

Stdlib only. Each test makes a throwaway repo, runs `supervise.run` on a turn whose "codex" is a Python one-liner that
writes files, and reads what the job branch's commit holds.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "bin"))
import supervise  # noqa: E402


def git(cwd, *args):
    return subprocess.run(["git", "-C", cwd, *args], capture_output=True, text=True, check=True).stdout


class CommitTest(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp(prefix="bws-codex-sup-")
        self.repo = os.path.join(self.root, "repo")
        self.jobdir = os.path.join(self.root, "job")
        os.makedirs(os.path.join(self.repo, "src"))
        os.makedirs(os.path.join(self.repo, "vendor", "node_modules", "lib"))
        os.makedirs(self.jobdir)
        git(self.repo, "init", "-q", "-b", "main")
        git(self.repo, "config", "user.email", "t@example.invalid")
        git(self.repo, "config", "user.name", "t")
        git(self.repo, "config", "core.autocrlf", "false")
        self.write("src/calc.py", "def add(a, b):\n    return a + b\n")
        self.write("vendor/node_modules/lib/index.js", "// vendored and tracked\n")
        self.write(".gitignore", "*.log\n")
        git(self.repo, "add", "-A")
        git(self.repo, "commit", "-q", "-m", "init")
        self.base = git(self.repo, "rev-parse", "HEAD").strip()

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def write(self, rel, text):
        p = os.path.join(self.repo, *rel.split("/"))
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(text)

    def run_turn(self, files):
        """One turn whose codex writes `files` ({relative path: text}) in the repo, then exits 0."""
        code = (
            "import json, os, sys\n"
            "for rel, text in json.loads(sys.argv[1]).items():\n"
            "    p = os.path.join(*rel.split('/'))\n"
            "    os.makedirs(os.path.dirname(p) or '.', exist_ok=True)\n"
            "    open(p, 'w', encoding='utf-8', newline='\\n').write(text)\n"
        )
        spec = {"argv": [sys.executable, "-c", code, json.dumps(files)], "cwd": self.repo, "env": {}, "base": self.base,
                "commitMessage": "codex: test (job t, turn 1)", "timeoutS": 60}
        with open(os.path.join(self.jobdir, "turn-1.json"), "w", encoding="utf-8") as fh:
            json.dump(spec, fh)
        with open(os.path.join(self.jobdir, "turn-1.prompt.txt"), "w", encoding="utf-8") as fh:
            fh.write("task\n")
        supervise.run(self.jobdir, "1")
        with open(os.path.join(self.jobdir, "status.json"), encoding="utf-8") as fh:
            return json.load(fh)

    def committed(self):
        return sorted(git(self.repo, "diff", "--name-only", self.base, "HEAD").split())

    def test_junk_stays_out_and_real_changes_commit(self):
        st = self.run_turn({
            "src/calc.py": "def add(a, b):\n    return a + b\n\n\ndef mul(a, b):\n    return a * b\n",
            "src/new.py": "X = 1\n",
            "src/__pycache__/calc.cpython-312.pyc": "junk",
            "__pycache__/top.cpython-312.pyc": "junk",
            "src/stray.pyc": "junk",
            ".pytest_cache/v/cache/nodeids": "[]",
            "node_modules/dep/index.js": "junk",
            "web/node_modules/dep/index.js": "junk",
            "vendor/node_modules/lib/index.js": "// vendored and tracked, changed\n",
            "debug.log": "ignored by the repo's .gitignore",
        })
        self.assertEqual(st["state"], "done")
        self.assertIsNone(st["commitError"])
        self.assertIsNotNone(st["commit"])
        self.assertEqual(self.committed(), ["src/calc.py", "src/new.py", "vendor/node_modules/lib/index.js"])
        self.assertIn("3 files changed", st["shortstat"])
        # Left in the worktree, untracked: never staged, never lost.
        self.assertTrue(os.path.exists(os.path.join(self.repo, "src", "__pycache__", "calc.cpython-312.pyc")))
        with open(os.path.join(self.jobdir, "diff.patch"), encoding="utf-8") as fh:
            self.assertNotIn("__pycache__", fh.read())

    def test_only_junk_makes_no_commit_and_no_error(self):
        st = self.run_turn({"src/__pycache__/calc.cpython-312.pyc": "junk", "node_modules/x/i.js": "junk"})
        self.assertEqual(st["state"], "done")
        self.assertIsNone(st["commit"])
        self.assertIsNone(st["commitError"])
        self.assertEqual(st["head"], self.base)
        self.assertEqual(st["shortstat"], "")

    def test_no_changes_makes_no_commit(self):
        st = self.run_turn({})
        self.assertEqual(st["state"], "done")
        self.assertIsNone(st["commit"])
        self.assertIsNone(st["commitError"])
        self.assertEqual(st["head"], self.base)

    def test_a_deleted_tracked_file_commits(self):
        os.remove(os.path.join(self.repo, "src", "calc.py"))
        st = self.run_turn({})
        self.assertIsNotNone(st["commit"])
        self.assertEqual(self.committed(), ["src/calc.py"])


if __name__ == "__main__":
    unittest.main()
