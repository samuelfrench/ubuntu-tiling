import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { installHooks } from '../extension/hooks.js';

const r = (x, y, width, height) => ({ x, y, width, height });
const WA = r(0, 0, 3000, 900);
const LEFT_HALF = r(0, 0, 1500, 900);
const RIGHT_HALF = r(1500, 0, 1500, 900);
// Planner results for two halves in a 3000 px work area (see columns.test.mjs).
const RIGHT_SLOT = r(2000, 0, 1000, 900);
const LEFT_SLOT = r(0, 0, 1000, 900);
const STOCK = r(7, 7, 7, 7);

// Stand-in for Tiling Assistant's Rect: 1 rect-like param or x, y, width, height.
class Rect {
    constructor(...params) {
        const [a, b, c, d] = params;
        if (params.length === 1) {
            this.x = a.x;
            this.y = a.y;
            this.width = a.width;
            this.height = a.height;
        } else {
            this.x = a;
            this.y = b;
            this.width = c;
            this.height = d;
        }
    }

    copy() {
        return new Rect(this);
    }
}

class Window {
    constructor(name, tiledRect = null) {
        this.name = name;
        this.tiledRect = tiledRect ? new Rect(tiledRect) : null;
        this.isTiled = Boolean(tiledRect);
        this.skipTaskbar = false;
        this.maximized = 0;
        this.fullscreen = false;
        this.movable = true;
        this.resizable = true;
        this.monitor = 0;
    }

    is_skip_taskbar() {
        return this.skipTaskbar;
    }

    get_maximized() {
        return this.maximized;
    }

    is_fullscreen() {
        return this.fullscreen;
    }

    allows_move() {
        return this.movable;
    }

    allows_resize() {
        return this.resizable;
    }

    get_monitor() {
        return this.monitor;
    }

    get_work_area_for_monitor(monitor) {
        return monitor === 0 ? WA : r(0, 0, 10, 10);
    }
}

const plain = rect => r(rect.x, rect.y, rect.width, rect.height);

/**
 * Builds fake Tiling Assistant objects, installs the hooks and returns them
 * with the recorded calls to the *original* methods.
 */
function setup({ topTileGroup, refuse = () => false, settings = {}, favorite = [] }) {
    const calls = [];
    const Twm = {
        getTileFor(shortcut) {
            calls.push({ what: 'getTileFor', shortcut, self: this === Twm });
            return new Rect(STOCK);
        },
        async tile(window, newRect, params = {}) {
            calls.push({ what: 'tile', window: window.name, rect: plain(newRect), params: { ...params }, self: this === Twm });
            if (refuse(window))
                return undefined;

            window.isTiled = true;
            window.tiledRect = newRect.copy();
            return undefined;
        },
        getTopTileGroup() {
            return topTileGroup.slice();
        },
    };
    const originals = { getTileFor: Twm.getTileFor, tile: Twm.tile };
    const Settings = {
        DISABLE_TILE_GROUPS: 'disable-tile-groups',
        ADAPT_EDGE_TILING_TO_FAVORITE_LAYOUT: 'adapt-edge-tiling-to-favorite-layout',
        getBoolean: key => Boolean(settings[key]),
    };
    const Shortcuts = { LEFT: 'tile-left-half', RIGHT: 'tile-right-half', TOP: 'tile-top-half' };
    const Util = { getFavoriteLayout: () => favorite };
    const focus = { window: null };
    const restore = installHooks({
        Twm, Rect, Util, Settings, Shortcuts,
        getFocusWindow: () => focus.window,
    });
    return { Twm, calls, originals, restore, focus, Shortcuts };
}

function twoHalves() {
    const a = new Window('A', LEFT_HALF);
    const b = new Window('B', RIGHT_HALF);
    const w = new Window('W');
    return { a, b, w };
}

