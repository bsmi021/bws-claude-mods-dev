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


if __name__ == "__main__":
    unittest.main()
