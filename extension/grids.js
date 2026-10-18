/**
 * Pure geometry and selection for the fixed 4 to 16 window layouts and the
 * fit layout, which sizes the grid to the matching windows. Shapes follow the
 * monitor aspect.
 */
export function copyRect(rect) {
    return rect ? {x: rect.x, y: rect.y, width: rect.width, height: rect.height} : null;
}

export const LAYOUTS = [4, 6, 8, 9, 10, 12, 16];
export const FIT = 'all';
export const MAX_WINDOWS = 16;

const TARGET_ASPECT = 4 / 3;

function validate(count, workArea, ragged) {
    if (!Number.isInteger(count) || count < 1 || count > MAX_WINDOWS ||
        !ragged && !LAYOUTS.includes(count))
        throw new Error('Choose a layout with 4 to 16 windows.');
    if (!workArea || !['x', 'y', 'width', 'height'].every(k => Number.isInteger(workArea[k])) ||
        workArea.width < 1 || workArea.height < 1)
        throw new Error('This monitor has no usable work area.');
}

/**
 * Windows per row, top to bottom. Picks the row count whose cells come
 * closest to a 4:3 aspect on this monitor; ties keep fewer rows. Ragged
 * shapes (the fit layout) let the last rows hold one window fewer.
 */
export function gridShape(count, workArea, {ragged = false} = {}) {
    validate(count, workArea, ragged);
    let best = null;
    for (let rows = 1; rows <= count; rows++) {
        const columns = Math.ceil(count / rows);
        if (!ragged && columns * rows !== count)
            continue;
        if ((rows - 1) * columns >= count)
            continue;
        const aspect = (workArea.width / columns) / (workArea.height / rows);
        const score = Math.abs(Math.log(aspect / TARGET_ASPECT));
        if (!best || score < best.score)
            best = {rows, score};
    }
    const base = Math.floor(count / best.rows);
    const extra = count % best.rows;
    return Array.from({length: best.rows}, (_, row) => base + (row < extra ? 1 : 0));
}

export function gridCells(count, workArea, {ragged = false} = {}) {
    const shape = gridShape(count, workArea, {ragged});
    if (workArea.width < Math.max(...shape) || workArea.height < shape.length)
        throw new Error('This monitor has no usable work area.');

    // Shared integer edges use every pixel exactly once, even at odd sizes
    // or on a monitor left/above the primary monitor.
    const rows = shape.length;
    return shape.flatMap((columns, row) => {
        const y = workArea.y + Math.floor(row * workArea.height / rows);
        const height = workArea.y + Math.floor((row + 1) * workArea.height / rows) - y;
        return Array.from({length: columns}, (_, column) => {
            const x = workArea.x + Math.floor(column * workArea.width / columns);
            return {x, y, width: workArea.x + Math.floor((column + 1) * workArea.width / columns) - x, height};
        });
    });
}

/** Input order is MRU. A sticky window counts as present on this workspace. */
export function eligibleWindows(windows, {workspace, monitor}, normalType = 0) {
    return [...new Set(windows)].filter(window => {
        try {
            return window.get_window_type() === normalType &&
                !window.minimized && !window.is_skip_taskbar() &&
                window.get_monitor() === monitor &&
                (window.get_workspace() === workspace || window.is_on_all_workspaces()) &&
                (window.get_maximized() || window.is_fullscreen() ||
                    window.allows_move() && window.allows_resize());
        } catch {
            // A window can close while the picker is open.
            return false;
        }
    });
}

/** `layout` is a LAYOUTS count or FIT; `matches` narrows the windows considered. */
export function planGrid(layout, context, normalType = 0, matches = () => true) {
    const eligible = eligibleWindows(context.windows, context, normalType).filter(matches);
    const focusIndex = eligible.indexOf(context.focusWindow);
    if (focusIndex > 0)
        eligible.unshift(...eligible.splice(focusIndex, 1));
    const fit = layout === FIT;
    const count = fit ? Math.min(eligible.length, MAX_WINDOWS) : layout;
    if (!fit)
        validate(count, context.workArea, false);
    if (!count)
        return {moves: [], overflow: 0, eligible: eligible.length, count: 0, rows: []};
    const rows = gridShape(count, context.workArea, {ragged: fit});
    const cells = gridCells(count, context.workArea, {ragged: fit});
    const chosen = eligible.slice(0, count);
    // Select by recency first, then retain the visible left-to-right order
    // within each band of the monitor.
    const {y, height} = context.workArea;
    const bands = rows.length;
    const positions = new Map(chosen.map(window => [window, window.get_frame_rect()]));
    const band = rect => Math.min(bands - 1, Math.max(0, Math.ceil((rect.y + rect.height / 2 - y) * bands / height) - 1));
    chosen.sort((a, b) => {
        const ar = positions.get(a);
        const br = positions.get(b);
        return band(ar) - band(br) || ar.x - br.x || ar.y - br.y;
    });
    return {
        moves: chosen.map((window, index) => ({window, rect: cells[index]})),
        overflow: Math.max(0, eligible.length - count),
        eligible: eligible.length,
        count,
        rows,
    };
}

/** TA keeps intended geometry; the real frame can still refuse a size. */
export function fitsCell(frame, cell, tolerance = 2) {
    return frame && frame.width > 0 && frame.height > 0 &&
        frame.x >= cell.x - tolerance && frame.y >= cell.y - tolerance &&
        frame.x + frame.width <= cell.x + cell.width + tolerance &&
        frame.y + frame.height <= cell.y + cell.height + tolerance;
}
