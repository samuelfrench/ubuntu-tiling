import {FIT, copyRect, eligibleWindows, fitsCell, gridCells, planGrid} from './grids.js';
import {maximizedFlags} from './windowState.js';

/**
 * One reversible operation at a time. GNOME effects are injected so failure,
 * closure, disable and asynchronous races can be exercised under node.
 * Restoration can await a Wayland frame commit before restoring native window
 * states. Disabling cancels pending work and leaves already committed geometry.
 */
export class GridController {
    constructor(deps) {
        this._deps = deps;
        this._job = null;
        this._undo = null;
        this._destroyed = false;
    }

    get busy() { return Boolean(this._job); }
    get canUndo() { return Boolean(this._undo) && !this.busy; }

    captureContext() {
        const context = this._deps.getContext();
        return {...context, workArea: copyRect(context.workArea)};
    }

    _current(context) {
        if (!this._deps.isContextCurrent(context))
            throw new Error('The workspace or monitor changed. Open the layout picker again.');
        return {...context, windows: this._deps.getWindows(context)};
    }

    async arrange(layout, context = this.captureContext(), {matches, label} = {}) {
        return this._run(context, () => {
            const plan = planGrid(layout, this._current(context), this._deps.normalType, matches);
            if (!plan.moves.length)
                throw new Error(`No ${label ? `${label} ` : 'resizable '}windows on this monitor and workspace.`);
            return {...plan, label, arrange: true, fit: layout === FIT};
        });
    }

    async place(count, cell, context = this.captureContext()) {
        return this._run(context, () => {
            const current = this._current(context);
            const window = context.focusWindow;
            if (!this._deps.isAlive(window) ||
                !eligibleWindows([window], current, this._deps.normalType).length)
                throw new Error('The selected window is no longer available to tile.');
            const rect = gridCells(count, context.workArea)[cell];
            if (!Number.isInteger(cell) || !rect)
                throw new Error('Choose a tile in this layout.');
            return {moves: [{window, rect}], count, overflow: 0, focusWindow: window};
        });
    }

    async _run(context, makePlan) {
        if (this._destroyed)
            return {ok: false, reason: 'disabled'};
        if (this.busy)
            return {ok: false, reason: 'busy'};
        const job = {context, touched: [], cancelled: false};
        this._job = job;
        try {
            const plan = makePlan();
            // Capture the entire transaction before the first tile changes
            // tile groups or stacking order of another selected window.
            const snapshots = plan.moves.map(({window}) => ({window, state: this._deps.snapshot(window)}));
            for (let i = 0; i < plan.moves.length; i++) {
                if (job.cancelled)
                    return {ok: false, reason: 'disabled'};
                const {window, rect} = plan.moves[i];
                if (!this._deps.isAlive(window))
                    throw new Error('A window closed before the layout was finished.');
                job.touched.push(snapshots[i]);
                await this._deps.tile(window, rect, context.monitor, snapshots[i].state, () => job.cancelled);
            }
            if (job.cancelled)
                return {ok: false, reason: 'disabled'};
            await this._deps.settle();
            if (job.cancelled)
                return {ok: false, reason: 'disabled'};
            if (!this._deps.isContextCurrent(context))
                throw new Error('The workspace or monitor changed during the layout.');
            for (const {window, rect} of plan.moves) {
                if (!this._deps.isAlive(window))
                    continue;
                if (!this._placed(window, rect, context.workArea))
                    throw new Error('A window refused to tile. The previous layout was restored.');
                if (!fitsCell(window.get_frame_rect(), rect)) {
                    const title = window.get_title()?.trim();
                    const name = title ? `“${title}”` : 'An untitled window';
                    throw new Error(`${name} has a minimum size too large for this layout. ${
                        plan.fit ? 'Pick fewer programs or a numbered layout.' : 'Try a layout with fewer tiles.'}`);
                }
            }
            if (plan.arrange)
                this._deps.finishArrange?.(plan.moves.map(move => move.window));
            this._undo = {context, snapshots};
            // A window outside the filter must not be raised over the new grid.
            this._deps.focus(plan.focusWindow, context);
            return {ok: true, moved: plan.moves.length, overflow: plan.overflow, count: plan.count, label: plan.label};
        } catch (error) {
            if (job.cancelled)
                return {ok: false, reason: 'disabled'};
            const recoveryErrors = await this._restore(job.touched, () => job.cancelled);
            if (job.cancelled)
                return {ok: false, reason: 'disabled'};
            this._deps.focus(context.focusWindow, context);
            const message = `${error.message}${recoveryErrors.length ? ' Some windows could not be restored.' : ''}`;
            if (!this._destroyed)
                this._deps.reportError(message);
            return {ok: false, reason: 'error', message};
        } finally {
            if (this._job === job)
                this._job = null;
        }
    }

    /**
     * TA tiles a window to `rect`, except that a rect equal to the work area
     * (All with one window) maximizes it: natively, with isTiled false and no
     * tiledRect, or with gaps, keeping tiledRect at the work area. Gapped
     * frames are inset, so fitsCell still holds for them.
     */
    _placed(window, rect, workArea) {
        const tiledTo = Boolean(window.tiledRect) && ['x', 'y', 'width', 'height'].every(k => window.tiledRect[k] === rect[k]);
        if (window.isTiled && tiledTo)
            return true;
        const fullArea = ['x', 'y', 'width', 'height'].every(k => rect[k] === workArea[k]);
        return fullArea && (tiledTo || maximizedFlags(window) === this._deps.maximizedBoth);
    }

    async _restore(snapshots, cancelled = () => false) {
        const errors = [];
        for (const {window, state} of snapshots) {
            if (cancelled())
                break;
            if (!this._deps.isAlive(window))
                continue;
            try {
                await this._deps.restore(window, state, cancelled);
            } catch (error) {
                errors.push(error);
            }
        }
        try {
            if (!cancelled())
                this._deps.finishRestore?.(snapshots);
        } catch (error) {
            errors.push(error);
        }
        return errors;
    }

    async undo() {
        if (this._destroyed)
            return {ok: false, reason: 'disabled'};
        if (this.busy)
            return {ok: false, reason: 'busy'};
        if (!this._undo)
            return {ok: false, reason: 'empty'};
        const undo = this._undo;
        const movedElsewhere = undo.snapshots.some(({window, state}) =>
            this._deps.isAlive(window) && (window.get_monitor() !== state.monitor ||
                window.get_workspace() !== state.workspace));
        if (!this._deps.isContextCurrent(undo.context) || movedElsewhere) {
            this._deps.reportError('Return to the original workspace and monitor arrangement before undoing this layout.');
            return {ok: false, reason: 'context-changed'};
        }
        const job = {cancelled: false};
        this._job = job;
        try {
            const errors = await this._restore(undo.snapshots, () => job.cancelled);
            if (job.cancelled)
                return {ok: false, reason: 'disabled'};
            this._deps.focus(undo.context.focusWindow, undo.context);
            if (errors.length) {
                this._deps.reportError('Some windows could not be restored. Undo is available to try again.');
                return {ok: false, reason: 'error'};
            }
            this._undo = null;
            return {ok: true, restored: undo.snapshots.filter(({window}) => this._deps.isAlive(window)).length};
        } finally {
            if (this._job === job)
                this._job = null;
        }
    }

    destroy() {
        this._destroyed = true;
        if (this._job)
            this._job.cancelled = true;
        this._deps.cancelSettle?.();
        this._undo = null;
    }
}
