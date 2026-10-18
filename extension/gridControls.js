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
import {FIT, LAYOUTS, MAX_WINDOWS, copyRect, eligibleWindows, gridShape} from './grids.js';
import {TERMINALS, classifyWindow, defaultLabel, describeFilter, summarizeGroups, toggleGroup, windowMatcher} from './windowGroups.js';
import {sameRect} from './columns.js';

const LAYOUT_BINDINGS = [
    [FIT, 'arrange-all-windows'], [4, 'arrange-four-windows'], [6, 'arrange-six-windows'],
    [8, 'arrange-eight-windows'], [9, 'arrange-nine-windows'], [10, 'arrange-ten-windows'],
    [12, 'arrange-twelve-windows'], [16, 'arrange-sixteen-windows'],
];
const FILTER_KEY = 'window-filter';
const FIT_INSTRUCTION = 'All sizes the grid to the matching windows. Pick a numbered layout to place one window.';

function label(text, styleClass, wrap = false) {
    const actor = new St.Label({text, style_class: styleClass, x_expand: true});
    actor.clutter_text.ellipsize = wrap ? Pango.EllipsizeMode.NONE : Pango.EllipsizeMode.END;
    actor.clutter_text.line_wrap = wrap;
    return actor;
}

function section(...children) {
    const box = new St.BoxLayout({vertical: true, style_class: 'tiling-grid-section', x_expand: true});
    for (const child of children)
        box.add_child(child);
    return box;
}

function plural(count, word) {
    return `${count} ${count === 1 ? word : `${word}s`}`;
}

function setSensitive(button, sensitive) {
    button.reactive = sensitive;
    button.can_focus = sensitive;
    if (sensitive)
        button.remove_style_pseudo_class('insensitive');
    else
        button.add_style_pseudo_class('insensitive');
}

/** `3×2` for uniform rows; `6+5` when the last rows hold one window fewer. */
function shapeText(rows) {
    return rows.every(columns => columns === rows[0]) ? `${rows[0]}×${rows.length}` : rows.join('+');
}

function shapeName(rows) {
    return rows.every(columns => columns === rows[0])
        ? `${plural(rows[0], 'column')} and ${plural(rows.length, 'row')}`
        : `rows of ${rows.join(', ')}`;
}

/** Windows per row; none when nothing matches the All layout or the work area is unusable. */
function layoutShape(layout, matching, workArea) {
    const count = layout === FIT ? Math.min(matching, MAX_WINDOWS) : layout;
    if (!count)
        return [];
    try {
        return gridShape(count, workArea, {ragged: layout === FIT});
    } catch {
        return [];
    }
}

/** Program type of a window. Never throws, so chip counts and matching agree. */
function groupFor(window) {
    try {
        const app = Shell.WindowTracker.get_default().get_window_app(window);
        const info = app?.get_app_info() ?? null;
        return classifyWindow({
            appId: app?.get_id() ?? null,
            appName: app?.get_name() ?? null,
            hasAppInfo: Boolean(info),
            categories: info?.get_categories()?.split(';') ?? [],
            wmClass: window.get_wm_class(),
        });
    } catch {
        return {id: 'other', label: 'Other'};
    }
}

/**
 * Label for a saved group id. Ids without an installed desktop file take the
 * label of a live window in that group on the active workspace, the same text
 * its chip shows (GNOME names a window-backed app by its WM class as-is).
 */
function labelFor(id) {
    if (id === TERMINALS)
        return defaultLabel(id);
    const name = id.startsWith('app:') ? Shell.AppSystem.get_default().lookup_app(id.slice(4))?.get_name() : null;
    if (name)
        return name;
    const workspace = global.workspace_manager.get_active_workspace();
    for (const window of global.display.get_tab_list(Meta.TabList.NORMAL_ALL, workspace)) {
        const group = groupFor(window);
        if (group.id === id)
            return group.label;
    }
    return defaultLabel(id);
}

