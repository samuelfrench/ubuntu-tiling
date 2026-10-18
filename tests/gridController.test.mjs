import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GridController} from '../extension/gridController.js';
import {FIT, copyRect, gridCells} from '../extension/grids.js';

const area = {x: 60, y: 30, width: 3001, height: 901};

function setup(count = 3) {
    const workspace = {};
    const windows = Array.from({length: count}, (_, id) => ({
        id, alive: true, minimized: false, frame: {x: 100 + id * 90, y: 60, width: 800, height: 600},
        monitor: 0, workspace, isTiled: false, tiledRect: null, untiledRect: null,
        maximized: 0, fullscreen: false, above: false,
        get_window_type() { return 0; },
        is_skip_taskbar() { return false; },
        get_monitor() { return this.monitor; },
        get_workspace() { return this.workspace; },
        is_on_all_workspaces() { return false; },
        get_maximized() { return this.maximized; },
        is_fullscreen() { return this.fullscreen; },
        allows_move() { return true; },
        allows_resize() { return true; },
        get_frame_rect() { return this.frame; },
    }));
    const context = {windows, workspace, monitor: 0, workArea: area, focusWindow: windows[0]};
    const errors = [];
    const focus = [];
    const tiles = [];
    const restores = [];
    const state = window => ({
        frame: copyRect(window.frame), isTiled: window.isTiled,
        tiledRect: copyRect(window.tiledRect), untiledRect: copyRect(window.untiledRect),
        maximized: window.maximized, fullscreen: window.fullscreen, above: window.above,
        monitor: window.monitor, workspace: window.workspace,
    });
    const deps = {
        normalType: 0,
        maximizedBoth: 3,
        getContext: () => context,
        getWindows: () => windows,
        isContextCurrent: () => true,
        isAlive: window => Boolean(window?.alive),
        snapshot: state,
        async tile(window, rect, monitor) {
            tiles.push({window, rect, monitor});
            window.untiledRect ||= copyRect(window.frame);
            window.isTiled = true;
            window.tiledRect = copyRect(rect);
            window.frame = copyRect(rect);
            window.maximized = 0;
            window.fullscreen = false;
            window.above = false;
        },
        settle: async () => {},
        restore(window, snapshot) {
            restores.push(window);
            Object.assign(window, snapshot);
        },
        focus(window) { if (window?.alive) focus.push(window); },
        reportError: message => errors.push(message),
    };
    return {controller: new GridController(deps), deps, context, windows, errors, focus, tiles, restores, state};
}

test('arrange saves original state and undo restores floating, tiled, maximized/fullscreen/above metadata', async () => {
    const s = setup();
    Object.assign(s.windows[0], {isTiled: true, tiledRect: {...area, width: 1500}, untiledRect: {x: 200, y: 100, width: 900, height: 600}});
    Object.assign(s.windows[1], {maximized: 3, above: true});
    Object.assign(s.windows[2], {fullscreen: true});
    const before = s.windows.map(s.state);
    assert.deepEqual(await s.controller.arrange(6), {ok: true, moved: 3, overflow: 0, count: 6, label: undefined});
    assert.equal(s.controller.canUndo, true);
    assert.equal(s.focus.at(-1), s.windows[0]);
    assert.equal((await s.controller.undo()).restored, 3);
    assert.deepEqual(s.windows.map(s.state), before);
    assert.equal(s.controller.canUndo, false);
});

test('placing a captured focused window affects only that window and selected cell', async () => {
    const s = setup();
    const captured = s.controller.captureContext();
    s.context.focusWindow = s.windows[2];
    assert.equal((await s.controller.place(8, 7, captured)).ok, true);
    assert.equal(s.tiles.length, 1);
    assert.equal(s.tiles[0].window, s.windows[0]);
    assert.deepEqual(s.tiles[0].rect, gridCells(8, area)[7]);
    assert.equal(s.tiles[0].monitor, 0);
});

test('arrange overflow is disclosed and excluded windows stay unchanged', async () => {
    const s = setup(9);
    const before = s.windows.map(s.state);
    const result = await s.controller.arrange(6);
    assert.equal(result.overflow, 3);
    assert.deepEqual(s.windows.slice(6).map(s.state), before.slice(6));
});

test('no windows, changed context, invalid cell and closed selected window fail without moving others', async () => {
    const empty = setup(0);
    assert.equal((await empty.controller.arrange(6)).ok, false);
    const s = setup();
    assert.equal((await s.controller.place(6, 6)).ok, false);
    s.windows[0].alive = false;
    assert.equal((await s.controller.place(6, 0)).ok, false);
    s.deps.isContextCurrent = () => false;
    assert.equal((await s.controller.arrange(8)).ok, false);
    assert.equal(s.tiles.length, 0);
});

