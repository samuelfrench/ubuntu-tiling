from __future__ import annotations

import ctypes
import ctypes.util
import os
import subprocess
import time
from dataclasses import dataclass

from ubuntu_tiling.geometry import Monitor, Rect, Strut, apply_struts, parse_xrandr

X11_NAME = ctypes.util.find_library("X11") or "libX11.so.6"

ClientMessage = 33
SubstructureNotifyMask = 1 << 19
SubstructureRedirectMask = 1 << 20
PropertyChangeMask = 1 << 22
CurrentTime = 0
RevertToParent = 2
Success = 0
XA_CARDINAL = 6
XA_WINDOW = 33
XA_ATOM = 4
XA_STRING = 31
XA_WM_NAME = 39
MAX_PROPERTY_ITEMS = 16384


class XClientMessageEvent(ctypes.Structure):
    _fields_ = [
        ("type", ctypes.c_int),
        ("serial", ctypes.c_ulong),
        ("send_event", ctypes.c_int),
        ("display", ctypes.c_void_p),
        ("window", ctypes.c_ulong),
        ("message_type", ctypes.c_ulong),
        ("format", ctypes.c_int),
        ("data", ctypes.c_long * 5),
    ]


class XWindowAttributes(ctypes.Structure):
    _fields_ = [
        ("x", ctypes.c_int),
        ("y", ctypes.c_int),
        ("width", ctypes.c_int),
        ("height", ctypes.c_int),
        ("border_width", ctypes.c_int),
        ("depth", ctypes.c_int),
        ("visual", ctypes.c_void_p),
        ("root", ctypes.c_ulong),
        ("class", ctypes.c_int),
        ("bit_gravity", ctypes.c_int),
        ("win_gravity", ctypes.c_int),
        ("backing_store", ctypes.c_int),
        ("backing_planes", ctypes.c_ulong),
        ("backing_pixel", ctypes.c_ulong),
        ("save_under", ctypes.c_int),
        ("colormap", ctypes.c_ulong),
        ("map_installed", ctypes.c_int),
        ("map_state", ctypes.c_int),
        ("all_event_masks", ctypes.c_long),
        ("your_event_mask", ctypes.c_long),
        ("do_not_propagate_mask", ctypes.c_long),
        ("override_redirect", ctypes.c_int),
        ("screen", ctypes.c_void_p),
    ]


def _load_x11() -> ctypes.CDLL:
    lib = ctypes.cdll.LoadLibrary(X11_NAME)
    lib.XOpenDisplay.argtypes = [ctypes.c_char_p]
    lib.XOpenDisplay.restype = ctypes.c_void_p
    lib.XCloseDisplay.argtypes = [ctypes.c_void_p]
    lib.XDefaultRootWindow.argtypes = [ctypes.c_void_p]
    lib.XDefaultRootWindow.restype = ctypes.c_ulong
    lib.XInternAtom.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_int]
    lib.XInternAtom.restype = ctypes.c_ulong
    lib.XGetWindowProperty.argtypes = [
        ctypes.c_void_p,
        ctypes.c_ulong,
        ctypes.c_ulong,
        ctypes.c_long,
        ctypes.c_long,
        ctypes.c_int,
        ctypes.c_ulong,
        ctypes.POINTER(ctypes.c_ulong),
        ctypes.POINTER(ctypes.c_int),
        ctypes.POINTER(ctypes.c_ulong),
        ctypes.POINTER(ctypes.c_ulong),
        ctypes.POINTER(ctypes.POINTER(ctypes.c_ubyte)),
    ]
    lib.XGetWindowProperty.restype = ctypes.c_int
    lib.XFree.argtypes = [ctypes.c_void_p]
    lib.XFree.restype = ctypes.c_int
    lib.XGetWindowAttributes.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(XWindowAttributes)]
    lib.XGetWindowAttributes.restype = ctypes.c_int
    lib.XTranslateCoordinates.argtypes = [
        ctypes.c_void_p,
        ctypes.c_ulong,
        ctypes.c_ulong,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.POINTER(ctypes.c_int),
        ctypes.POINTER(ctypes.c_int),
        ctypes.POINTER(ctypes.c_ulong),
    ]
    lib.XTranslateCoordinates.restype = ctypes.c_int
    lib.XSendEvent.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_long, ctypes.c_void_p]
    lib.XSendEvent.restype = ctypes.c_int
    lib.XFlush.argtypes = [ctypes.c_void_p]
    lib.XSync.argtypes = [ctypes.c_void_p, ctypes.c_int]
    lib.XMoveResizeWindow.argtypes = [
        ctypes.c_void_p,
        ctypes.c_ulong,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_uint,
        ctypes.c_uint,
    ]
    lib.XRaiseWindow.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
    lib.XSetInputFocus.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
    lib.XMapRaised.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
    lib.XDisplayWidth.argtypes = [ctypes.c_void_p, ctypes.c_int]
    lib.XDisplayWidth.restype = ctypes.c_int
    lib.XDisplayHeight.argtypes = [ctypes.c_void_p, ctypes.c_int]
    lib.XDisplayHeight.restype = ctypes.c_int
    lib.XDefaultScreen.argtypes = [ctypes.c_void_p]
    lib.XDefaultScreen.restype = ctypes.c_int
    lib.XQueryTree.argtypes = [
        ctypes.c_void_p,
        ctypes.c_ulong,
        ctypes.POINTER(ctypes.c_ulong),
        ctypes.POINTER(ctypes.c_ulong),
        ctypes.POINTER(ctypes.POINTER(ctypes.c_ulong)),
        ctypes.POINTER(ctypes.c_uint),
    ]
    lib.XQueryTree.restype = ctypes.c_int
    return lib


