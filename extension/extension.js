import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {planColumnInsert, sameRect} from './columns.js';

const TILING_ASSISTANT_UUIDS = [
    'tiling-assistant@ubuntu.com',
    'tiling-assistant@leleat-on-github',
];

const SIDES = ['left', 'right'];

/**
 * Extends Tiling Assistant: when 2+ tiled columns fill the monitor, tiling a
 * window to the left/right edge (keyboard or drag) inserts it as a new column
 * instead of covering the outermost one.
 *
 * Tiling Assistant's TilingWindowManager is a class of static methods, and
 * GJS caches ES modules by URI, so importing its file gives us the same class
 * object Tiling Assistant calls. We wrap getTileFor() (keyboard + drag preview)
 * and tile() (the actual move) and restore both on disable.
 */
export default class TilingColumnsExtension extends Extension {
    async enable() {
        const tilingAssistant = TILING_ASSISTANT_UUIDS
            .map(uuid => Main.extensionManager.lookup(uuid))
            .find(extension => extension);
        if (!tilingAssistant)
            throw new Error('Tiling Assistant is not installed');

        const base = tilingAssistant.dir.get_uri();
        const [twmModule, utilityModule, commonModule] = await Promise.all([
            import(`${base}/src/extension/tilingWindowManager.js`),
            import(`${base}/src/extension/utility.js`),
            import(`${base}/src/common.js`),
        ]);
        const Twm = twmModule.TilingWindowManager;
        const {Rect, Util} = utilityModule;
        const {Settings, Shortcuts} = commonModule;

        const originalGetTileFor = Twm.getTileFor;
        const originalTile = Twm.tile;

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

            return planColumnInsert(workArea,
                columns.map(w => ({id: w, rect: w.tiledRect})), side);
        };

        Twm.getTileFor = function (shortcut, workArea, monitor = null) {
            const rect = originalGetTileFor.call(this, shortcut, workArea, monitor);
            const side = {[Shortcuts.LEFT]: 'left', [Shortcuts.RIGHT]: 'right'}[shortcut];
            if (!side)
                return rect;

            const plan = planFor(global.display.focus_window, workArea, monitor, side);
            return plan ? new Rect(plan.slot) : rect;
        };

        Twm.tile = async function (window, newRect, params = {}) {
            if (window && newRect && !params.ignoreTA && !params.fakeTile) {
                const monitor = params.monitorNr ?? window.get_monitor();
                const workArea = new Rect(window.get_work_area_for_monitor(monitor));
                const plan = SIDES
                    .map(side => planFor(window, workArea, monitor, side))
                    .find(p => p && sameRect(p.slot, newRect));

                // Shrink the existing columns first, like Tiling Assistant's own
                // split tiling does, so the final tile() builds one tile group.
                for (const {id: column, rect} of plan?.moves ?? []) {
                    await originalTile.call(this, column, new Rect(rect), {
                        openTilingPopup: false,
                        monitorNr: monitor,
                    });
                }
            }

            return originalTile.call(this, window, newRect, params);
        };

        this._restore = () => {
            Twm.getTileFor = originalGetTileFor;
            Twm.tile = originalTile;
        };
    }

    disable() {
        this._restore?.();
        this._restore = null;
    }
}
