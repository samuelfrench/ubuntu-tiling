#!/usr/bin/python3
"""Offline self-test for run.py helpers. Never starts GNOME Shell or any compositor.

Usage: python3 tests/integration/test_run_offline.py
"""
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import run  # noqa: E402  run.py imports only the standard library at module level.

EXTENSION_FILE = ("file:///tmp/ut-columns-x/data/gnome-shell/extensions/"
                  "tiling-columns@samuelfrench.github.io/gridControls.js")


class ExtensionLogErrors(unittest.TestCase):
    def scan(self, text):
        with tempfile.TemporaryDirectory() as tmp:
            log = Path(tmp) / "shell.log"
            log.write_text(text)
            return run.extension_log_errors(log)

    def test_js_error_whose_stack_names_the_extension_is_reported(self):
        errors = self.scan(
            "(gnome-shell:1): Gjs-WARNING **: 12:00:00.000: JS ERROR: TypeError: dialog is null\n"
            f"_render@{EXTENSION_FILE}:232:20\n"
            "@resource:///org/gnome/shell/ui/init.js:21:20\n")
        self.assertEqual(len(errors), 1)
        self.assertIn("TypeError: dialog is null", errors[0])
        self.assertIn("gridControls.js:232:20", errors[0])

    def test_unrelated_critical_and_js_error_are_ignored(self):
        self.assertEqual(self.scan(
            "(gnome-shell:1): Clutter-CRITICAL **: 12:00:00.000: clutter_actor_allocate: "
            "assertion 'CLUTTER_IS_ACTOR (self)' failed\n"
            # Seen in native run 1 (/tmp/ut-columns-rkzzt350/shell.log): no portal on the private bus.
            "(gnome-shell:4130316): GNOME Shell-CRITICAL **: 12:05:20.604: Gio.DBusError: GDBus.Error:"
            "org.freedesktop.DBus.Error.ServiceUnknown: The name\n"
            "(gnome-shell:1): Gjs-WARNING **: 12:00:00.001: JS ERROR: Error: unrelated\n"
            "foo@resource:///org/gnome/shell/ui/main.js:1:1\n"), [])

    def test_extension_named_on_a_later_ordinary_line_is_not_attributed(self):
        self.assertEqual(self.scan(
            "(gnome-shell:1): Gjs-WARNING **: 12:00:00.000: JS ERROR: Error: unrelated\n"
            "foo@resource:///org/gnome/shell/ui/main.js:1:1\n"
            "libmutter-Message: 12:00:00.002: loaded tiling-columns@samuelfrench.github.io\n"), [])

    def test_disposed_object_critical_with_an_extension_frame_is_reported(self):
        errors = self.scan(
            "(gnome-shell:1): Gjs-CRITICAL **: 12:00:00.000: Object St.Button (0x1), has been already disposed\n"
            "== Stack trace for context 0x2 ==\n"
            f"#0   7ffd0000 i   {EXTENSION_FILE}:247 (1 @ 45)\n")
        self.assertEqual(len(errors), 1)

    def test_console_error_from_the_extension_is_reported(self):
        errors = self.scan("(gnome-shell:1): Gjs-Console-CRITICAL **: 12:00:00.000: "
                           "tiling-columns@samuelfrench.github.io: Tiling Assistant is not installed\n")
        self.assertEqual(len(errors), 1)

    def test_unhandled_rejection_from_the_extension_is_reported(self):
        errors = self.scan(
            "(gnome-shell:1): Gjs-WARNING **: 12:00:00.000: Unhandled promise rejection. To suppress this "
            "warning, add an error handler to your promise chain. Stack trace of the failed promise:\n"
            f"  arrange@{EXTENSION_FILE}:554:38\n")
        self.assertEqual(len(errors), 1)

    def test_unreadable_log_is_reported(self):
        errors = run.extension_log_errors(Path("/nonexistent/ut-shell.log"))
        self.assertEqual(len(errors), 1)
        self.assertTrue(errors[0].startswith("could not read"))

    def test_log_problems_names_the_mode(self):
        problems = run.log_problems({"stock": {"extension_log_errors": []},
                                     "columns": {"extension_log_errors": ["JS ERROR: x\nf@a.js:1:1"]}})
        self.assertEqual(len(problems), 1)
        self.assertTrue(problems[0].startswith("[columns] shell.log has 1 error(s)"))
        self.assertNotIn("\n", problems[0])


class GridCells(unittest.TestCase):
    """Expected cells on the test monitor's work area (2560x720 minus the 32 px top bar)."""
    WA = {"x": 0, "y": 32, "width": 2560, "height": 688}

    def test_ragged_three_fills_one_row(self):
        cells = run.grid_cells(self.WA, [3])
        self.assertEqual([(c["x"], c["width"]) for c in cells], [(0, 853), (853, 853), (1706, 854)])
        self.assertTrue(all(c["y"] == 32 and c["height"] == 688 for c in cells))

    def test_twelve_and_sixteen_are_two_rows(self):
        for shape, width in [([6, 6], None), ([8, 8], 320)]:
            cells = run.grid_cells(self.WA, shape)
            self.assertEqual(len(cells), sum(shape))
            self.assertEqual(sorted({(c["y"], c["height"]) for c in cells}), [(32, 344), (376, 344)])
            self.assertEqual(sum(c["width"] for c in cells[:shape[0]]), 2560)
            if width:
                self.assertTrue(all(c["width"] == width for c in cells))


if __name__ == "__main__":
    unittest.main()