test('failed partial operation restores every touched window and preserves prior undo', async () => {
    const s = setup();
    await s.controller.place(6, 0);
    const before = s.windows.map(s.state);
    const tile = s.deps.tile;
    s.deps.tile = async (...args) => {
        await tile(...args);
        if (args[0] === s.windows[1])
            throw new Error('move rejected');
    };
    assert.equal((await s.controller.arrange(8)).ok, false);
    assert.deepEqual(s.windows.map(s.state), before);
    assert.equal(s.errors.at(-1), 'move rejected');
    assert.equal(s.controller.canUndo, true);
    assert.equal((await s.controller.undo()).ok, true);
    assert.equal(s.windows[0].isTiled, false);
});

test('silent TA refusal and app minimum size overflow both roll back visibly', async () => {
    for (const fail of ['refuse', 'oversize']) {
        const s = setup();
        const before = s.windows.map(s.state);
        const tile = s.deps.tile;
        s.deps.tile = async (...args) => {
            if (fail === 'refuse')
                return;
            await tile(...args);
            args[0].frame.width += 200;
        };
        assert.equal((await s.controller.arrange(6)).ok, false);
        assert.deepEqual(s.windows.map(s.state), before);
        assert.equal(s.errors.length, 1);
    }
});

test('terminal increment undersizing is accepted without claiming exact frame dimensions', async () => {
    const s = setup();
    const tile = s.deps.tile;
    s.deps.tile = async (...args) => {
        await tile(...args);
        args[0].frame.width -= 7;
    };
    assert.equal((await s.controller.arrange(8)).ok, true);
});

test('closed windows are ignored during undo and others restore', async () => {
    const s = setup();
    await s.controller.arrange(6);
    s.windows[1].alive = false;
    assert.deepEqual(await s.controller.undo(), {ok: true, restored: 2});
    assert.equal(s.windows[0].isTiled, false);
    assert.equal(s.windows[2].isTiled, false);
});

test('undo refuses changed workspace, monitor geometry or a window moved elsewhere', async () => {
    for (const kind of ['workspace', 'monitor', 'context']) {
        const s = setup();
        await s.controller.arrange(6);
        if (kind === 'workspace') s.windows[0].workspace = {};
        if (kind === 'monitor') s.windows[0].monitor = 2;
        if (kind === 'context') s.deps.isContextCurrent = () => false;
        assert.equal((await s.controller.undo()).reason, 'context-changed');
        assert.equal(s.restores.length, 0);
        assert.equal(s.controller.canUndo, true);
    }
});

test('rapid invocation cannot overlap or replace the current undo snapshot', async () => {
    const s = setup();
    let resolve;
    s.deps.settle = () => new Promise(done => { resolve = done; });
    const pending = s.controller.arrange(6);
    await new Promise(done => setImmediate(done));
    assert.equal(s.controller.busy, true);
    assert.deepEqual(await s.controller.arrange(8), {ok: false, reason: 'busy'});
    assert.deepEqual(await s.controller.undo(), {ok: false, reason: 'busy'});
    resolve();
    assert.equal((await pending).ok, true);
    assert.equal(s.tiles.length, 3);
});

test('disable cancels a pending settle, keeps committed geometry and leaves no undo', async () => {
    const s = setup();
    let resolve;
    let cancelled = 0;
    s.deps.settle = () => new Promise(done => { resolve = done; });
    s.deps.cancelSettle = () => { cancelled++; resolve(); };
    const pending = s.controller.arrange(6);
    await new Promise(done => setImmediate(done));
    const committed = s.windows.map(s.state);
    s.controller.destroy();
    assert.deepEqual(s.windows.map(s.state), committed);
    assert.equal((await pending).reason, 'disabled');
    assert.equal(cancelled, 1);
    assert.equal(s.controller.canUndo, false);
    assert.equal((await s.controller.arrange(8)).reason, 'disabled');
    assert.equal(s.errors.length, 0);
});

test('disable during native preparation cancels it before any later tile can move', async () => {
    const s = setup();
    const before = s.windows.map(s.state);
    let resolve;
    const tile = s.deps.tile;
    s.deps.tile = async (...args) => {
        await new Promise(done => { resolve = done; });
        if (args[4]()) return;
        await tile(...args);
    };
    const pending = s.controller.arrange(6);
    s.controller.destroy();
    resolve();
    assert.equal((await pending).reason, 'disabled');
    assert.equal(s.tiles.length, 0);
    assert.deepEqual(s.windows.map(s.state), before);
});

