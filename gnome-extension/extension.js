import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const IFACE = `
<node>
  <interface name="org.github.samuelfrench.UbuntuTiling">
    <method name="MoveResize">
      <arg type="i" name="x" direction="in"/>
      <arg type="i" name="y" direction="in"/>
      <arg type="i" name="w" direction="in"/>
      <arg type="i" name="h" direction="in"/>
    </method>
    <method name="MoveResizeWindow">
      <arg type="u" name="xid" direction="in"/>
      <arg type="i" name="x" direction="in"/>
      <arg type="i" name="y" direction="in"/>
      <arg type="i" name="w" direction="in"/>
      <arg type="i" name="h" direction="in"/>
    </method>
    <method name="GetFocusXid">
      <arg type="u" name="xid" direction="out"/>
    </method>
  </interface>
</node>`;

export default class UbuntuTilingExtension extends Extension {
    enable() {
        this._dbus = Gio.DBusExportedObject.wrapJSObject(IFACE, this);
        this._dbus.export(Gio.DBus.session, '/org/github/samuelfrench/UbuntuTiling');
        this._owner = Gio.DBus.session.own_name(
            'org.github.samuelfrench.UbuntuTiling',
            Gio.BusNameOwnerFlags.NONE,
            null,
            null,
        );
    }

    disable() {
        if (this._owner) {
            Gio.DBus.session.unown_name(this._owner);
            this._owner = null;
        }
        if (this._dbus) {
            this._dbus.flush();
            this._dbus.unexport();
            this._dbus = null;
        }
    }

    _focused() {
        return global.display.focus_window;
    }

    _place(win, x, y, w, h) {
        if (!win) {
            return;
        }
        win.unmaximize(Meta.MaximizeFlags.BOTH);
        win.unminimize();
        win.move_resize_frame(true, x, y, w, h);
        win.activate(global.get_current_time());
    }

    MoveResize(x, y, w, h) {
        this._place(this._focused(), x, y, w, h);
    }

    MoveResizeWindow(xid, x, y, w, h) {
        const actors = global.get_window_actors();
        for (const actor of actors) {
            const win = actor.meta_window;
            if (win.get_xwindow && win.get_xwindow() === xid) {
                this._place(win, x, y, w, h);
                return;
            }
        }
        this.MoveResize(x, y, w, h);
    }

    GetFocusXid() {
        const win = this._focused();
        if (!win || !win.get_xwindow) {
            return 0;
        }
        return win.get_xwindow();
    }
}
