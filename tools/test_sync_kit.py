"""Tests for tools/sync-kit.py, run against a temp repo root through the real command line.

    python tools/test_sync_kit.py
"""
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent / "sync-kit.py"


def cli(root: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, str(SCRIPT), "--root", str(root), *args], capture_output=True, text=True, encoding="utf-8")


def world(tmp: Path) -> Path:
    kit = tmp / "bws-kit"
    kit.mkdir()
    (kit / "alpha.ts").write_text("import { b } from './beta'\nexport const a = b\n", encoding="utf-8")
    (kit / "beta.ts").write_text("export const b = 1\n", encoding="utf-8")
    (kit / "gamma.ts").write_text("export const g = 2\n", encoding="utf-8")
    plug = tmp / "bws-demo"
    plug.mkdir()
    (plug / "kit.json").write_text('{ "modules": ["alpha"] }', encoding="utf-8")
    return plug


class SyncKit(unittest.TestCase):
    def setUp(self) -> None:
        self._t = tempfile.TemporaryDirectory()
        self.root = Path(self._t.name)
        self.plug = world(self.root)
        self.out = self.plug / "hooks" / "kit"

    def tearDown(self) -> None:
        self._t.cleanup()

    def test_sync_copies_listed_modules_and_their_siblings_with_a_header(self) -> None:
        r = cli(self.root)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(sorted(f.name for f in self.out.iterdir()), ["alpha.ts", "beta.ts"])
        text = (self.out / "alpha.ts").read_text(encoding="utf-8")
        self.assertTrue(text.startswith("// vendored from bws-kit/alpha.ts by tools/sync-kit.py, do not edit"))
        self.assertTrue(text.endswith("export const a = b\n"))

    def test_check_passes_after_sync(self) -> None:
        cli(self.root)
        r = cli(self.root, "--check")
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_check_fails_when_a_copy_is_tampered(self) -> None:
        cli(self.root)
        f = self.out / "beta.ts"
        f.write_text(f.read_text(encoding="utf-8") + "// edited by hand\n", encoding="utf-8")
        r = cli(self.root, "--check")
        self.assertEqual(r.returncode, 1)
        self.assertIn("bws-demo/hooks/kit/beta.ts: differs from the kit", r.stdout)

    def test_check_fails_when_the_kit_moves_on_and_a_copy_is_missing_or_stale(self) -> None:
        cli(self.root)
        (self.root / "bws-kit" / "beta.ts").write_text("export const b = 99\n", encoding="utf-8")
        self.assertEqual(cli(self.root, "--check").returncode, 1)
        cli(self.root)
        (self.out / "beta.ts").unlink()
        self.assertIn("missing", cli(self.root, "--check").stdout)
        cli(self.root)
        (self.out / "extra.ts").write_text("x", encoding="utf-8")
        self.assertIn("stale", cli(self.root, "--check").stdout)
        cli(self.root)  # sync removes the stale file
        self.assertFalse((self.out / "extra.ts").exists())

    def test_crlf_checkout_does_not_count_as_a_difference(self) -> None:
        cli(self.root)
        for f in self.out.iterdir():
            f.write_bytes(f.read_bytes().replace(b"\n", b"\r\n"))
        self.assertEqual(cli(self.root, "--check").returncode, 0)

    def test_bad_kit_json_and_unknown_module_fail_without_a_crash(self) -> None:
        (self.plug / "kit.json").write_text('{ "modules": ["nope"] }', encoding="utf-8")
        r = cli(self.root, "--check")
        self.assertEqual(r.returncode, 1)
        self.assertIn("no module 'nope'", r.stdout)
        (self.plug / "kit.json").write_text("not json", encoding="utf-8")
        self.assertEqual(cli(self.root, "--check").returncode, 1)
        (self.plug / "kit.json").write_text('{ "modules": "alpha" }', encoding="utf-8")
        self.assertEqual(cli(self.root, "--check").returncode, 1)

    def test_a_plugin_without_kit_json_is_left_alone(self) -> None:
        other = self.root / "bws-other"
        other.mkdir()
        cli(self.root)
        self.assertFalse((other / "hooks").exists())
        self.assertEqual(cli(self.root, "--check").returncode, 0)

    def test_the_real_repo_is_in_sync(self) -> None:
        r = subprocess.run([sys.executable, str(SCRIPT), "--check"], capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