describe('getTileFor', () => {
    test('right/left with two spanning columns returns the new column slot as a Rect', () => {
        const { a, b, w } = twoHalves();
        const { Twm, focus, Shortcuts } = setup({ topTileGroup: [a, b] });
        focus.window = w;

        const right = Twm.getTileFor(Shortcuts.RIGHT, new Rect(WA), 0);
        assert.ok(right instanceof Rect);
        assert.deepEqual(plain(right), RIGHT_SLOT);

        const left = Twm.getTileFor(Shortcuts.LEFT, new Rect(WA), 0);
        assert.deepEqual(plain(left), LEFT_SLOT);
    });

    test('other shortcuts pass through to the original', () => {
        const { a, b, w } = twoHalves();
        const { Twm, calls, focus, Shortcuts } = setup({ topTileGroup: [a, b] });
        focus.window = w;

        const rect = Twm.getTileFor(Shortcuts.TOP, new Rect(WA), 0);
        assert.deepEqual(plain(rect), STOCK);
        assert.deepEqual(calls.map(c => c.what), ['getTileFor']);
        assert.equal(calls[0].self, true, 'original is called with this === Twm');
    });

    test('the focused window is not counted as a column', () => {
        const { a, b, w } = twoHalves();
        w.tiledRect = new Rect(LEFT_HALF);
        w.isTiled = true;
        const { Twm, focus, Shortcuts } = setup({ topTileGroup: [a, b, w] });
        focus.window = w;

        assert.deepEqual(plain(Twm.getTileFor(Shortcuts.RIGHT, new Rect(WA), 0)), RIGHT_SLOT);
    });

    test('stock result when tile groups are disabled, a favorite layout applies, or a column cannot move', () => {
        const cases = [
            { settings: { 'disable-tile-groups': true } },
            { settings: { 'adapt-edge-tiling-to-favorite-layout': true }, favorite: [r(0, 0, 1, 1)] },
            { fix: ({ a }) => { a.movable = false; } },
            { fix: ({ b }) => { b.resizable = false; } },
        ];
        for (const c of cases) {
            const windows = twoHalves();
            c.fix?.(windows);
            const { Twm, focus, Shortcuts } = setup({ topTileGroup: [windows.a, windows.b], ...c });
            focus.window = windows.w;
            assert.deepEqual(plain(Twm.getTileFor(Shortcuts.RIGHT, new Rect(WA), 0)), STOCK, JSON.stringify(c));
        }
    });

    test('fewer than two columns or columns that do not span the work area: stock result', () => {
        const a = new Window('A', LEFT_HALF);
        const { Twm, focus, Shortcuts } = setup({ topTileGroup: [a] });
        focus.window = new Window('W');
        assert.deepEqual(plain(Twm.getTileFor(Shortcuts.RIGHT, new Rect(WA), 0)), STOCK);

        const b = new Window('B', r(1500, 0, 1000, 900));
        const { Twm: Twm2, focus: focus2 } = setup({ topTileGroup: [a, b] });
        focus2.window = new Window('W');
        assert.deepEqual(plain(Twm2.getTileFor(Shortcuts.RIGHT, new Rect(WA), 0)), STOCK);
    });
});

