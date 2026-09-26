// Runs inside the headless test shell; imported through org.gnome.Shell.Eval
// by run.py. Drives real input through Clutter virtual devices.
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

let keyboard = null;
let pointer = null;

const sleep = ms => new Promise(resolve => {
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
        resolve();
        return GLib.SOURCE_REMOVE;
    });
});

const now = () => GLib.get_monotonic_time();

const plain = r => ({x: r.x, y: r.y, width: r.width, height: r.height});

function devices() {
    if (!keyboard) {
        const seat = Clutter.get_default_backend().get_default_seat();
        keyboard = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        pointer = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
    }
}

function key(keyval, state) {
    keyboard.notify_keyval(now(), keyval, state);
}

function windowByTitle(title) {
    return global.display.list_all_windows().find(w => w.get_title() === title);
}

function workArea() {
    return global.workspace_manager.get_active_workspace().get_work_area_for_monitor(0);
}

export async function ready() {
    devices();
    Main.overview.hide();
    for (let i = 0; i < 50 && (Main.overview.visible || Main.overview.animationInProgress); i++)
        await sleep(100);
    const ext = uuid => Main.extensionManager.lookup(uuid)?.state ?? null;
    return {
        overviewVisible: Main.overview.visible,
        workArea: plain(workArea()),
        tilingAssistant: ext('tiling-assistant@ubuntu.com'),
        columns: ext('tiling-columns@samuelfrench.github.io'),
    };
}

export async function waitForWindow(title) {
    for (let i = 0; i < 100; i++) {
        const w = windowByTitle(title);
        if (w && w.get_compositor_private()?.visible)
            return true;
        await sleep(100);
    }
    return false;
}

export async function focus(title) {
    windowByTitle(title).activate(global.get_current_time());
    await sleep(300);
    return global.display.focus_window?.get_title() ?? null;
}

/** Super+<arrow> on the focused window, like a user pressing it. */
export async function superArrow(direction) {
    devices();
    const arrow = direction === 'left' ? Clutter.KEY_Left : Clutter.KEY_Right;
    key(Clutter.KEY_Super_L, Clutter.KeyState.PRESSED);
    await sleep(50);
    key(arrow, Clutter.KeyState.PRESSED);
    await sleep(50);
    key(arrow, Clutter.KeyState.RELEASED);
    await sleep(50);
    key(Clutter.KEY_Super_L, Clutter.KeyState.RELEASED);
    await sleep(1000);
}

/** Super+drag a window by its center to (x, y), then release. */
export async function superDrag(title, x, y) {
    devices();
    const r = windowByTitle(title).get_frame_rect();
    let px = r.x + Math.floor(r.width / 2);
    let py = r.y + Math.floor(r.height / 2);
    pointer.notify_absolute_motion(now(), px, py);
    await sleep(100);
    key(Clutter.KEY_Super_L, Clutter.KeyState.PRESSED);
    await sleep(50);
    pointer.notify_button(now(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.PRESSED);
    await sleep(100);
    key(Clutter.KEY_Super_L, Clutter.KeyState.RELEASED);
    const steps = 30;
    const [dx, dy] = [(x - px) / steps, (y - py) / steps];
    for (let i = 0; i < steps; i++) {
        px += dx;
        py += dy;
        pointer.notify_absolute_motion(now(), Math.round(px), Math.round(py));
        await sleep(20);
    }
    await sleep(400);
    const grabbed = global.display.is_grabbed();
    pointer.notify_button(now(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.RELEASED);
    await sleep(1000);
    return {grabbed};
}

export function state() {
    return global.display.list_all_windows()
        .filter(w => w.get_title()?.startsWith('ut-'))
        .map(w => ({
            title: w.get_title(),
            frame: plain(w.get_frame_rect()),
            tiled: w.tiledRect ? plain(w.tiledRect) : null,
        }))
        .sort((a, b) => a.title.localeCompare(b.title));
}
