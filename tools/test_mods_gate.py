"""Tests for the claude-code-mcp types restore in tools/mods-gate.py.

    python tools/test_mods_gate.py
"""
import contextlib
import importlib.util
import io
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("mods_gate", Path(__file__).resolve().parent / "mods-gate.py")
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)

LIMIT = gate.MCP_TYPES_LIMIT


def put(root: Path, name: str, size: int, fill: str) -> Path:
    f = root / name / gate.MCP_TYPES
    f.parent.mkdir(parents=True)
    f.write_text(fill * size, encoding="utf-8")
    return root / name


class RestoreLeanMcpTypes(unittest.TestCase):
    def setUp(self) -> None:
        self._t = tempfile.TemporaryDirectory()
        self.root = Path(self._t.name)

    def tearDown(self) -> None:
        self._t.cleanup()

    def restore(self, plugin: Path) -> str:
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            gate.restore_lean_mcp_types(plugin, self.root)
        return out.getvalue()

    def test_oversized_file_is_replaced_with_boards_copy_and_one_line_is_printed(self) -> None:
        put(self.root, "bws-board", 1000, "b")
        cockpit = put(self.root, "bws-cockpit", LIMIT + 1, "x")
        out = self.restore(cockpit)
        self.assertEqual((cockpit / gate.MCP_TYPES).read_text(encoding="utf-8"), "b" * 1000)
        self.assertEqual(len(out.strip().splitlines()), 1)
        self.assertIn("restored bws-cockpit", out)

    def test_file_at_the_limit_is_left_alone(self) -> None:
        put(self.root, "bws-board", 1000, "b")
        other = put(self.root, "bws-other", LIMIT, "x")
        self.assertEqual(self.restore(other), "")
        self.assertEqual((other / gate.MCP_TYPES).stat().st_size, LIMIT)

    def test_missing_types_file_is_ignored(self) -> None:
        put(self.root, "bws-board", 1000, "b")
        bare = self.root / "bws-bare"
        bare.mkdir()
        self.assertEqual(self.restore(bare), "")

    def test_oversized_reference_is_not_copied(self) -> None:
        board = put(self.root, "bws-board", LIMIT + 1, "b")
        other = put(self.root, "bws-other", LIMIT + 1, "x")
        out = self.restore(other)
        self.assertIn("warn", out)
        self.assertEqual((other / gate.MCP_TYPES).read_text(encoding="utf-8")[:1], "x")
        self.assertIn("reference copy", self.restore(board))

    def test_missing_reference_warns_and_keeps_the_file(self) -> None:
        other = put(self.root, "bws-other", LIMIT + 1, "x")
        self.assertIn("warn", self.restore(other))
        self.assertEqual((other / gate.MCP_TYPES).read_text(encoding="utf-8")[:1], "x")


class BootstrapTypes(unittest.TestCase):
    """A fresh worktree's plugins get their gitignored types from the main checkout, a new plugin a sibling's."""

    def setUp(self) -> None:
        self._t = tempfile.TemporaryDirectory()
        self.main = Path(self._t.name) / "main"
        self.wt = Path(self._t.name) / "wt"
        self._main_tree = gate.main_tree
        gate.main_tree = lambda: self.main

    def tearDown(self) -> None:
        gate.main_tree = self._main_tree
        self._t.cleanup()

    def bootstrap(self, plugin: Path) -> str:
        plugin.mkdir(parents=True, exist_ok=True)
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            gate.bootstrap_types(plugin)
        return out.getvalue()

    def test_a_plugin_the_main_checkout_has_gets_its_own_types(self) -> None:
        put(self.main, "bws-other", 10, "o")
        put(self.main, "bws-board", 10, "b")
        self.assertEqual(self.bootstrap(self.wt / "bws-other"), "")
        self.assertEqual((self.wt / "bws-other" / gate.MCP_TYPES).read_text(encoding="utf-8"), "o" * 10)

    def test_a_new_plugin_gets_boards_types_and_one_line_says_so(self) -> None:
        put(self.main, "bws-board", 10, "b")
        out = self.bootstrap(self.wt / "bws-new")
        self.assertEqual((self.wt / "bws-new" / gate.MCP_TYPES).read_text(encoding="utf-8"), "b" * 10)
        self.assertEqual((self.wt / "bws-board" / gate.MCP_TYPES).read_text(encoding="utf-8"), "b" * 10)
        self.assertEqual(out.strip(), "types bws-new: none generated yet; copied bws-board's")

    def test_existing_types_are_left_alone(self) -> None:
        put(self.main, "bws-board", 10, "b")
        mine = put(self.wt, "bws-new", 5, "m")
        self.assertEqual(self.bootstrap(mine), "")
        self.assertEqual((mine / gate.MCP_TYPES).read_text(encoding="utf-8"), "m" * 5)

    def test_nothing_to_copy_from_leaves_it_missing(self) -> None:
        self.assertEqual(self.bootstrap(self.wt / "bws-new"), "")
        self.assertFalse((self.wt / "bws-new" / ".claude-plugin" / "types").exists())


if __name__ == "__main__":
    unittest.main()
