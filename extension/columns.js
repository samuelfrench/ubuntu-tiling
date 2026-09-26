/**
 * Pure column planner for tiling-columns. No imports, so it runs under
 * both GJS and node. Rect inputs may be plain objects or objects exposing
 * x/y/width/height as getters (e.g. Mtk.Rectangle); only those four
 * properties are read and inputs are never mutated.
 */

export const MIN_COLUMN_WIDTH = 400;
export const EDGE_TOLERANCE = 2;

/**
 * @param {{x: number, y: number, width: number, height: number}} a
 * @param {{x: number, y: number, width: number, height: number}} b
 * @returns {boolean} whether `a` and `b` have exactly the same position
 *      and size. False if either is missing.
 */
export function sameRect(a, b) {
    if (!a || !b)
        return false;

    return a.x === b.x && a.y === b.y &&
        a.width === b.width && a.height === b.height;
}

/**
 * @param {number} value
 * @param {number} target
 * @returns {boolean} whether `value` is within `EDGE_TOLERANCE` of `target`.
 *      NaN is never near anything.
 */
function isNear(value, target) {
    return Math.abs(value - target) <= EDGE_TOLERANCE;
}

/**
 * Plans inserting a window as a new leftmost or rightmost column next to
 * 2 or more full-height columns that together span the work area. The
 * existing columns shrink proportionally, keeping their relative widths.
 *
 * @param {{x: number, y: number, width: number, height: number}} workArea
 * @param {{id: *, rect: {x: number, y: number, width: number, height: number}}[]} tiles
 *      the existing columns in any order. `id` is opaque and returned as is.
 * @param {'left'|'right'} side where the new column goes.
 * @returns {{
 *      slot: {x: number, y: number, width: number, height: number},
 *      moves: {id: *, rect: {x: number, y: number, width: number, height: number}}[]
 * }|null} the new column's rect and the new rects of the existing columns
 *      sorted by x, or null if the layout doesn't qualify or any column
 *      would be narrower than `MIN_COLUMN_WIDTH`.
 */
export function planColumnInsert(workArea, tiles, side) {
    if (side !== 'left' && side !== 'right')
        return null;

    if (!tiles || tiles.length < 2)
        return null;

    const wa = {
        x: workArea.x,
        y: workArea.y,
        width: workArea.width,
        height: workArea.height,
    };
    const columns = Array.from(tiles, ({ id, rect }) => ({
        id,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
    })).sort((a, b) => a.x - b.x);

    const waBottom = wa.y + wa.height;
    const fullHeight = columns.every(c =>
        isNear(c.y, wa.y) && isNear(c.y + c.height, waBottom));
    if (!fullHeight)
        return null;

    if (!isNear(columns[0].x, wa.x))
        return null;

    for (let i = 1; i < columns.length; i++) {
        const prev = columns[i - 1];
        if (!isNear(columns[i].x, prev.x + prev.width))
            return null;
    }

    const last = columns[columns.length - 1];
    if (!isNear(last.x + last.width, wa.x + wa.width))
        return null;

    const slotWidth = Math.floor(wa.width / (columns.length + 1));
    if (!(slotWidth >= MIN_COLUMN_WIDTH))
        return null;

    const remaining = wa.width - slotWidth;
    const base = side === 'left' ? wa.x + slotWidth : wa.x;
    const edges = columns.map((c, i) => i === 0
        ? base
        : base + Math.round((c.x - wa.x) * remaining / wa.width));
    edges.push(base + remaining);

    const moves = [];
    for (let i = 0; i < columns.length; i++) {
        const width = edges[i + 1] - edges[i];
        if (!(width >= MIN_COLUMN_WIDTH))
            return null;

        moves.push({
            id: columns[i].id,
            rect: { x: edges[i], y: wa.y, width, height: wa.height },
        });
    }

    const slot = {
        x: side === 'left' ? wa.x : wa.x + remaining,
        y: wa.y,
        width: slotWidth,
        height: wa.height,
    };

    return { slot, moves };
}