const GridDialog = GObject.registerClass(
class GridDialog extends ModalDialog.ModalDialog {
    _init(controls, context) {
        super._init({styleClass: 'tiling-grid-dialog', shouldFadeOut: false});
        this._controls = controls;
        this._context = context;
        this._count = controls.lastCount;
        this._selected = controls.filter;
        this._accepting = true;
        this.accessible_name = 'Window layouts';
        this.connect('destroy', () => this.popModal());

        this.contentLayout.add_child(label('WINDOW LAYOUTS', 'tiling-grid-eyebrow'));
        this.contentLayout.add_child(label('Make room for more', 'tiling-grid-title'));
        this.contentLayout.add_child(label('Pick which programs and how many windows.', 'tiling-grid-subtitle'));

        // Chips are created once and then only relabelled, so toggling one
        // never moves key focus or reflows the row under the pointer.
        this._chipBox = new St.Widget({
            style_class: 'tiling-grid-chips', x_expand: true,
            // Natural chip widths, wrapped at the stylesheet's max-width.
            layout_manager: new Clutter.FlowLayout({
                orientation: Clutter.Orientation.HORIZONTAL, column_spacing: 6, row_spacing: 6,
                snap_to_grid: false,
            }),
        });
        this._chips = new Map();
        this._allChip = this._addChip(() => this._setFilter([]));
        this._allChip.label = 'All windows';
        this._allChip.accessible_name = 'All windows';
        this.contentLayout.add_child(section(
            label('PROGRAMS', 'tiling-grid-eyebrow'), this._chipBox,
            label('Your choice also applies to the Super+Alt shortcuts.', 'tiling-grid-hint', true)));

        const selectors = new St.BoxLayout({vertical: true, style_class: 'tiling-grid-selectors', x_expand: true});
        this._selectors = new Map();
        const layouts = [FIT, ...LAYOUTS];
        for (let start = 0; start < layouts.length; start += 4) {
            const row = new St.BoxLayout({style_class: 'tiling-grid-selector-row', x_expand: true});
            row.layout_manager.homogeneous = true;
            for (const layout of layouts.slice(start, start + 4)) {
                const button = new St.Button({style_class: 'tiling-grid-selector', can_focus: true, reactive: true, x_expand: true});
                if (layout !== FIT) {
                    const shape = layoutShape(layout, 0, context.workArea);
                    button.label = shape.length ? `${layout} · ${shapeText(shape)}` : `${layout}`;
                    button.accessible_name = shape.length ? `${layout} windows, ${shapeName(shape)}` : `${layout} windows`;
                }
                button.connect('clicked', () => this._selectLayout(layout));
                row.add_child(button);
                this._selectors.set(layout, button);
            }
            selectors.add_child(row);
        }
        this.contentLayout.add_child(section(label('LAYOUT', 'tiling-grid-eyebrow'), selectors));

        const windowName = context.focusWindow?.get_title() || 'No window selected';
        this._windowLabel = label(windowName, 'tiling-grid-window-title');
        this._instruction = label('', 'tiling-grid-instruction', true);
        this._grid = new St.BoxLayout({vertical: true, style_class: 'tiling-grid-preview'});
        this.contentLayout.add_child(section(this._windowLabel, this._instruction, this._grid));
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
            action: () => this._accept(() => {
                // The only place the filter is saved; Cancel and chip toggles never write it.
                controls.filter = this._selected;
                controls.arrange(this._count, context, this._selected);
            }),
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
            const digit = symbol >= Clutter.KEY_1 && symbol <= Clutter.KEY_9
                ? symbol - Clutter.KEY_1
                : symbol >= Clutter.KEY_KP_1 && symbol <= Clutter.KEY_KP_9 ? symbol - Clutter.KEY_KP_1 : -1;
            // _canPlace is false for the All layout, so _count is a number here.
            if (digit >= 0 && this._canPlace && digit < this._count) {
                const count = this._count;
                this._accept(() => controls.place(count, digit, context));
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
    }

    _fadeOpen() {
        super._fadeOpen();
        this._monitorConstraint.index = this._context.monitor;
    }

    _addChip(onClicked) {
        const chip = new St.Button({style_class: 'tiling-grid-chip', toggle_mode: true, can_focus: true, reactive: true});
        chip.connect('clicked', onClicked);
        this._chipBox.add_child(chip);
        return chip;
    }

    _setFilter(selected) {
        this._selected = selected;
        this._render();
    }

    _selectLayout(layout) {
        this._count = layout;
        this._controls.lastCount = layout;
        this._render();
    }

    _render() {
        const {workArea, focusWindow} = this._context;
        const eligible = eligibleWindows(this._context.windows, this._context, Meta.WindowType.NORMAL);
        const matching = eligible.filter(windowMatcher(this._selected, groupFor)).length;
        const filterLabel = describeFilter(this._selected, labelFor);

        // A deselected group without windows keeps its chip, at count 0,
        // until the picker closes so it can be selected again.
        for (const chip of this._chips.values())
            chip.count = 0;
        for (const group of summarizeGroups(eligible, groupFor, this._selected, labelFor)) {
            if (!this._chips.has(group.id)) {
                const {id} = group;
                this._chips.set(id, {id, text: group.label, button: this._addChip(() => this._setFilter(toggleGroup(this._selected, id)))});
            }
            this._chips.get(group.id).count = group.count;
        }
        for (const {id, text, count, button} of this._chips.values()) {
            button.label = `${text}  ${count}`;
            button.accessible_name = `${text}, ${plural(count, 'window')}`;
            button.checked = this._selected.includes(id);
        }
        this._allChip.checked = !this._selected.length;

        const fitCount = Math.min(matching, MAX_WINDOWS);
        const fitButton = this._selectors.get(FIT);
        fitButton.label = `All · ${fitCount}`;
        fitButton.accessible_name = `All matching windows, ${plural(fitCount, 'window')}`;
        for (const [layout, button] of this._selectors) {
            if (layout === this._count)
                button.add_style_pseudo_class('checked');
            else
                button.remove_style_pseudo_class('checked');
        }

        const layout = this._count;
        const fit = layout === FIT;
        const rows = layoutShape(layout, matching, workArea);
        const count = rows.reduce((sum, columns) => sum + columns, 0);
        this._canPlace = !fit && count > 0 && eligible.includes(focusWindow);
        this._instruction.text = fit ? FIT_INSTRUCTION
            : count > 9 ? 'Click a tile, or press 1–9 for the first nine, to place this window.'
                : 'Click a tile, or press its number, to place this window.';
        // Rebuilding the tiles would otherwise drop key focus to the stage.
        const focus = global.stage.get_key_focus();
        const tileFocused = Boolean(focus && this._grid.contains(focus));
        this._grid.destroy_all_children();
        this._grid.visible = rows.length > 0;
        const size = rows.length <= 2 ? '' : rows.length === 3 ? ' tiling-grid-cell-medium' : ' tiling-grid-cell-small';
        let index = 0;
        rows.forEach((columns, row) => {
            const rowActor = new St.BoxLayout({style_class: 'tiling-grid-row', x_expand: true});
            // Equal widths within a row, whatever the digits in each label.
            rowActor.layout_manager.homogeneous = true;
            for (let column = 0; column < columns; column++) {
                const cell = index++;
                const where = `tile ${cell + 1}, row ${row + 1} of ${rows.length}, column ${column + 1}`;
                const tile = new St.Button({
                    style_class: `tiling-grid-cell${size}`, label: `${cell + 1}`,
                    reactive: this._canPlace, can_focus: this._canPlace, x_expand: true,
                    accessible_name: this._canPlace ? `Place selected window in ${where}` : `Preview of ${where}`,
                });
                if (!this._canPlace)
                    tile.add_style_pseudo_class('insensitive');
                tile.connect('clicked', () => this._accept(() => this._controls.place(layout, cell, this._context)));
                rowActor.add_child(tile);
            }
            this._grid.add_child(rowActor);
        });
        if (tileFocused)
            this._selectors.get(layout).grab_key_focus();

        const arranged = Math.min(matching, fit ? fitCount : layout);
        const overflow = matching - arranged;
        const scope = filterLabel ? ` (${filterLabel})` : '';
        this._summary.text = matching
            ? `Arrange ${plural(arranged, 'window')}${scope} on this monitor and workspace.${overflow ? ` ${overflow} less-recent ${overflow === 1 ? 'window stays' : 'windows stay'} in place.` : ''}`
            : `No ${filterLabel ? `${filterLabel} ` : 'resizable '}windows on this monitor and workspace.`;
        setSensitive(this._arrangeButton, matching > 0);
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
        // A LAYOUTS count or FIT; in memory only, so a reload starts at six.
        this.lastCount = 6;

        const alive = window => Boolean(window && global.get_window_actors().some(actor => actor.meta_window === window));
        const windows = workspace => global.display.get_tab_list(Meta.TabList.NORMAL_ALL, workspace);
        const contextCurrent = context => context.workspace === global.workspace_manager.get_active_workspace() &&
            context.monitor >= 0 && context.monitor < global.display.get_n_monitors() &&
            ['x', 'y', 'width', 'height'].every(key => context.workspace.get_work_area_for_monitor(context.monitor)[key] === context.workArea[key]);
        this.controller = new GridController({
            normalType: Meta.WindowType.NORMAL,
            // TA natively maximizes a tile equal to the work area (All with one window).
            maximizedBoth: Meta.MaximizeFlags.BOTH,
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
                        throw new Error('A window did not finish leaving maximize or fullscreen. Restore maximized or fullscreen windows, then try again.');
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
                }
                if (cancelled() || !alive(window))
                    return;
                // The saved frame is authoritative: existing tiles may still
                // have their old gaps after the user changes TA preferences.
                // Restore their actual bounds after rebuilding TA's hooks.
                const {x, y, width, height} = frame;
                window.move_frame(true, x, y);
                window.move_resize_frame(true, x, y, width, height);
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
                // A lone All window is maximized, not tiled, and joins no group.
                const group = selected.filter(window => alive(window) && window.isTiled);
                if (group.length && !Settings.getBoolean(Settings.DISABLE_TILE_GROUPS)) {
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
            this._panel.accessible_name = 'Window layouts — 4 to 16 windows';
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
            this._settings = extension.getSettings();
            // Every arrange shortcut applies the filter last saved by the picker.
            const bindings = [
                ['show-grid-picker', () => this.openPicker()],
                ...LAYOUT_BINDINGS.map(([layout, name]) => [name, () => this.arrange(layout)]),
                ['undo-grid-layout', () => this.undo()],
            ];
            for (const [name, action] of bindings) {
                Main.wm.addKeybinding(name, this._settings, Meta.KeyBindingFlags.IGNORE_AUTOREPEAT, Shell.ActionMode.NORMAL, action);
                this._registeredBindings.push(name);
            }
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

    /** Program-type group ids saved by the picker's Arrange; empty means all windows. */
    get filter() {
        return this._settings.get_strv(FILTER_KEY);
    }

    set filter(selected) {
        this._settings.set_strv(FILTER_KEY, selected);
    }

    /** `layout` is a LAYOUTS count or FIT; `selected` narrows it to program types. */
    async arrange(layout, context, selected = this.filter) {
        this.lastCount = layout;
        const result = await this.controller.arrange(layout, context, {
            matches: windowMatcher(selected, groupFor),
            label: describeFilter(selected, labelFor),
        });
        if (result.ok && !this._destroyed) {
            const scope = result.label ? ` (${result.label})` : '';
            const extra = result.overflow ? ` ${result.overflow} less-recent ${result.overflow === 1 ? 'window was' : 'windows were'} left in place.` : '';
            Main.notify('Window layouts', `Arranged ${plural(result.moved, 'window')}${scope}.${extra} Super+Alt+Z to undo.`);
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
        this._settings = null;
        this._panel?.destroy();
        this._panel = null;
    }
}
