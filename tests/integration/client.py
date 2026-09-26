"""Minimal resizable GTK 3 window used as a tiling target. Usage: client.py <title>"""
import sys

import gi

gi.require_version("Gtk", "3.0")
from gi.repository import Gtk  # noqa: E402

window = Gtk.Window(title=sys.argv[1])
window.set_default_size(480, 320)
window.add(Gtk.Label(label=sys.argv[1]))
window.connect("destroy", Gtk.main_quit)
window.show_all()
Gtk.main()
