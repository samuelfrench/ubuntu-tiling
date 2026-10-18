import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {FIT, LAYOUTS, MAX_WINDOWS, eligibleWindows, fitsCell, gridCells, gridShape, planGrid} from '../extension/grids.js';

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
    for (const count of LAYOUTS) {
        for (const workArea of [area, {x: -1920, y: -107, width: 1919, height: 1001}, {x: 0, y: 0, width: 2560, height: 720}]) {
            test(`${count} cells cover ${workArea.width}×${workArea.height} exactly`, () => {
                const cells = gridCells(count, workArea);
                const shape = gridShape(count, workArea);
                assert.equal(shape.reduce((a, b) => a + b, 0), count);
                assert.equal(cells.length, count);
                assert.equal(cells[0].x, workArea.x);
                assert.equal(cells[0].y, workArea.y);
                assert.equal(cells.at(-1).x + cells.at(-1).width, workArea.x + workArea.width);
                assert.equal(cells.at(-1).y + cells.at(-1).height, workArea.y + workArea.height);
                assert.equal(cells.reduce((total, rect) => total + rect.width * rect.height, 0), workArea.width * workArea.height);
                let index = 0;
                shape.forEach((columns, row) => {
                    for (let column = 0; column < columns; column++, index++) {
                        const cell = cells[index];
                        assert.ok(Object.values(cell).every(Number.isInteger));
                        if (column)
                            assert.equal(cells[index - 1].x + cells[index - 1].width, cell.x);
                        if (row) {
                            const above = cells.find(c => c.x <= cell.x && cell.x < c.x + c.width && c.y + c.height === cell.y);
                            assert.ok(above, 'a cell above shares the edge');
                        }
                    }
                });
            });
        }
    }
    test('keeps six and eight as 3×2 and 4×2', () => {
        for (const a of [area, {x: -1920, y: -107, width: 1919, height: 1001}, {x: 0, y: 0, width: 2560, height: 720}, {x: 0, y: 0, width: 1920, height: 1080}]) {
            assert.deepEqual(gridShape(6, a), [3, 3]);
            assert.deepEqual(gridShape(8, a), [4, 4]);
        }
    });
    test('chooses shapes from the monitor aspect', () => {
        const wide = {x: 0, y: 0, width: 5120, height: 1440};
        assert.deepEqual(gridShape(4, wide), [4]);
        assert.deepEqual(gridShape(9, wide), [3, 3, 3]);
        assert.deepEqual(gridShape(10, wide), [5, 5]);
        assert.deepEqual(gridShape(12, wide), [6, 6]);
        assert.deepEqual(gridShape(16, wide), [8, 8]);
        const hd = {x: 0, y: 0, width: 1920, height: 1080};
        assert.deepEqual(gridShape(4, hd), [2, 2]);
        assert.deepEqual(gridShape(12, hd), [4, 4, 4]);
        assert.deepEqual(gridShape(16, hd), [4, 4, 4, 4]);
    });
    test('ragged fit rows', () => {
        const wide = {x: 0, y: 0, width: 5120, height: 1440};
        const ragged = {ragged: true};
        assert.deepEqual(gridShape(11, wide, ragged), [6, 5]);
        assert.deepEqual(gridShape(7, wide, ragged), [4, 3]);
        assert.deepEqual(gridShape(5, wide, ragged), [3, 2]);
        assert.deepEqual(gridShape(3, wide, ragged), [3]);
        assert.deepEqual(gridShape(2, wide, ragged), [2]);
        assert.deepEqual(gridShape(1, wide, ragged), [1]);
        for (const a of [wide, area, {x: 0, y: 0, width: 1920, height: 1080}, {x: 0, y: 0, width: 1080, height: 1920}]) {
            for (let count = 1; count <= MAX_WINDOWS; count++) {
                const shape = gridShape(count, a, ragged);
                assert.ok(shape.every(n => n > 0), `no empty row for ${count}`);
                assert.equal(shape.reduce((x, y) => x + y, 0), count);
                const cells = gridCells(count, a, ragged);
                assert.equal(cells.length, count);
                assert.equal(cells.reduce((total, rect) => total + rect.width * rect.height, 0), a.width * a.height);
            }
        }
    });
    test('rejects unsupported count, fractional and missing work areas', () => {
        assert.throws(() => gridCells(5, area));
        assert.throws(() => gridCells(17, area, {ragged: true}));
        assert.doesNotThrow(() => gridCells(5, area, {ragged: true}));
        assert.throws(() => gridCells(0, area, {ragged: true}));
        assert.throws(() => gridCells(1.5, area, {ragged: true}));
        assert.throws(() => gridShape(0, area));
        assert.throws(() => gridCells(6, null));
        assert.throws(() => gridCells(8, {...area, width: 0}));
        assert.throws(() => gridCells(16, {x: 0, y: 0, width: 3, height: 1}));
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
    test('fit tiles exactly the matching windows', () => {
        const windows = Array.from({length: 9}, () => window());
        const matching = new Set([windows[1], windows[4], windows[7]]);
        const plan = planGrid(FIT, {...context, windows}, 0, w => matching.has(w));
        assert.equal(plan.count, 3);
        assert.equal(plan.eligible, 3);
        assert.equal(plan.overflow, 0);
        assert.deepEqual(plan.rows, gridShape(3, area, {ragged: true}));
        assert.equal(plan.moves.length, 3);
        assert.ok(plan.moves.every(move => matching.has(move.window)));
        assert.ok(!plan.moves.some(move => move.window === windows[0]));
    });
    test('fit caps at MAX_WINDOWS', () => {
        const windows = Array.from({length: 20}, () => window());
        const plan = planGrid(FIT, {...context, windows});
        assert.equal(plan.moves.length, 16);
        assert.equal(plan.count, 16);
        assert.equal(plan.overflow, 4);
    });
    test('fit with one window fills the work area', () => {
        const plan = planGrid(FIT, {...context, windows: [window()]});
        assert.equal(plan.moves.length, 1);
        assert.deepEqual(plan.moves[0].rect, area);
        assert.deepEqual(plan.rows, [1]);
    });
    test('fit with no matches returns no moves', () => {
        const plan = planGrid(FIT, {...context, windows: [window(), window()]}, 0, () => false);
        assert.equal(plan.moves.length, 0);
        assert.equal(plan.count, 0);
        assert.equal(plan.eligible, 0);
        assert.equal(plan.overflow, 0);
        assert.deepEqual(plan.rows, []);
    });
    test('fixed layouts with no windows return the empty plan', () => {
        const plan = planGrid(6, {...context, windows: []});
        assert.equal(plan.moves.length, 0);
    });
    test('focused window first only when it matches', () => {
        const windows = Array.from({length: 4}, () => window());
        const rect = i => () => ({x: 100 + i * 10, y: 40, width: 500, height: 400});
        windows.forEach((w, i) => { w.get_frame_rect = rect(i); });
        const only = new Set([windows[0], windows[1], windows[2]]);
        const filtered = planGrid(6, {...context, windows, focusWindow: windows[3]}, 0, w => only.has(w));
        assert.ok(!filtered.moves.some(move => move.window === windows[3]));
        // With 12 matching windows capped at 6, the focused match is kept.
        const many = Array.from({length: 8}, () => window());
        const kept = planGrid(6, {...context, windows: many, focusWindow: many[7]}, 0, () => true);
        assert.ok(kept.moves.some(move => move.window === many[7]));
        const dropped = planGrid(6, {...context, windows: many, focusWindow: many[7]}, 0, w => w !== many[7]);
        assert.ok(!dropped.moves.some(move => move.window === many[7]));
    });
    test('focusWindow is the focused window when chosen, else the most recent chosen window', () => {
        // MRU order is the input order; the spatial sort puts windows[1] first.
        const at = x => window({get_frame_rect: () => ({x, y: 40, width: 500, height: 400})});
        const windows = [at(3000), at(100), at(1500), at(2200)];
        const focused = planGrid(FIT, {...context, windows, focusWindow: windows[2]});
        assert.equal(focused.focusWindow, windows[2]);
        assert.equal(focused.moves[0].window, windows[1]);
        // The focused window is filtered out: the most recent match, not the leftmost.
        const matching = new Set([windows[0], windows[1], windows[2]]);
        const filtered = planGrid(FIT, {...context, windows, focusWindow: windows[3]}, 0, w => matching.has(w));
        assert.ok(!filtered.moves.some(move => move.window === windows[3]));
        assert.equal(filtered.focusWindow, windows[0]);
        assert.equal(filtered.moves[0].window, windows[1]);
        // An ineligible focused window (another monitor) is never the focus target.
        const elsewhere = window({get_monitor: () => 1});
        assert.equal(planGrid(6, {...context, windows: [elsewhere, ...windows], focusWindow: elsewhere}).focusWindow, windows[0]);
        assert.equal(planGrid(FIT, {...context, windows, focusWindow: windows[0]}, 0, () => false).focusWindow, null);
    });
    test('spatial order uses three rows for a 3-row shape', () => {
        const hd = {x: 0, y: 0, width: 1920, height: 1080};
        const at = (x, y) => window({get_frame_rect: () => ({x, y, width: 400, height: 300})});
        const grid = [at(0, 0), at(800, 0), at(1500, 0), at(0, 400), at(800, 400), at(1500, 400), at(0, 800), at(800, 800), at(1500, 800)];
        const shuffled = [grid[8], grid[3], grid[1], grid[6], grid[0], grid[5], grid[2], grid[7], grid[4]];
        const plan = planGrid(9, {workspace, monitor: 0, workArea: hd, windows: shuffled});
        assert.deepEqual(plan.rows, [3, 3, 3]);
        assert.deepEqual(plan.moves.map(move => move.window), grid);
    });
});
