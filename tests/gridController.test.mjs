import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GridController} from '../extension/gridController.js';
import {copyRect, gridCells} from '../extension/grids.js';

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
    assert.deepEqual(await s.controller.arrange(6), {ok: true, moved: 3, overflow: 0, count: 6});
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