test('Undo holds the busy lock through asynchronous native frame restoration', async () => {
    const s = setup();
    await s.controller.arrange(6);
    let resolve;
    const restore = s.deps.restore;
    s.deps.restore = async (...args) => {
        if (args[0] === s.windows[0])
            await new Promise(done => { resolve = done; });
        restore(...args);
    };
    const undo = s.controller.undo();
    assert.equal(s.controller.busy, true);
    assert.equal((await s.controller.arrange(8)).reason, 'busy');
    resolve();
    assert.equal((await undo).ok, true);
    assert.equal(s.controller.busy, false);
});

test('successful Arrange reconciles all selected groups; single placement preserves stock grouping', async () => {
    const s = setup(8);
    const groups = [];
    s.deps.finishArrange = windows => groups.push(windows);
    await s.controller.arrange(6);
    assert.deepEqual(groups, [s.windows.slice(0, 6)]);
    await s.controller.place(8, 7);
    assert.equal(groups.length, 1);
});

test('recovery continues past one restore error and reports incomplete recovery', async () => {
    const s = setup();
    const restore = s.deps.restore;
    s.deps.restore = (window, state) => {
        if (window === s.windows[0]) throw new Error('restore failed');
        restore(window, state);
    };
    s.deps.settle = async () => { throw new Error('layout failed'); };
    assert.equal((await s.controller.arrange(6)).ok, false);
    assert.equal(s.windows[1].isTiled, false);
    assert.equal(s.windows[2].isTiled, false);
    assert.match(s.errors.at(-1), /Some windows could not be restored/);
});

test('arranges only matching windows and returns the label', async () => {
    const s = setup(5);
    const matches = window => window.id === 1 || window.id === 3;
    const result = await s.controller.arrange(FIT, s.context, {matches, label: 'Terminals'});
    assert.deepEqual(result, {ok: true, moved: 2, overflow: 0, count: 2, label: 'Terminals'});
    assert.deepEqual(s.tiles.map(tile => tile.window.id).sort(), [1, 3]);
    const cells = gridCells(2, area, {ragged: true});
    assert.deepEqual(s.tiles.map(tile => tile.rect).sort((a, b) => a.x - b.x), cells);
});

test('reports the filter label when nothing matches', async () => {
    const s = setup(3);
    const result = await s.controller.arrange(FIT, s.context, {matches: () => false, label: 'Terminals'});
    assert.equal(result.ok, false);
    assert.equal(s.errors.at(-1), 'No Terminals windows on this monitor and workspace.');
    assert.equal(s.tiles.length, 0);
    const empty = setup(0);
    assert.equal((await empty.controller.arrange(6)).ok, false);
    assert.equal(empty.errors.at(-1), 'No resizable windows on this monitor and workspace.');
});

test('arranges twelve and sixteen', async () => {
    for (const layout of [12, 16]) {
        const s = setup(16);
        const result = await s.controller.arrange(layout);
        assert.deepEqual(result, {ok: true, moved: layout, overflow: 16 - layout, count: layout, label: undefined});
        assert.equal(s.tiles.length, layout);
        assert.deepEqual(s.tiles.map(tile => tile.rect).sort((a, b) => a.y - b.y || a.x - b.x),
            gridCells(layout, area).sort((a, b) => a.y - b.y || a.x - b.x));
    }
});

test('fit layout is not a placeable tile layout', async () => {
    const s = setup();
    assert.equal((await s.controller.place(FIT, 0)).ok, false);
    assert.equal(s.tiles.length, 0);
});

test('names the larger layout fix when an app minimum size overflows', async () => {
    const s = setup();
    const tile = s.deps.tile;
    s.deps.tile = async (...args) => {
        await tile(...args);
        args[0].frame.width += 200;
    };
    assert.equal((await s.controller.arrange(6)).ok, false);
    assert.equal(s.errors.at(-1), 'A window’s minimum size is too large for this layout. Try a layout with fewer tiles.');
});

/** Tiling Assistant's tile(): a rect equal to the work area maximizes instead of tiling. */
function tilingAssistantTile(s, gap = 0) {
    return async (window, rect, monitor) => {
        s.tiles.push({window, rect, monitor});
        const maximize = ['x', 'y', 'width', 'height'].every(k => rect[k] === area[k]);
        window.isTiled = !maximize;
        window.untiledRect ||= copyRect(window.frame);
        if (maximize && !gap) {
            window.tiledRect = null;
            window.maximized = 3;
            window.frame = copyRect(area);
            return;
        }
        // Maximize with gaps keeps tiledRect at the work area, with isTiled false.
        window.tiledRect = copyRect(rect);
        window.frame = {x: rect.x + gap, y: rect.y + gap, width: rect.width - 2 * gap, height: rect.height - 2 * gap};
    };
}

