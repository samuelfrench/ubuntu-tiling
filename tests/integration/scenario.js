// Runs inside the headless test shell; imported through org.gnome.Shell.Eval
// by run.py. Drives real input through Clutter virtual devices.
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
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

const TILING_ASSISTANT = 'tiling-assistant@ubuntu.com';
const COLUMNS = 'tiling-columns@samuelfrench.github.io';
const SETTLED = [1, 3, 4]; // ExtensionState ACTIVE, ERROR, OUT_OF_DATE (GNOME 46)

/**
 * Waits until startup is over (extensions loaded, panel struts applied), hides
 * the startup overview, and waits for its modal grab to go away. Keybindings
 * registered for ActionMode.NORMAL don't fire before that.
 */
export async function ready() {
    devices();
    const ext = uuid => Main.extensionManager.lookup(uuid);
    for (let i = 0; i < 150 && Main.layoutManager._startingUp; i++)
        await sleep(100);
    for (let i = 0; i < 100 && !SETTLED.includes(ext(TILING_ASSISTANT)?.state); i++)
        await sleep(100);
    for (let i = 0; i < 100 && ext(COLUMNS) && !SETTLED.includes(ext(COLUMNS).state); i++)
        await sleep(100);
    for (let i = 0; i < 100 && ext(COLUMNS)?.state === 1 && !ext(COLUMNS)?.stateObj?._gridControls; i++)
        await sleep(100);
    Main.overview.hide();
    for (let i = 0; i < 100 && Main.actionMode !== Shell.ActionMode.NORMAL; i++)
        await sleep(100);
    return {
        startingUp: Main.layoutManager._startingUp,
        actionMode: Main.actionMode,
        workArea: plain(workArea()),
        tilingAssistant: ext(TILING_ASSISTANT)?.state ?? null,
        columns: ext(COLUMNS)?.state ?? null,
        gridControls: Boolean(ext(COLUMNS)?.stateObj?._gridControls),
        errors: {
            tilingAssistant: `${ext(TILING_ASSISTANT)?.error ?? ''}`,
            columns: `${ext(COLUMNS)?.error ?? ''}`,
        },
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

/** Closes a modal (e.g. Tiling Assistant's Tiling Popup) with Escape. Returns how many were open. */
export async function dismissModal() {
    devices();
    const open = Main.modalCount;
    if (open) {
        key(Clutter.KEY_Escape, Clutter.KeyState.PRESSED);
        await sleep(50);
        key(Clutter.KEY_Escape, Clutter.KeyState.RELEASED);
        await sleep(500);
    }
    return open;
}

/**
 * Real keyboard input for the public grid controls, local to this compositor.
 * `shortcut` holds Super+Alt; `shift` also holds Shift_L, so `gridKey('2', true, true)`
 * is Super+Alt+Shift+2. Mutter matches bindings by keycode and modifiers, and
 * the virtual keyboard sends KEY_2 at level 0 without touching Shift.
 */
export async function gridKey(value, shortcut = true, shift = false) {
    devices();
    const symbol = value === 'Space' ? Clutter.KEY_space :
        value === 'Escape' ? Clutter.KEY_Escape : Clutter[`KEY_${value}`];
    if (symbol === undefined)
        throw new Error(`Unknown key ${value}`);
    const modifiers = [
        ...(shortcut ? [Clutter.KEY_Super_L, Clutter.KEY_Alt_L] : []),
        ...(shift ? [Clutter.KEY_Shift_L] : []),
    ];
    for (const modifier of modifiers)
        key(modifier, Clutter.KeyState.PRESSED);
    if (modifiers.length)
        await sleep(50);
    key(symbol, Clutter.KeyState.PRESSED);
    await sleep(50);
    key(symbol, Clutter.KeyState.RELEASED);
    for (const modifier of modifiers.reverse())
        key(modifier, Clutter.KeyState.RELEASED);
    await sleep(700);
    return gridStatus();
}

const gridControls = () => Main.extensionManager.lookup(COLUMNS)?.stateObj?._gridControls;

function pickerChips(dialog) {
    if (!dialog._allChip)
        return null;
    return [
        {id: null, label: dialog._allChip.label, checked: dialog._allChip.checked},
        ...[...dialog._chips.values()].map(chip => ({
            id: chip.id, label: chip.button.label, count: chip.count, checked: chip.button.checked,
        })),
    ];
}

export function gridStatus() {
    const controls = Main.extensionManager.lookup(COLUMNS)?.stateObj?._gridControls;
    const dialog = controls?._dialog;
    return {
        controls: Boolean(controls), busy: controls?.controller.busy ?? false,
        canUndo: controls?.controller.canUndo ?? false,
        panel: Boolean(Main.panel.statusArea['tiling-columns-grid']),
        modalCount: Main.modalCount,
        dialog: dialog ? {
            count: dialog._count,
            cells: dialog._grid.get_children().flatMap(row => row.get_children().map(cell => cell.label)),
            title: dialog._windowLabel.text,
            rows: dialog._grid.get_children().map(row => row.get_n_children()),
            selected: dialog._selected ? [...dialog._selected] : null,
            chips: pickerChips(dialog),
            fit: dialog._selectors?.get('all')?.label ?? null,
            summary: dialog._summary?.text ?? null,
            arrangeReactive: dialog._arrangeButton?.reactive ?? null,
        } : null,
    };
}

export async function panelClick() {
    devices();
    const panel = Main.panel.statusArea['tiling-columns-grid'];
    const [x, y] = panel.get_transformed_position();
    const [width, height] = panel.get_transformed_size();
    pointer.notify_absolute_motion(now(), Math.round(x + width / 2), Math.round(y + height / 2));
    await sleep(100);
    pointer.notify_button(now(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.PRESSED);
    await sleep(50);
    pointer.notify_button(now(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.RELEASED);
    await sleep(300);
    return gridStatus();
}

export async function windowAction(title, action) {
    const window = windowByTitle(title);
    if (action === 'maximize') window.maximize(Meta.MaximizeFlags.BOTH);
    else if (action === 'unmaximize') window.unmaximize(Meta.MaximizeFlags.BOTH);
    else if (action === 'fullscreen') window.make_fullscreen();
    else if (action === 'unfullscreen') window.unmake_fullscreen();
    else if (action === 'minimize') window.minimize();
    else if (action === 'close') window.delete(global.get_current_time());
    else if (action === 'other-workspace') {
        if (global.workspace_manager.n_workspaces < 2)
            global.workspace_manager.append_new_workspace(false, global.get_current_time());
        window.change_workspace_by_index(1, false);
    } else throw new Error(`Unknown window action ${action}`);
    await sleep(500);
    return state();
}

/** Waits up to a second for a pending relayout, so transformed bounds are current. */
async function allocated(actor) {
    for (let i = 0; i < 20 && !actor.has_allocation(); i++)
        await sleep(50);
}

/**
 * Captures the dialog's area on the stage. `clipped` is true when part of the
 * dialog lies outside the stage (only the visible part is captured).
 */
export async function pickerScreenshot(path) {
    const dialog = Main.extensionManager.lookup(COLUMNS)?.stateObj?._gridControls?._dialog;
    if (!dialog)
        throw new Error('Picker is not open');
    const actor = dialog.dialogLayout;
    await allocated(actor);
    const [x, y] = actor.get_transformed_position();
    const [width, height] = actor.get_transformed_size();
    const area = [Math.floor(x), Math.floor(y), Math.ceil(width), Math.ceil(height)];
    const left = Math.max(0, area[0]);
    const top = Math.max(0, area[1]);
    const right = Math.min(global.stage.width, area[0] + area[2]);
    const bottom = Math.min(global.stage.height, area[1] + area[3]);
    const clipped = left !== area[0] || top !== area[1] || right - left !== area[2] || bottom - top !== area[3];
    const stream = Gio.File.new_for_path(path).replace(null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    await new Shell.Screenshot().screenshot_area(left, top, right - left, bottom - top, stream);
    stream.close(null);
    return {path, x, y, width, height, clipped};
}

/**
 * Clicks a picker actor with the real pointer when it is the reactive actor at
 * its own center. If something else is on top (a notification banner) or the
 * center is off the stage, emits `clicked` instead and says so; an insensitive
 * or missing actor is not clicked at all.
 */
async function clickActor(actor, what) {
    devices();
    if (!actor)
        return {method: 'none', reason: `no ${what}`};
    if (!actor.reactive)
        return {method: 'none', reason: `${what} is insensitive`};
    await allocated(actor);
    const [x, y] = actor.get_transformed_position();
    const [width, height] = actor.get_transformed_size();
    const cx = Math.round(x + width / 2);
    const cy = Math.round(y + height / 2);
    const onStage = cx >= 0 && cy >= 0 && cx < global.stage.width && cy < global.stage.height;
    const picked = onStage ? global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, cx, cy) : null;
    const reachable = actor.mapped && Boolean(picked) && (picked === actor || actor.contains(picked));
    const click = {
        method: reachable ? 'pointer' : 'emit', what, x: cx, y: cy, bounds: {x, y, width, height},
        picked: picked ? picked.constructor.$gtype?.name ?? `${picked}` : null,
    };
    if (reachable) {
        pointer.notify_absolute_motion(now(), cx, cy);
        await sleep(100);
        pointer.notify_button(now(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.PRESSED);
        await sleep(50);
        pointer.notify_button(now(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.RELEASED);
    } else {
        actor.emit('clicked', 1);
    }
    await sleep(200);
    return click;
}

/**
 * Selects a layout selector by count or 'all'. Without `byPointer` it emits
 * `clicked` (the original v2 path); with it, it clicks like a user and also
 * returns `click`.
 */
export async function pickerLayout(count, byPointer = false) {
    const dialog = Main.extensionManager.lookup(COLUMNS)?.stateObj?._gridControls?._dialog;
    if (byPointer) {
        const click = await clickActor(dialog?._selectors?.get(count) ?? null, `layout ${count}`);
        return {...gridStatus(), click};
    }
    dialog._selectors.get(count).emit('clicked', 1);
    await sleep(150);
    return gridStatus();
}

/** Clicks a program chip by group id (`terminals`, `app:…`), chip text, or `All windows`. */
export async function pickerChip(idOrLabel) {
    const dialog = gridControls()?._dialog;
    let actor = null;
    if (dialog?._chips) {
        const chip = dialog._chips.get(idOrLabel) ??
            [...dialog._chips.values()].find(candidate => candidate.text === idOrLabel);
        actor = chip?.button ?? (dialog._allChip?.label === idOrLabel ? dialog._allChip : null);
    }
    const click = await clickActor(actor, `chip ${idOrLabel}`);
    return {...gridStatus(), click};
}

/** Clicks a dialog button by label (`Arrange windows`, `Cancel`) and waits for the layout to finish. */
export async function pickerButton(label) {
    const dialog = gridControls()?._dialog;
    const actor = dialog?.buttonLayout?.get_children().find(button => button.label === label) ?? null;
    const click = await clickActor(actor, `button ${label}`);
    return {...await waitIdle(), click};
}

/** Waits until no arrangement or undo is running, then lets frames settle. */
export async function waitIdle() {
    for (let i = 0; i < 100 && gridControls()?.controller.busy; i++)
        await sleep(100);
    await sleep(300);
    return gridStatus();
}

/** Re-enables tiling-columns and waits for its grid controls (the imports are async). */
export async function enableColumns() {
    Main.extensionManager.enableExtension(COLUMNS);
    for (let i = 0; i < 50 && !gridControls(); i++)
        await sleep(100);
    await sleep(200);
    return {state: Main.extensionManager.lookup(COLUMNS)?.state ?? null, ...gridStatus()};
}

/** What Mutter and Shell.WindowTracker report for a window's program identity. */
export async function appIdentity(title) {
    const window = windowByTitle(title);
    if (!window)
        return {title, missing: true};
    const tracker = Shell.WindowTracker.get_default();
    for (let i = 0; i < 10 && !tracker.get_window_app(window)?.get_app_info(); i++)
        await sleep(100);
    const app = tracker.get_window_app(window);
    const info = app?.get_app_info() ?? null;
    return {
        title, wmClass: window.get_wm_class(), wmClassInstance: window.get_wm_class_instance(),
        sandboxedAppId: window.get_sandboxed_app_id(),
        appId: app?.get_id() ?? null, appName: app?.get_name() ?? null,
        hasAppInfo: Boolean(info), categories: info?.get_categories?.() ?? null,
    };
}

/** A fresh Gio.Settings for the extension schema, independent of the controls' instance. */
function columnsSettings() {
    return Main.extensionManager.lookup(COLUMNS).stateObj.getSettings();
}

/** The persisted program-type filter (`window-filter`). */
export function windowFilter() {
    return columnsSettings().get_strv('window-filter');
}

export function setWindowFilter(selected) {
    const settings = columnsSettings();
    settings.set_strv('window-filter', selected);
    Gio.Settings.sync();
    return settings.get_strv('window-filter');
}

async function tilingModules() {
    const base = Main.extensionManager.lookup(TILING_ASSISTANT).dir.get_uri();
    const [manager, utility, common] = await Promise.all([
        import(`${base}/src/extension/tilingWindowManager.js`),
        import(`${base}/src/extension/utility.js`),
        import(`${base}/src/common.js`),
    ]);
    return {Twm: manager.TilingWindowManager, Rect: utility.Rect, Settings: common.Settings};
}

export async function cornerSetup() {
    const {Twm, Rect, Settings} = await tilingModules();
    // Make A/B recent independently of C/D. Stock group raising otherwise
    // marks the entire old group recent, which correctly changes the MRU cap.
    Settings.getGioObject().set_boolean('enable-raise-tile-group', false);
    for (const window of global.display.list_all_windows()) {
        if (/^ut-[E-I]|^ut-K$/.test(window.get_title() || ''))
            window.minimize();
    }
    const area = workArea();
    for (let index = 0; index < 4; index++) {
        await Twm.tile(windowByTitle(`ut-${String.fromCharCode(65 + index)}`), new Rect({
            x: area.x + index % 2 * area.width / 2,
            y: area.y + Math.floor(index / 2) * area.height / 2,
            width: area.width / 2, height: area.height / 2,
        }), {openTilingPopup: false});
    }
    await sleep(300);
    return state();
}

export async function tileGroups(titles) {
    const {Twm} = await tilingModules();
    return Object.fromEntries(titles.map(title => [title,
        Twm.getTileGroupFor(windowByTitle(title)).map(window => window.get_title()).sort(),
    ]));
}

export async function gappedMaximize(title) {
    const {Twm, Rect, Settings} = await tilingModules();
    const settings = Settings.getGioObject();
    settings.set_boolean('maximize-with-gap', true);
    settings.set_int('single-screen-gap', 12);
    await Twm.tile(windowByTitle(title), new Rect(workArea()), {openTilingPopup: false});
    await sleep(250);
    return state();
}

export async function tilingSignalState(title) {
    const {Twm} = await tilingModules();
    const window = windowByTitle(title);
    const signals = Twm._signals.getSignalsFor(window.get_id());
    return Object.fromEntries(['WS_CHANGED', 'UNMANAGING'].map(name => {
        const id = signals.get(name);
        return [name, Boolean(id && GObject.signal_handler_is_connected(window, id))];
    }));
}

export async function gapReset() {
    const {Settings} = await tilingModules();
    Settings.getGioObject().set_boolean('maximize-with-gap', false);
    Settings.getGioObject().set_int('single-screen-gap', 0);
}

export async function cancelDuringNativePreparation(title) {
    await focus(title);
    const controls = Main.extensionManager.lookup(COLUMNS).stateObj._gridControls;
    const operation = controls.controller.place(6, 0);
    Main.extensionManager.disableExtension(COLUMNS);
    const result = await operation;
    await sleep(250);
    const before = state();
    await sleep(250);
    return {result, waiters: controls._waiters.size, status: gridStatus(), before, after: state()};
}

/**
 * Focus and stacking for the visible ut- windows on the active workspace:
 * `windows` runs from the topmost window down, in Mutter's stacking order.
 */
export function stacking() {
    const workspace = global.workspace_manager.get_active_workspace();
    const visible = global.display.list_all_windows().filter(w => w.get_title()?.startsWith('ut-') &&
        !w.minimized && w.located_on_workspace(workspace));
    return {
        focus: global.display.focus_window?.get_title() ?? null,
        windows: global.display.sort_windows_by_stacking(visible).reverse()
            .map(w => ({title: w.get_title(), frame: plain(w.get_frame_rect())})),
    };
}

export function state() {
    return global.display.list_all_windows()
        .filter(w => w.get_title()?.startsWith('ut-'))
        .map(w => ({
            title: w.get_title(),
            frame: plain(w.get_frame_rect()),
            tiled: w.tiledRect ? plain(w.tiledRect) : null,
            maximized: w.get_maximized(), fullscreen: w.is_fullscreen(),
            minimized: w.minimized, workspace: w.get_workspace()?.index() ?? -1,
        }))
        .sort((a, b) => a.title.localeCompare(b.title));
}
