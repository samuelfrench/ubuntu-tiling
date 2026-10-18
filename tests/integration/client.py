"""Minimal resizable GTK 3 window used as a tiling target. Usage: client.py <title> [app-id]"""
import sys

import gi

gi.require_version("Gtk", "3.0")
from gi.repository import GLib  # noqa: E402

if len(sys.argv) > 2:
    # GTK 3.24 sends g_get_prgname() as the Wayland xdg_toplevel app id, which
    # Mutter reports as the WM class. It must be set before Gtk is imported:
    # PyGObject's Gtk override runs gtk_init, which names the program client.py
    # when no prgname is set yet.
    GLib.set_prgname(sys.argv[2])

from gi.repository import Gtk  # noqa: E402

window = Gtk.Window(title=sys.argv[1])
window.set_default_size(480, 320)
window.add(Gtk.Label(label=sys.argv[1]))
window.connect("destroy", Gtk.main_quit)
window.show_all()
Gtk.main()
