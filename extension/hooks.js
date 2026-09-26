import {planColumnInsert, sameRect} from './columns.js';

const SIDES = ['left', 'right'];

/**
 * Whether Tiling Assistant's tile() will get past its own early returns for
 * `window`. tile() unmaximizes / unfullscreens first and only then checks
 * allows_move() and allows_resize(), which mutter reports as false while a
 * window is maximized or fullscreen, so mirror that order here.
 *
 * @param {Meta.Window} window
 * @returns {boolean}
 */
function canBeTiled(window) {
    if (window.is_skip_taskbar())
        return false;

    if (window.get_maximized() || window.is_fullscreen())
        return true;

    return window.allows_move() && window.allows_resize();
}

/**
 * Wraps Tiling Assistant's TilingWindowManager.getTileFor() (keyboard + drag
 * preview) and .tile() (the actual move) so that, when 2+ tiled columns fill
 * the monitor, tiling a window to the left/right edge inserts it as a new
 * column instead of covering the outermost one.
 *
 * Pure JS apart from the objects passed in, so it runs under node with fakes.
 *
 * @param {object} deps
 * @param {*} deps.Twm Tiling Assistant's TilingWindowManager class.
 * @param {*} deps.Rect Tiling Assistant's Rect class.
 * @param {*} deps.Util Tiling Assistant's Util class (getFavoriteLayout).
 * @param {*} deps.Settings Tiling Assistant's Settings class (getBoolean).
 * @param {*} deps.Shortcuts Tiling Assistant's Shortcuts constants.
 * @param {() => *} deps.getFocusWindow returns the focused Meta.Window or null.
 * @returns {() => void} restores the original methods.
 */
export function installHooks({Twm, Rect, Util, Settings, Shortcuts, getFocusWindow}) {
    const originalGetTileFor = Twm.getTileFor;
    const originalTile = Twm.tile;

    // Returns {slot, moves, previous} or null. `previous` holds the columns'
    // current rects so a failed insert can be undone.
    const planFor = (window, workArea, monitor, side) => {
        if (Settings.getBoolean(Settings.DISABLE_TILE_GROUPS))
            return null;

        if (Settings.getBoolean(Settings.ADAPT_EDGE_TILING_TO_FAVORITE_LAYOUT) &&
            Util.getFavoriteLayout(monitor).length)
            return null;

        const columns = Twm.getTopTileGroup({skipTopWindow: true, monitor})
            .filter(w => w !== window && w.tiledRect);
        if (columns.some(w => !w.allows_move() || !w.allows_resize()))
            return null;

        const previous = columns.map(w => ({
            id: w,
            rect: {
                x: w.tiledRect.x,
                y: w.tiledRect.y,
                width: w.tiledRect.width,
                height: w.tiledRect.height,
            },
        }));
        const plan = planColumnInsert(workArea, previous, side);
        return plan ? {...plan, previous} : null;
    };

    const findPlan = (window, newRect, params) => {
        const monitor = params.monitorNr ?? window.get_monitor();
        const workArea = new Rect(window.get_work_area_for_monitor(monitor));
        for (const side of SIDES) {
            const plan = planFor(window, workArea, monitor, side);
            if (plan && sameRect(plan.slot, newRect))
                return {...plan, monitor};
        }
        return null;
    };

    const getTileFor = function (shortcut, workArea, monitor = null) {
        const rect = originalGetTileFor.call(this, shortcut, workArea, monitor);
        const side = {[Shortcuts.LEFT]: 'left', [Shortcuts.RIGHT]: 'right'}[shortcut];
        if (!side)
            return rect;

        const plan = planFor(getFocusWindow(), workArea, monitor, side);
        return plan ? new Rect(plan.slot) : rect;
    };

    const tile = async function (window, newRect, params = {}) {
        const plan = window && newRect && !params.ignoreTA && !params.fakeTile &&
            canBeTiled(window)
            ? findPlan(window, newRect, params)
            : null;
        if (!plan)
            return originalTile.call(this, window, newRect, params);

        const move = async (column, rect) => originalTile.call(this, column, new Rect(rect), {
            openTilingPopup: false,
            monitorNr: plan.monitor,
        });

        // Shrink the existing columns first, like Tiling Assistant's own
        // split tiling does, so the final tile() builds one tile group.
        for (const {id: column, rect} of plan.moves)
            await move(column, rect);

        const result = await originalTile.call(this, window, newRect, params);

        // Tiling Assistant returned without tiling the window (for example a
        // window that turned out not to be resizable): put the columns back.
        if (!window.isTiled || !sameRect(window.tiledRect, newRect)) {
            for (const {id: column, rect} of plan.previous)
                await move(column, rect);
        }

        return result;
    };

    Twm.getTileFor = getTileFor;
    Twm.tile = tile;

    return () => {
        Twm.getTileFor = originalGetTileFor;
        Twm.tile = originalTile;
    };
}