describe('tile', () => {
    test('into the slot: shrinks the columns first, then tiles the window with the caller params', async () => {
        const { a, b, w } = twoHalves();
        const { Twm, calls } = setup({ topTileGroup: [a, b] });

        await Twm.tile(w, new Rect(RIGHT_SLOT), { openTilingPopup: true });

        assert.deepEqual(calls, [
            { what: 'tile', window: 'A', rect: r(0, 0, 1000, 900), params: { openTilingPopup: false, monitorNr: 0 }, self: true },
            { what: 'tile', window: 'B', rect: r(1000, 0, 1000, 900), params: { openTilingPopup: false, monitorNr: 0 }, self: true },
            { what: 'tile', window: 'W', rect: RIGHT_SLOT, params: { openTilingPopup: true }, self: true },
        ]);
        assert.deepEqual(plain(w.tiledRect), RIGHT_SLOT);
        assert.deepEqual(plain(a.tiledRect), r(0, 0, 1000, 900));
        assert.deepEqual(plain(b.tiledRect), r(1000, 0, 1000, 900));
    });

    test('drag flow: the rect from getTileFor is recognised by tile', async () => {
        const { a, b, w } = twoHalves();
        const { Twm, calls, focus, Shortcuts } = setup({ topTileGroup: [a, b] });
        focus.window = w;

        const preview = Twm.getTileFor(Shortcuts.LEFT, new Rect(WA), 0);
        await Twm.tile(w, preview, { monitorNr: 0, openTilingPopup: false, ignoreTA: false });

        assert.deepEqual(calls.filter(c => c.what === 'tile').map(c => [c.window, c.rect]), [
            ['A', r(1000, 0, 1000, 900)],
            ['B', r(2000, 0, 1000, 900)],
            ['W', LEFT_SLOT],
        ]);
    });

    test('any other rect, ignoreTA or fakeTile: only the original call', async () => {
        for (const [rect, params] of [
            [r(1500, 0, 1500, 900), {}],
            [RIGHT_SLOT, { ignoreTA: true }],
            [RIGHT_SLOT, { fakeTile: true }],
        ]) {
            const { a, b, w } = twoHalves();
            const { Twm, calls } = setup({ topTileGroup: [a, b] });
            await Twm.tile(w, new Rect(rect), params);
            assert.deepEqual(calls.map(c => c.window), ['W'], JSON.stringify(params));
            assert.deepEqual(plain(a.tiledRect), LEFT_HALF);
        }
    });

    test('a window Tiling Assistant would refuse leaves the columns alone', async () => {
        for (const fix of [
            w => { w.skipTaskbar = true; },
            w => { w.resizable = false; },
            w => { w.movable = false; },
        ]) {
            const { a, b, w } = twoHalves();
            fix(w);
            const { Twm, calls } = setup({ topTileGroup: [a, b] });
            await Twm.tile(w, new Rect(RIGHT_SLOT));
            assert.deepEqual(calls.map(c => c.window), ['W']);
            assert.deepEqual(plain(a.tiledRect), LEFT_HALF);
        }
    });

    test('a maximized or fullscreen window is still inserted (mutter reports it as non-resizable until unmaximized)', async () => {
        for (const fix of [w => { w.maximized = 3; }, w => { w.fullscreen = true; }]) {
            const { a, b, w } = twoHalves();
            w.resizable = false;
            w.movable = false;
            fix(w);
            const { Twm, calls } = setup({ topTileGroup: [a, b] });
            await Twm.tile(w, new Rect(RIGHT_SLOT));
            assert.deepEqual(calls.map(c => c.window), ['A', 'B', 'W']);
        }
    });

    test('if the original tile() returns without tiling the window, the columns are put back', async () => {
        const { a, b, w } = twoHalves();
        const { Twm, calls } = setup({ topTileGroup: [a, b], refuse: window => window === w });

        await Twm.tile(w, new Rect(RIGHT_SLOT));

        assert.deepEqual(calls.map(c => [c.window, c.rect]), [
            ['A', r(0, 0, 1000, 900)],
            ['B', r(1000, 0, 1000, 900)],
            ['W', RIGHT_SLOT],
            ['A', LEFT_HALF],
            ['B', RIGHT_HALF],
        ]);
        assert.equal(w.isTiled, false);
        assert.deepEqual(plain(a.tiledRect), LEFT_HALF);
        assert.deepEqual(plain(b.tiledRect), RIGHT_HALF);
    });

    test('monitorNr wins over the window monitor for the work area', async () => {
        const { a, b, w } = twoHalves();
        w.monitor = 7; // get_work_area_for_monitor(7) is a 10x10 area: no plan
        const { Twm, calls } = setup({ topTileGroup: [a, b] });

        await Twm.tile(w, new Rect(RIGHT_SLOT), { monitorNr: 0 });
        assert.deepEqual(calls.map(c => c.window), ['A', 'B', 'W']);

        calls.length = 0;
        const { a: a2, b: b2, w: w2 } = twoHalves();
        w2.monitor = 7;
        const { Twm: Twm2, calls: calls2 } = setup({ topTileGroup: [a2, b2] });
        await Twm2.tile(w2, new Rect(RIGHT_SLOT));
        assert.deepEqual(calls2.map(c => c.window), ['W']);
    });
});

describe('restore', () => {
    test('puts the original methods back', () => {
        const { a, b } = twoHalves();
        const { Twm, originals, restore } = setup({ topTileGroup: [a, b] });
        assert.notEqual(Twm.getTileFor, originals.getTileFor);
        assert.notEqual(Twm.tile, originals.tile);

        restore();

        assert.equal(Twm.getTileFor, originals.getTileFor);
        assert.equal(Twm.tile, originals.tile);
    });
});
