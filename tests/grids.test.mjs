import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {eligibleWindows, fitsCell, gridCells, planGrid} from '../extension/grids.js';

const workspace = {};
const otherWorkspace = {};
const area = {x: 66, y: 32, width: 5054, height: 1408};
const context = {workspace, monitor: 0, workArea: area};

function window(overrides = {}) {
    return {
        minimized: false,
        get_window_type: () => 0,
        is_skip_taskbar: () => false,
        get_monitor: () => 0,
        get_workspace: () => workspace,
        is_on_all_workspaces: () => false,
        get_maximized: () => 0,
        is_fullscreen: () => false,
        allows_move: () => true,
        allows_resize: () => true,
        get_frame_rect: () => ({x: 70, y: 40, width: 600, height: 400}),
        ...overrides,
    };
}

describe('grid geometry', () => {
    for (const count of [6, 8]) {
        for (const workArea of [area, {x: -1920, y: -107, width: 1919, height: 1001}]) {
            test(`${count} cells cover ${workArea.width}×${workArea.height} exactly`, () => {
                const cells = gridCells(count, workArea);
                const columns = count / 2;
                assert.equal(cells.length, count);
                assert.equal(cells[0].x, workArea.x);
                assert.equal(cells[0].y, workArea.y);
                assert.equal(cells.at(-1).x + cells.at(-1).width, workArea.x + workArea.width);
                assert.equal(cells.at(-1).y + cells.at(-1).height, workArea.y + workArea.height);
                assert.equal(cells.reduce((total, rect) => total + rect.width * rect.height, 0), workArea.width * workArea.height);
                cells.forEach((cell, i) => {
                    assert.ok(Object.values(cell).every(Number.isInteger));
                    if (i % columns)
                        assert.equal(cells[i - 1].x + cells[i - 1].width, cell.x);
                    if (i >= columns)
                        assert.equal(cells[i - columns].y + cells[i - columns].height, cell.y);
                });
            });
        }
    }
    test('rejects unsupported count, fractional and missing work areas', () => {
        assert.throws(() => gridCells(4, area));
        assert.throws(() => gridCells(6, null));
        assert.throws(() => gridCells(8, {...area, width: 2}));
        assert.throws(() => gridCells(6, {...area, width: 10.5}));
    });
    test('accepts terminal cell rounding, refuses oversized or misplaced frames', () => {
        const cell = {x: 10, y: 20, width: 400, height: 300};
        assert.ok(fitsCell({...cell, width: 395, height: 295}, cell));
        assert.ok(fitsCell({...cell, width: 402}, cell));
        assert.ok(!fitsCell({...cell, width: 403}, cell));
        assert.ok(!fitsCell({...cell, x: 0}, cell));
        assert.ok(!fitsCell({...cell, width: 0}, cell));
    });
});

describe('window selection', () => {
    test('restricts normal eligible windows to the active workspace and focused monitor', () => {
        const good = window();
        const excluded = [
            window({minimized: true}),
            window({get_window_type: () => 3}),
            window({get_monitor: () => 1}),
            window({get_workspace: () => otherWorkspace}),
            window({is_skip_taskbar: () => true}),
            window({allows_resize: () => false}),
            window({allows_move: () => false}),
            window({get_monitor: () => { throw new Error('closed'); }}),
        ];
        assert.deepEqual(eligibleWindows([good, ...excluded, good], context), [good]);
    });
    test('keeps sticky, maximized and fullscreen windows', () => {
        const sticky = window({get_workspace: () => otherWorkspace, is_on_all_workspaces: () => true});
        const maximized = window({get_maximized: () => 3, allows_resize: () => false});
        const fullscreen = window({is_fullscreen: () => true, allows_move: () => false});
        assert.deepEqual(eligibleWindows([sticky, maximized, fullscreen], context), [sticky, maximized, fullscreen]);
    });
    test('caps by MRU, always includes focused window, reports overflow', () => {
        const windows = Array.from({length: 9}, () => window());
        const plan = planGrid(6, {...context, windows, focusWindow: windows[8]});
        assert.equal(plan.overflow, 3);
        assert.equal(plan.eligible, 9);
        assert.equal(plan.moves.length, 6);
        assert.ok(plan.moves.some(move => move.window === windows[8]));
        assert.ok(!plan.moves.some(move => move.window === windows[5]));
    });
    test('retains spatial left/right and top/bottom order after selecting by recency', () => {
        const rect = (x, y) => () => ({x, y, width: 500, height: 400});
        const topLeft = window({get_frame_rect: rect(66, 32)});
        const topRight = window({get_frame_rect: rect(3300, 32)});
        const bottomLeft = window({get_frame_rect: rect(66, 736)});
        const bottomRight = window({get_frame_rect: rect(3300, 736)});
        const plan = planGrid(6, {...context, windows: [bottomRight, topRight, bottomLeft, topLeft]});
        assert.deepEqual(plan.moves.map(move => move.window), [topLeft, topRight, bottomLeft, bottomRight]);
    });
});
