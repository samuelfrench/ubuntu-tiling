import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {installHooks} from './hooks.js';

const TILING_ASSISTANT_UUIDS = [
    'tiling-assistant@ubuntu.com',
    'tiling-assistant@leleat-on-github',
];

/**
 * Extends Tiling Assistant: when 2+ tiled columns fill the monitor, tiling a
 * window to the left/right edge (keyboard or drag) inserts it as a new column
 * instead of covering the outermost one.
 *
 * Tiling Assistant's TilingWindowManager is a class of static methods, and
 * GJS caches ES modules by URI, so importing its file gives us the same class
 * object Tiling Assistant calls. hooks.js wraps getTileFor() (keyboard + drag
 * preview) and tile() (the actual move); disable() restores both.
 */
export default class TilingColumnsExtension extends Extension {
    enable() {
        const tilingAssistant = TILING_ASSISTANT_UUIDS
            .map(uuid => Main.extensionManager.lookup(uuid))
            .find(extension => extension);
        if (!tilingAssistant)
            throw new Error('Tiling Assistant is not installed');

        // The imports are async. If disable() runs before they settle (screen
        // lock, quick toggle), the session no longer matches and nothing is
        // installed; otherwise the hooks would outlive the extension and the
        // next enable() would wrap them a second time.
        const session = {};
        this._session = session;
        this._install(tilingAssistant.dir.get_uri(), session)
            .catch(error => console.error(`${this.uuid}: ${error.message}`));
    }

    async _install(base, session) {
        const [twmModule, utilityModule, commonModule] = await Promise.all([
            import(`${base}/src/extension/tilingWindowManager.js`),
            import(`${base}/src/extension/utility.js`),
            import(`${base}/src/common.js`),
        ]);
        if (this._session !== session)
            return;

        this._restore = installHooks({
            Twm: twmModule.TilingWindowManager,
            Rect: utilityModule.Rect,
            Util: utilityModule.Util,
            Settings: commonModule.Settings,
            Shortcuts: commonModule.Shortcuts,
            getFocusWindow: () => global.display.focus_window,
        });
    }

    disable() {
        this._session = null;
        this._restore?.();
        this._restore = null;
    }
}
