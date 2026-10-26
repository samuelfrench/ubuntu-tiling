import test from 'node:test';
import assert from 'node:assert/strict';
import {maximizedFlags, maximizeWindow, unmaximizeWindow, needsNativeRestore} from '../extension/windowState.js';
import {eligibleWindows} from '../extension/grids.js';

for (const modern of [false, true]) {
    test(`GNOME ${modern ? '50' : '46'} maximization preserves both axes and clears them with the correct API`, () => {
        let flags = 0;
        const window = modern ? {
            get_maximize_flags: () => flags,
            set_maximize_flags: value => { flags |= value; },
            unmaximize(...args) { assert.deepEqual(args, []); flags = 0; },
        } : {
            get_maximized: () => flags,
            maximize(value) { flags |= value; },
            unmaximize(value) { assert.equal(value, flags); flags &= ~value; },
        };
        for (const state of [1, 2, 3]) {
            maximizeWindow(window, state);
            assert.equal(maximizedFlags(window), state);
            unmaximizeWindow(window);
            assert.equal(maximizedFlags(window), 0);
        }
    });
}

test('GNOME 50 normal and maximized windows remain eligible without get_maximized', () => {
    const workspace = {};
    const window = {
        get_window_type: () => 0,
        minimized: false,
        is_skip_taskbar: () => false,
        get_monitor: () => 0,
        get_workspace: () => workspace,
        get_maximize_flags: () => 0,
        is_fullscreen: () => false,
        allows_move: () => true,
        allows_resize: () => true,
    };
    assert.deepEqual(eligibleWindows([window], {workspace, monitor: 0}), [window]);
    window.get_maximize_flags = () => 3;
    window.allows_resize = () => false;
    assert.deepEqual(eligibleWindows([window], {workspace, monitor: 0}), [window]);
});

test('TA axis-constrained tiles use their saved frame; later native states need a restore frame', () => {
    const area = {x: 0, y: 32, width: 2560, height: 688};
    const column = {isTiled: true, tiledRect: {...area, x: 512, width: 512}, maximized: 2, fullscreen: false};
    assert.equal(needsNativeRestore(column, area), false);
    assert.equal(needsNativeRestore({...column, maximized: 0}, area), false); // GNOME 46 TA
    assert.equal(needsNativeRestore({...column, maximized: 3}, area), true);
    assert.equal(needsNativeRestore({...column, fullscreen: true}, area), true);
    const row = {...column, tiledRect: {...area, height: 344}, maximized: 1};
    assert.equal(needsNativeRestore(row, area), false);
    assert.equal(needsNativeRestore({...row, maximized: 3}, area), true);
    const corner = {...column, tiledRect: {...area, width: 1280, height: 344}, maximized: 3};
    assert.equal(needsNativeRestore(corner, area), true);
    assert.equal(needsNativeRestore({...corner, maximized: 2}, area), true);
    assert.equal(needsNativeRestore({...corner, maximized: 0}, area), false);
    assert.equal(needsNativeRestore({...column, isTiled: false}, area), true);
});