@dataclass(frozen=True)
class FrameExtents:
    left: int = 0
    right: int = 0
    top: int = 0
    bottom: int = 0


class X11Session:
    def __init__(self, display_name: str | None = None) -> None:
        self._lib = _load_x11()
        name = display_name or os.environ.get("DISPLAY")
        raw = name.encode("utf-8") if name else None
        self._dpy = self._lib.XOpenDisplay(raw)
        if not self._dpy:
            raise RuntimeError(f"cannot open X display {name!r}")
        self._root = self._lib.XDefaultRootWindow(self._dpy)
        self._atoms: dict[str, int] = {}

    def close(self) -> None:
        if self._dpy:
            self._lib.XCloseDisplay(self._dpy)
            self._dpy = None

    def __enter__(self) -> X11Session:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def atom(self, name: str) -> int:
        cached = self._atoms.get(name)
        if cached is not None:
            return cached
        value = self._lib.XInternAtom(self._dpy, name.encode("ascii"), 0)
        self._atoms[name] = value
        return value

    def _get_property(self, window: int, name: str, req_type: int, expected_format: int) -> list[int]:
        actual_type = ctypes.c_ulong()
        actual_format = ctypes.c_int()
        nitems = ctypes.c_ulong()
        bytes_after = ctypes.c_ulong()
        prop = ctypes.POINTER(ctypes.c_ubyte)()
        status = self._lib.XGetWindowProperty(
            self._dpy,
            window,
            self.atom(name) if not name.startswith("XA:") else int(name.split(":")[1]),
            0,
            MAX_PROPERTY_ITEMS,
            0,
            req_type,
            ctypes.byref(actual_type),
            ctypes.byref(actual_format),
            ctypes.byref(nitems),
            ctypes.byref(bytes_after),
            ctypes.byref(prop),
        )
        if status != Success or not prop or actual_format.value != expected_format:
            if prop:
                self._lib.XFree(prop)
            return []
        count = nitems.value
        out: list[int] = []
        if expected_format == 32:
            buf = ctypes.cast(prop, ctypes.POINTER(ctypes.c_ulong))
            out = [int(buf[i]) for i in range(count)]
        elif expected_format == 8:
            buf = ctypes.cast(prop, ctypes.POINTER(ctypes.c_ubyte))
            out = [int(buf[i]) for i in range(count)]
        elif expected_format == 16:
            buf = ctypes.cast(prop, ctypes.POINTER(ctypes.c_ushort))
            out = [int(buf[i]) for i in range(count)]
        self._lib.XFree(prop)
        return out

    def _get_string(self, window: int, name: str) -> str:
        utf = self._get_property(window, name, self.atom("UTF8_STRING"), 8)
        if utf:
            return bytes(utf).split(b"\x00", 1)[0].decode("utf-8", "replace")
        latin = self._get_property(window, name, XA_STRING, 8)
        if latin:
            return bytes(latin).split(b"\x00", 1)[0].decode("latin-1", "replace")
        return ""

    def _get_wm_class(self, window: int) -> tuple[str, str]:
        raw = self._get_property(window, "WM_CLASS", XA_STRING, 8)
        if not raw:
            return "", ""
        parts = bytes(raw).split(b"\x00")
        decoded = [p.decode("utf-8", "replace") for p in parts if p]
        if len(decoded) >= 2:
            return decoded[0], decoded[1]
        if decoded:
            return decoded[0], decoded[0]
        return "", ""

    def screen_size(self) -> tuple[int, int]:
        screen = self._lib.XDefaultScreen(self._dpy)
        return (
            int(self._lib.XDisplayWidth(self._dpy, screen)),
            int(self._lib.XDisplayHeight(self._dpy, screen)),
        )

    def monitors(self) -> list[Monitor]:
        try:
            text = subprocess.check_output(["xrandr", "--current"], text=True)
            found = parse_xrandr(text)
            if found:
                return found
        except (OSError, subprocess.CalledProcessError):
            pass
        w, h = self.screen_size()
        return [Monitor("default", 0, 0, w, h, True)]

    def top_level_windows(self) -> list[int]:
        root_return = ctypes.c_ulong()
        parent_return = ctypes.c_ulong()
        children = ctypes.POINTER(ctypes.c_ulong)()
        nchildren = ctypes.c_uint()
        status = self._lib.XQueryTree(
            self._dpy,
            self._root,
            ctypes.byref(root_return),
            ctypes.byref(parent_return),
            ctypes.byref(children),
            ctypes.byref(nchildren),
        )
        if not status or not children:
            return self.client_list()
        windows = [int(children[i]) for i in range(nchildren.value)]
        self._lib.XFree(children)
        extra = self.client_list()
        seen = set(windows)
        for window in extra:
            if window not in seen:
                windows.append(window)
        return windows

    def struts(self) -> list[Strut]:
        out: list[Strut] = []
        for window in self.top_level_windows():
            partial = self._get_property(window, "_NET_WM_STRUT_PARTIAL", XA_CARDINAL, 32)
            if len(partial) >= 12:
                out.append(
                    Strut(
                        left=int(partial[0]),
                        right=int(partial[1]),
                        top=int(partial[2]),
                        bottom=int(partial[3]),
                        left_start_y=int(partial[4]),
                        left_end_y=int(partial[5]),
                        right_start_y=int(partial[6]),
                        right_end_y=int(partial[7]),
                        top_start_x=int(partial[8]),
                        top_end_x=int(partial[9]),
                        bottom_start_x=int(partial[10]),
                        bottom_end_x=int(partial[11]),
                    )
                )
                continue
            basic = self._get_property(window, "_NET_WM_STRUT", XA_CARDINAL, 32)
            if len(basic) >= 4:
                sw, sh = self.screen_size()
                out.append(
                    Strut(
                        left=int(basic[0]),
                        right=int(basic[1]),
                        top=int(basic[2]),
                        bottom=int(basic[3]),
                        left_end_y=max(0, sh - 1),
                        right_end_y=max(0, sh - 1),
                        top_end_x=max(0, sw - 1),
                        bottom_end_x=max(0, sw - 1),
                    )
                )
        return out

    def workarea(self, monitor: Monitor) -> Rect:
        sw, sh = self.screen_size()
        area = monitor.rect
        net = self._get_property(self._root, "_NET_WORKAREA", XA_CARDINAL, 32)
        if len(net) >= 4:
            global_area = Rect(int(net[0]), int(net[1]), int(net[2]), int(net[3]))
            inter = monitor.rect.intersect(global_area)
            if inter and inter.w >= 64 and inter.h >= 64:
                area = inter
        strutted = apply_struts(monitor.rect, self.struts(), sw, sh)
        if strutted.w < area.w or strutted.h < area.h:
            if strutted.w >= 64 and strutted.h >= 64:
                area = strutted
        return area

    def client_list(self) -> list[int]:
        windows = self._get_property(self._root, "_NET_CLIENT_LIST", XA_WINDOW, 32)
        if not windows:
            windows = self._get_property(self._root, "_NET_CLIENT_LIST", XA_CARDINAL, 32)
        return [int(w) for w in windows if w]

    def active_window(self) -> int | None:
        values = self._get_property(self._root, "_NET_ACTIVE_WINDOW", XA_WINDOW, 32)
        if not values:
            values = self._get_property(self._root, "_NET_ACTIVE_WINDOW", XA_CARDINAL, 32)
        if not values or not values[0]:
            return None
        return int(values[0])

    def window_type_atoms(self, window: int) -> list[int]:
        return self._get_property(window, "_NET_WM_WINDOW_TYPE", XA_ATOM, 32)

    def is_skippable(self, window: int) -> bool:
        types = set(self.window_type_atoms(window))
        skip = {
            self.atom("_NET_WM_WINDOW_TYPE_DESKTOP"),
            self.atom("_NET_WM_WINDOW_TYPE_DOCK"),
            self.atom("_NET_WM_WINDOW_TYPE_SPLASH"),
            self.atom("_NET_WM_WINDOW_TYPE_NOTIFICATION"),
            self.atom("_NET_WM_WINDOW_TYPE_TOOLTIP"),
        }
        if types & skip:
            return True
        instance, class_name = self._get_wm_class(window)
        if class_name in {"ubuntu-tiling", "Ubuntu-tiling"} or instance == "ubuntu-tiling":
            return True
        return False

    def frame_extents(self, window: int) -> FrameExtents:
        gtk = self._get_property(window, "_GTK_FRAME_EXTENTS", XA_CARDINAL, 32)
        if len(gtk) >= 4:
            return FrameExtents(int(gtk[0]), int(gtk[1]), int(gtk[2]), int(gtk[3]))
        net = self._get_property(window, "_NET_FRAME_EXTENTS", XA_CARDINAL, 32)
        if len(net) >= 4:
            return FrameExtents(int(net[0]), int(net[1]), int(net[2]), int(net[3]))
        return FrameExtents()

    def window_geometry(self, window: int) -> Rect:
        attrs = XWindowAttributes()
        if not self._lib.XGetWindowAttributes(self._dpy, window, ctypes.byref(attrs)):
            return Rect(0, 0, 0, 0)
        rx = ctypes.c_int()
        ry = ctypes.c_int()
        child = ctypes.c_ulong()
        self._lib.XTranslateCoordinates(
            self._dpy, window, self._root, 0, 0, ctypes.byref(rx), ctypes.byref(ry), ctypes.byref(child)
        )
        return Rect(int(rx.value), int(ry.value), int(attrs.width), int(attrs.height))

    def _client_message(self, window: int, message: str, data: list[int], mask: int | None = None) -> None:
        event = XClientMessageEvent()
        event.type = ClientMessage
        event.serial = 0
        event.send_event = 1
        event.display = self._dpy
        event.window = window
        event.message_type = self.atom(message)
        event.format = 32
        for i in range(5):
            event.data[i] = int(data[i]) if i < len(data) else 0
        if mask is None:
            mask = SubstructureNotifyMask | SubstructureRedirectMask
        self._lib.XSendEvent(self._dpy, self._root, 0, mask, ctypes.byref(event))

    def unmaximize(self, window: int) -> None:
        self._client_message(
            window,
            "_NET_WM_STATE",
            [
                0,
                self.atom("_NET_WM_STATE_MAXIMIZED_VERT"),
                self.atom("_NET_WM_STATE_MAXIMIZED_HORZ"),
                2,
                0,
            ],
        )
        self._client_message(
            window,
            "_NET_WM_STATE",
            [
                0,
                self.atom("_NET_WM_STATE_FULLSCREEN"),
                0,
                2,
                0,
            ],
        )
        self._lib.XSync(self._dpy, 0)

    def focus(self, window: int) -> None:
        self._client_message(
            window,
            "_NET_ACTIVE_WINDOW",
            [2, CurrentTime, 0, 0, 0],
        )
        self._lib.XMapRaised(self._dpy, window)
        self._lib.XRaiseWindow(self._dpy, window)
        self._lib.XSetInputFocus(self._dpy, window, RevertToParent, CurrentTime)
        self._lib.XSync(self._dpy, 0)

    def move_resize(self, window: int, rect: Rect) -> None:
        if self.is_skippable(window):
            raise RuntimeError("refusing to snap a desktop/dock/overlay window")
        self.unmaximize(window)
        time.sleep(0.05)
        gravity_north_west = 1
        flags = gravity_north_west | 0x100 | 0x200 | 0x400 | 0x800 | (2 << 12)
        self._client_message(
            window,
            "_NET_MOVERESIZE_WINDOW",
            [flags, rect.x, rect.y, max(32, rect.w), max(32, rect.h)],
        )
        self._lib.XSync(self._dpy, 0)
        self.focus(window)

    def window_title(self, window: int) -> str:
        name = self._get_string(window, "_NET_WM_NAME")
        return name or self._get_string(window, "XA:39")

    def describe(self, window: int) -> str:
        instance, class_name = self._get_wm_class(window)
        title = self.window_title(window)
        return f"0x{window:x} {class_name or instance} {title!r}"
