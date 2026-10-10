import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import {GridController} from './gridController.js';
import {copyRect, eligibleWindows} from './grids.js';
import {sameRect} from './columns.js';

const BINDINGS = ['show-grid-picker', 'arrange-six-windows', 'arrange-eight-windows', 'undo-grid-layout'];

function label(text, styleClass, wrap = false) {
    const actor = new St.Label({text, style_class: styleClass, x_expand: true});
    actor.clutter_text.ellipsize = wrap ? Pango.EllipsizeMode.NONE : Pango.EllipsizeMode.END;
    actor.clutter_text.line_wrap = wrap;
    return actor;
}

const GridDialog = GObject.registerClass(
class GridDialog extends ModalDialog.ModalDialog {
    _init(controls, context) {
        super._init({styleClass: 'tiling-grid-dialog', shouldFadeOut: false});
        this._controls = controls;
        this._context = context;
        this._count = controls.lastCount;
        this._accepting = true;
        this.accessible_name = 'Window layouts';
        this.connect('destroy', () => this.popModal());

        this.contentLayout.add_child(label('WINDOW LAYOUTS', 'tiling-grid-eyebrow'));
        this.contentLayout.add_child(label('Make room for more', 'tiling-grid-title'));
        this.contentLayout.add_child(label('Six or eight windows, neatly on this screen.', 'tiling-grid-subtitle'));

        const selectors = new St.BoxLayout({style_class: 'tiling-grid-selectors', x_expand: true});
        this._selectors = new Map();
        for (const count of [6, 8]) {
            const button = new St.Button({
                style_class: 'tiling-grid-selector', can_focus: true, reactive: true,
                x_expand: true, label: `${count} windows  ·  ${count / 2} × 2`,
                accessible_name: `${count} windows, ${count / 2} columns and two rows`,
            });
            button.connect('clicked', () => this._selectLayout(count));
            selectors.add_child(button);
            this._selectors.set(count, button);
        }
        this.contentLayout.add_child(selectors);

        const windowName = context.focusWindow?.get_title() || 'No window selected';
        this._windowLabel = label(windowName, 'tiling-grid-window-title');
        this.contentLayout.add_child(this._windowLabel);
        this.contentLayout.add_child(label('Click a tile, or press its number, to place this window.', 'tiling-grid-instruction', true));
        this._grid = new St.BoxLayout({vertical: true, style_class: 'tiling-grid-preview'});
        this.contentLayout.add_child(this._grid);
        this._summary = label('', 'tiling-grid-summary', true);
        this.contentLayout.add_child(this._summary);

        const footer = new St.BoxLayout({style_class: 'tiling-grid-footer', x_expand: true});
        const shortcut = label('Super + Alt + Space to open', 'tiling-grid-shortcut');
        shortcut.y_align = Clutter.ActorAlign.CENTER;
        footer.add_child(shortcut);
        this._undoButton = new St.Button({
            label: 'Undo last layout', style_class: 'tiling-grid-undo',
            can_focus: true, reactive: controls.controller.canUndo,
            accessible_name: 'Undo last layout, Super Alt Z',
        });
        if (!controls.controller.canUndo)
            this._undoButton.add_style_pseudo_class('insensitive');
        this._undoButton.connect('clicked', () => this._accept(() => controls.undo()));
        footer.add_child(this._undoButton);
        this.contentLayout.add_child(footer);

        this.addButton({label: 'Cancel', key: Clutter.KEY_Escape, action: () => this.close()});
        this._arrangeButton = this.addButton({
            label: 'Arrange windows',
            action: () => this._accept(() => controls.arrange(this._count, context)),
        });
        this._arrangeButton.add_style_pseudo_class('default');
        this._selectLayout(this._count);
        this.setInitialKeyFocus(this._selectors.get(this._count));

        // Local to this modal; ordinary number keys are never global bindings.
        this.connect('key-press-event', (_actor, event) => {
            const symbol = event.get_key_symbol();
            const forbidden = Clutter.ModifierType.CONTROL_MASK | Clutter.ModifierType.MOD1_MASK | Clutter.ModifierType.SUPER_MASK;
            if (event.get_state() & forbidden)
                return Clutter.EVENT_PROPAGATE;
            const digit = symbol >= Clutter.KEY_1 && symbol <= Clutter.KEY_8
                ? symbol - Clutter.KEY_1
                : symbol >= Clutter.KEY_KP_1 && symbol <= Clutter.KEY_KP_8 ? symbol - Clutter.KEY_KP_1 : -1;
            if (digit >= 0 && digit < this._count && this._canPlace) {
                this._accept(() => controls.place(this._count, digit, context));
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
    }

    _fadeOpen() {
        super._fadeOpen();
        this._monitorConstraint.index = this._context.monitor;
    }

    _selectLayout(count) {
        this._count = count;
        this._controls.lastCount = count;
        for (const [value, button] of this._selectors) {
            if (value === count)
                button.add_style_pseudo_class('checked');
            else
                button.remove_style_pseudo_class('checked');
        }
        this._grid.destroy_all_children();
        const candidates = eligibleWindows(this._context.windows, this._context, Meta.WindowType.NORMAL);
        this._canPlace = candidates.includes(this._context.focusWindow);
        const columns = count / 2;
        for (let row = 0; row < 2; row++) {
            const rowActor = new St.BoxLayout({style_class: 'tiling-grid-row', x_expand: true});
            for (let column = 0; column < columns; column++) {
                const index = row * columns + column;
                const tile = new St.Button({
                    style_class: 'tiling-grid-cell', label: `${index + 1}`,
                    reactive: this._canPlace, can_focus: this._canPlace, x_expand: true,
                    accessible_name: `Place selected window in tile ${index + 1}, ${row === 0 ? 'top' : 'bottom'} row, column ${column + 1}`,
                });
                if (!this._canPlace)
                    tile.add_style_pseudo_class('insensitive');
                tile.connect('clicked', () => this._accept(() => this._controls.place(count, index, this._context)));
                rowActor.add_child(tile);
            }
            this._grid.add_child(rowActor);
        }
        const total = candidates.length;
        const overflow = Math.max(0, total - count);
        this._summary.text = total
            ? `Arrange ${Math.min(total, count)} ${Math.min(total, count) === 1 ? 'window' : 'windows'} on this monitor and workspace.${overflow ? ` ${overflow} less-recent ${overflow === 1 ? 'window stays' : 'windows stay'} in place.` : ''}`
            : 'No resizable windows on this monitor and workspace.';
        this._arrangeButton.reactive = total > 0;
        this._arrangeButton.can_focus = total > 0;
        if (!total)
            this._arrangeButton.add_style_pseudo_class('insensitive');
        else
            this._arrangeButton.remove_style_pseudo_class('insensitive');
    }

    _accept(action) {
        if (!this._accepting)
            return;
        this._accepting = false;
        this.close();
        action();
    }
});

/** GNOME adapters and native, keyboard-accessible controls. */
export class GridControls {
    constructor(extension, {Twm, Rect, Settings, originalTile}) {
        this._extension = extension;
        this._destroyed = false;
        this._waiters = new Map();
        this._registeredBindings = [];
        this.lastCount = 6;

        const alive = window => Boolean(window && global.get_window_actors().some(actor => actor.meta_window === window));
        const windows = workspace => global.display.get_tab_list(Meta.TabList.NORMAL_ALL, workspace);
        const contextCurrent = context => context.workspace === global.workspace_manager.get_active_workspace() &&
            context.monitor >= 0 && context.monitor < global.display.get_n_monitors() &&
            ['x', 'y', 'width', 'height'].every(key => context.workspace.get_work_area_for_monitor(context.monitor)[key] === context.workArea[key]);
        this.controller = new GridController({
            normalType: Meta.WindowType.NORMAL,
            getContext: () => {
                const workspace = global.workspace_manager.get_active_workspace();
                const focusWindow = global.display.focus_window;
                const monitor = focusWindow && focusWindow.get_monitor() >= 0
                    ? focusWindow.get_monitor() : global.display.get_current_monitor();
                return {workspace, focusWindow, monitor, workArea: workspace.get_work_area_for_monitor(monitor), windows: windows(workspace)};
            },
            getWindows: context => windows(context.workspace),
            isContextCurrent: contextCurrent,
            isAlive: alive,
            snapshot: window => ({
                frame: copyRect(window.get_frame_rect()),
                monitor: window.get_monitor(), workspace: window.get_workspace(),
                isTiled: Boolean(window.isTiled), tiledRect: copyRect(window.tiledRect),
                untiledRect: copyRect(window.untiledRect), maximized: window.get_maximized(),
                fullscreen: window.is_fullscreen(), above: window.is_above(),
                tileGroup: Twm.getTileGroupFor(window),
            }),
            tile: async (window, rect, monitorNr, state, cancelled) => {
                if (state.maximized || state.fullscreen) {
                    window.unmake_fullscreen();
                    if (window.get_maximized())
                        window.unmaximize(window.get_maximized());
                    // Wayland clients commit the restored frame asynchronously.
                    // TA's untiledRect may also predate a later native maximize.
                    let previous = null;
                    let restored = false;
                    for (let i = 0; i < 25 && alive(window) && !cancelled(); i++) {
                        if (!await this._wait(20))
                            return;
                        const frame = copyRect(window.get_frame_rect());
                        if (!sameRect(frame, state.frame) && sameRect(frame, previous)) {
                            restored = true;
                            break;
                        }
                        previous = frame;
                    }
                    if (cancelled() || !alive(window))
                        return;
                    if (!restored)
                        throw new Error('A window did not finish leaving maximize or fullscreen. Try again when it is responsive.');
                    state.restoreFrame = copyRect(window.get_frame_rect());
                }
                if (!cancelled())
                    await originalTile(window, new Rect(rect), {openTilingPopup: false, monitorNr});
            },
            settle: () => this._wait(160),
            cancelSettle: () => {
                for (const [source, resolve] of this._waiters) {
                    GLib.Source.remove(source);
                    resolve(false);
                }
                this._waiters.clear();
            },
            restore: async (window, state, cancelled) => {
                Twm.clearTilingProps(window.get_id());
                window.unmake_fullscreen();
                const maximized = window.get_maximized();
                if (maximized)
                    window.unmaximize(maximized);
                if (window.override_constraints)
                    window.override_constraints(...Array(4).fill(Meta.WindowConstraint.NONE));
                if (state.workspace && window.get_workspace() !== state.workspace)
                    window.change_workspace(state.workspace);
                if (state.monitor < global.display.get_n_monitors())
                    window.move_to_monitor(state.monitor);
                const frame = state.restoreFrame || state.frame;
                if (state.tiledRect) {
                    // Use TA's own path to restore constraints and the special
                    // hooks for maximized-with-gaps, as well as regular tiles.
                    await originalTile(window, new Rect(state.tiledRect), {
                        openTilingPopup: false, monitorNr: state.monitor, skipAnim: true,
                    });
                } else {
                    const {x, y, width, height} = frame;
                    window.move_frame(true, x, y);
                    window.move_resize_frame(true, x, y, width, height);
                }
                if (cancelled() || !alive(window))
                    return;
                if (state.maximized || state.fullscreen) {
                    // Native maximize saves the current committed frame. Doing
                    // this immediately would save the old grid-cell rectangle.
                    // restoreFrame is the actual client frame, including gaps
                    // and terminal character increments; tiledRect is logical.
                    if (!await this._frameCommit(window, frame, alive, cancelled))
                        return;
                }
                window.isTiled = state.isTiled;
                window.tiledRect = state.tiledRect ? new Rect(state.tiledRect) : null;
                window.untiledRect = state.untiledRect ? new Rect(state.untiledRect) : null;
                if (state.maximized)
                    window.maximize(state.maximized);
                if (state.fullscreen)
                    window.make_fullscreen();
                if (state.above)
                    window.make_above();
                else
                    window.unmake_above();
            },
            finishRestore: snapshots => {
                for (const {window, state} of snapshots) {
                    if (alive(window) && state.isTiled) {
                        const group = state.tileGroup.filter(member => alive(member) && member.isTiled);
                        Twm.updateTileGroup(group.length ? group : [window]);
                    }
                }
            },
            finishArrange: selected => {
                if (!Settings.getBoolean(Settings.DISABLE_TILE_GROUPS)) {
                    const group = selected.filter(window => alive(window) && window.isTiled);
                    // Remove reciprocal references in retained overflow groups
                    // before assigning the chosen windows to one fresh group.
                    for (const window of group)
                        Twm.clearTilingProps(window.get_id());
                    Twm.updateTileGroup(group);
                }
            },
            focus: (window, context) => {
                if (alive(window) && global.workspace_manager.get_active_workspace() === context.workspace)
                    window.activate(global.get_current_time());
            },
            reportError: message => Main.notify('Window layouts', message),
        });

        try {
            this._panel = new PanelMenu.Button(0.0, 'Window layouts', true);
            this._panel.accessible_name = 'Window layouts — six or eight windows';
            this._panel.add_child(new St.Icon({icon_name: 'view-grid-symbolic', style_class: 'system-status-icon'}));
            this._panel.connect('button-press-event', () => {
                this.openPicker();
                return Clutter.EVENT_STOP;
            });
            this._panel.connect('key-press-event', (_actor, event) => {
                if ([Clutter.KEY_Return, Clutter.KEY_KP_Enter, Clutter.KEY_space].includes(event.get_key_symbol())) {
                    this.openPicker();
                    return Clutter.EVENT_STOP;
                }
                return Clutter.EVENT_PROPAGATE;
            });
            Main.panel.addToStatusArea('tiling-columns-grid', this._panel);
            const actions = [() => this.openPicker(), () => this.arrange(6), () => this.arrange(8), () => this.undo()];
            const settings = extension.getSettings();
            BINDINGS.forEach((name, index) => {
                Main.wm.addKeybinding(name, settings, Meta.KeyBindingFlags.IGNORE_AUTOREPEAT, Shell.ActionMode.NORMAL, actions[index]);
                this._registeredBindings.push(name);
            });
        } catch (error) {
            this.destroy();
            throw error;
        }
    }

    _wait(milliseconds) {
        if (this._destroyed)
            return Promise.resolve(false);
        return new Promise(resolve => {
            const source = GLib.timeout_add(GLib.PRIORITY_DEFAULT, milliseconds, () => {
                this._waiters.delete(source);
                resolve(true);
                return GLib.SOURCE_REMOVE;
            });
            this._waiters.set(source, resolve);
        });
    }

    async _frameCommit(window, target, alive, cancelled) {
        for (let i = 0; i < 40 && alive(window) && !cancelled(); i++) {
            const frame = window.get_frame_rect();
            if (['x', 'y', 'width', 'height'].every(key => Math.abs(frame[key] - target[key]) <= 2))
                return true;
            if (!await this._wait(20))
                return false;
        }
        if (cancelled() || !alive(window))
            return false;
        throw new Error('A window did not finish restoring its original size.');
    }

    openPicker() {
        if (this._destroyed || this.controller.busy)
            return;
        if (this._dialog) {
            this._dialog.close();
            return;
        }
        const context = this.controller.captureContext();
        const dialog = new GridDialog(this, context);
        this._dialog = dialog;
        dialog.connect('destroy', () => {
            if (this._dialog === dialog)
                this._dialog = null;
        });
        if (!dialog.open()) {
            dialog.destroy();
            Main.notify('Window layouts', 'Close the current system dialog and try again.');
        }
    }

    async arrange(count, context) {
        this.lastCount = count;
        const result = await this.controller.arrange(count, context);
        if (result.ok && !this._destroyed) {
            const extra = result.overflow ? ` ${result.overflow} less-recent ${result.overflow === 1 ? 'window was' : 'windows were'} left in place.` : '';
            Main.notify('Window layouts', `Arranged ${result.moved} ${result.moved === 1 ? 'window' : 'windows'}.${extra} Super+Alt+Z to undo.`);
        }
        return result;
    }

    async place(count, cell, context) {
        return this.controller.place(count, cell, context);
    }

    async undo() {
        const result = await this.controller.undo();
        if (!this._destroyed && result.reason === 'empty')
            Main.notify('Window layouts', 'No layout to undo yet.');
        return result;
    }

    destroy() {
        this._destroyed = true;
        this._dialog?.close();
        this._dialog?.destroy();
        this._dialog = null;
        this.controller?.destroy();
        for (const name of this._registeredBindings)
            Main.wm.removeKeybinding(name);
        this._registeredBindings = [];
        this._panel?.destroy();
        this._panel = null;
    }
}