test('All with one matching window accepts Tiling Assistant maximize, natively or with gaps, and Undo restores it', async () => {
    for (const gap of [0, 12]) {
        const s = setup(3);
        s.deps.tile = tilingAssistantTile(s, gap);
        const groups = [];
        s.deps.finishArrange = windows => groups.push(windows);
        const before = s.windows.map(s.state);
        const result = await s.controller.arrange(FIT, s.context, {matches: window => window.id === 1, label: 'Solo'});
        assert.deepEqual(result, {ok: true, moved: 1, overflow: 0, count: 1, label: 'Solo'}, `gap ${gap}`);
        assert.deepEqual(s.errors, []);
        assert.deepEqual(s.tiles.map(tile => [tile.window.id, tile.rect]), [[1, area]]);
        assert.equal(s.windows[1].isTiled, false);
        assert.equal(s.windows[1].maximized, gap ? 0 : 3);
        assert.deepEqual(s.windows[1].tiledRect, gap ? area : null);
        // The adapter keeps only isTiled windows, so its tile group is empty here.
        assert.deepEqual(groups, [[s.windows[1]]]);
        assert.deepEqual(s.windows.filter(window => window.id !== 1).map(s.state), before.filter((_, id) => id !== 1));
        assert.equal(before[1].maximized, 0);
        assert.deepEqual(await s.controller.undo(), {ok: true, restored: 1});
        assert.deepEqual(s.windows.map(s.state), before);
    }
});

test('a full work area cell still rejects a window that is neither maximized both ways nor tiled to it', async () => {
    for (const maximized of [0, 1, 2]) {
        const s = setup(1);
        s.deps.tile = async (window, rect) => {
            s.tiles.push({window, rect});
            window.isTiled = false;
            window.tiledRect = null;
            window.maximized = maximized;
        };
        const before = s.windows.map(s.state);
        assert.equal((await s.controller.arrange(FIT)).ok, false);
        assert.equal(s.errors.at(-1), 'A window refused to tile. The previous layout was restored.');
        assert.deepEqual(s.windows.map(s.state), before);
    }
});

test('a maximized All window larger than the work area reports the All advice', async () => {
    const s = setup(1);
    const tile = tilingAssistantTile(s);
    s.deps.tile = async (...args) => {
        await tile(...args);
        args[0].frame = {...area, width: area.width + 200};
    };
    assert.equal((await s.controller.arrange(FIT)).ok, false);
    assert.equal(s.errors.at(-1), 'A window’s minimum size is too large for this layout. Pick fewer programs or a numbered layout.');
});

test('names fewer programs or a numbered layout when an All window minimum size overflows', async () => {
    const s = setup();
    const tile = s.deps.tile;
    s.deps.tile = async (...args) => {
        await tile(...args);
        args[0].frame.width += 200;
    };
    assert.equal((await s.controller.arrange(FIT)).ok, false);
    assert.equal(s.errors.at(-1), 'A window’s minimum size is too large for this layout. Pick fewer programs or a numbered layout.');
});

test('focuses the most recent arranged window when the focused one is filtered out; Undo and errors refocus the original', async () => {
    const s = setup(4);
    // MRU order is the window order; the spatial sort would put windows[2] first.
    s.windows[1].frame = {...s.windows[1].frame, x: 2000};
    const matches = window => window.id !== 0;
    assert.equal((await s.controller.arrange(FIT, s.context, {matches, label: 'Terminals'})).ok, true);
    assert.equal(s.tiles[0].window, s.windows[2]);
    assert.equal(s.focus.at(-1), s.windows[1]);
    assert.equal((await s.controller.undo()).ok, true);
    assert.equal(s.focus.at(-1), s.windows[0]);

    const tile = s.deps.tile;
    s.deps.tile = async (...args) => {
        await tile(...args);
        if (args[0] === s.windows[3])
            throw new Error('move rejected');
    };
    assert.equal((await s.controller.arrange(FIT, s.context, {matches})).ok, false);
    assert.equal(s.focus.at(-1), s.windows[0]);
});

test('arranging with the focused window chosen keeps it focused', async () => {
    const s = setup(4);
    s.context.focusWindow = s.windows[3];
    assert.equal((await s.controller.arrange(FIT)).ok, true);
    assert.equal(s.focus.at(-1), s.windows[3]);
});
