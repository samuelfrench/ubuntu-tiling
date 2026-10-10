/** Pure geometry and selection for the six/eight-window layouts. */
export function copyRect(rect) {
    return rect ? {x: rect.x, y: rect.y, width: rect.width, height: rect.height} : null;
}

export function gridCells(count, workArea) {
    if (count !== 6 && count !== 8)
        throw new Error('Choose a six- or eight-window layout.');
    const columns = count / 2;
    if (!workArea || !['x', 'y', 'width', 'height'].every(k => Number.isInteger(workArea[k])) ||
        workArea.width < columns || workArea.height < 2)
        throw new Error('This monitor has no usable work area.');

    // Shared integer edges use every pixel exactly once, even at odd sizes
    // or on a monitor left/above the primary monitor.
    return Array.from({length: count}, (_, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const x = workArea.x + Math.floor(column * workArea.width / columns);
        const y = workArea.y + Math.floor(row * workArea.height / 2);
        return {
            x, y,
            width: workArea.x + Math.floor((column + 1) * workArea.width / columns) - x,
            height: workArea.y + Math.floor((row + 1) * workArea.height / 2) - y,
        };
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

export function planGrid(count, context, normalType = 0) {
    const cells = gridCells(count, context.workArea);
    const eligible = eligibleWindows(context.windows, context, normalType);
    const focusIndex = eligible.indexOf(context.focusWindow);
    if (focusIndex > 0)
        eligible.unshift(...eligible.splice(focusIndex, 1));
    const chosen = eligible.slice(0, count);
    // Select by recency first, then retain the visible left-to-right order
    // within the upper and lower halves of the monitor.
    const midpoint = context.workArea.y + context.workArea.height / 2;
    const positions = new Map(chosen.map(window => [window, window.get_frame_rect()]));
    chosen.sort((a, b) => {
        const ar = positions.get(a);
        const br = positions.get(b);
        const row = rect => rect.y + rect.height / 2 > midpoint ? 1 : 0;
        return row(ar) - row(br) || ar.x - br.x || ar.y - br.y;
    });
    return {
        moves: chosen.map((window, index) => ({window, rect: cells[index]})),
        overflow: Math.max(0, eligible.length - count),
        eligible: eligible.length,
    };
}

/** TA keeps intended geometry; the real frame can still refuse a size. */
export function fitsCell(frame, cell, tolerance = 2) {
    return frame && frame.width > 0 && frame.height > 0 &&
        frame.x >= cell.x - tolerance && frame.y >= cell.y - tolerance &&
        frame.x + frame.width <= cell.x + cell.width + tolerance &&
        frame.y + frame.height <= cell.y + cell.height + tolerance;
}
