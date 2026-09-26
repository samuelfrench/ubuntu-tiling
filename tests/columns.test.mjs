import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
    EDGE_TOLERANCE,
    MIN_COLUMN_WIDTH,
    planColumnInsert,
    sameRect,
} from '../extension/columns.js';

const r = (x, y, width, height) => ({ x, y, width, height });

// Real host work area: 5120x1440 monitor, dock on the left, top bar above.
const HOST = r(66, 32, 5054, 1408);
const ORIGIN_3000 = r(0, 0, 3000, 800);

class GetterRect {
    #x;
    #y;
    #width;
    #height;

    constructor(x, y, width, height) {
        this.#x = x;
        this.#y = y;
        this.#width = width;
        this.#height = height;
    }

    get x() {
        return this.#x;
    }

    get y() {
        return this.#y;
    }

    get width() {
        return this.#width;
    }

    get height() {
        return this.#height;
    }
}

function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const key of Object.keys(value))
            deepFreeze(value[key]);
    }
    return value;
}

/** Full-height tiles laid out left to right from wa.x with the given widths. */
function columns(wa, widths, ids = widths.map((_, i) => `c${i}`)) {
    let x = wa.x;
    return widths.map((width, i) => {
        const tile = { id: ids[i], rect: r(x, wa.y, width, wa.height) };
        x += width;
        return tile;
    });
}

function tile(id, x, y, width, height) {
    return { id, rect: r(x, y, width, height) };
}

function assertPlainIntRect(rect) {
    assert.equal(Object.getPrototypeOf(rect), Object.prototype);
    assert.deepEqual(Object.keys(rect).sort(), ['height', 'width', 'x', 'y']);
    for (const value of Object.values(rect))
        assert.ok(Number.isInteger(value), `${value} is not an integer`);
}

/** slot + moves must tile the work area exactly: no gaps, no overlaps, full height. */
function assertTilesWorkArea(wa, plan) {
    assert.ok(plan, 'expected a plan, got null');
    const rects = [plan.slot, ...plan.moves.map(m => m.rect)]
        .sort((a, b) => a.x - b.x);
    let edge = wa.x;
    let total = 0;
    for (const rect of rects) {
        assertPlainIntRect(rect);
        assert.equal(rect.x, edge, 'gap or overlap between columns');
        assert.equal(rect.y, wa.y);
        assert.equal(rect.height, wa.height);
        assert.ok(rect.width >= MIN_COLUMN_WIDTH, `width ${rect.width} < ${MIN_COLUMN_WIDTH}`);
        edge += rect.width;
        total += rect.width;
    }
    assert.equal(edge, wa.x + wa.width);
    assert.equal(total, wa.width);
}

function widthPercents(wa, rects) {
    return rects.map(rect => Math.round(100 * rect.width / wa.width));
}

/** Deterministic PRNG (LCG) so the sweep is reproducible. */
function makeRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 2 ** 32;
    };
}

describe('constants', () => {
    test('MIN_COLUMN_WIDTH is 400 and EDGE_TOLERANCE is 2', () => {
        assert.equal(MIN_COLUMN_WIDTH, 400);
        assert.equal(EDGE_TOLERANCE, 2);
    });
});

describe('sameRect', () => {
    test('true for identical plain rects', () => {
        assert.equal(sameRect(r(1, 2, 3, 4), r(1, 2, 3, 4)), true);
    });

    test('false when any single field differs', () => {
        const base = r(10, 20, 300, 400);
        for (const key of ['x', 'y', 'width', 'height']) {
            const other = { ...base, [key]: base[key] + 1 };
            assert.equal(sameRect(base, other), false, key);
            assert.equal(sameRect(other, base), false, key);
        }
    });

    test('works with getter-only rects on either side', () => {
        const g = new GetterRect(66, 32, 1684, 1408);
        assert.equal(sameRect(g, r(66, 32, 1684, 1408)), true);
        assert.equal(sameRect(r(66, 32, 1684, 1408), g), true);
        assert.equal(sameRect(g, new GetterRect(66, 32, 1684, 1408)), true);
        assert.equal(sameRect(g, new GetterRect(66, 32, 1685, 1408)), false);
        assert.equal(sameRect(g, r(67, 32, 1684, 1408)), false);
    });

    test('ignores properties other than x/y/width/height', () => {
        assert.equal(sameRect({ ...r(1, 2, 3, 4), x2: 99 }, r(1, 2, 3, 4)), true);
    });

    test('false for missing rects', () => {
        assert.equal(sameRect(null, r(0, 0, 1, 1)), false);
        assert.equal(sameRect(r(0, 0, 1, 1), undefined), false);
        assert.equal(sameRect(null, null), false);
    });
});

describe('planColumnInsert: host work area 5054x1408+66+32', () => {
    const halves = () => [
        tile('A', 66, 32, 2527, 1408),
        tile('B', 2593, 32, 2527, 1408),
    ];

    test('A|B + right inserts a third column on the right', () => {
        const plan = planColumnInsert(HOST, halves(), 'right');
        assert.deepEqual(plan, {
            slot: r(3436, 32, 1684, 1408),
            moves: [
                { id: 'A', rect: r(66, 32, 1685, 1408) },
                { id: 'B', rect: r(1751, 32, 1685, 1408) },
            ],
        });
        assertTilesWorkArea(HOST, plan);
    });

    test('A|B + left inserts a third column on the left', () => {
        const plan = planColumnInsert(HOST, halves(), 'left');
        assert.deepEqual(plan, {
            slot: r(66, 32, 1684, 1408),
            moves: [
                { id: 'A', rect: r(1750, 32, 1685, 1408) },
                { id: 'B', rect: r(3435, 32, 1685, 1408) },
            ],
        });
        assertTilesWorkArea(HOST, plan);
    });

    test('50/50 + right then + left gives 33/33/33 then 25/25/25/25', () => {
        const first = planColumnInsert(HOST, halves(), 'right');
        assert.deepEqual(widthPercents(HOST, [...first.moves.map(m => m.rect), first.slot]),
            [33, 33, 33]);

        const three = [...first.moves, { id: 'C', rect: first.slot }];
        const second = planColumnInsert(HOST, three, 'left');
        assert.deepEqual(second, {
            slot: r(66, 32, 1263, 1408),
            moves: [
                { id: 'A', rect: r(1329, 32, 1264, 1408) },
                { id: 'B', rect: r(2593, 32, 1264, 1408) },
                { id: 'C', rect: r(3857, 32, 1263, 1408) },
            ],
        });
        assert.deepEqual(widthPercents(HOST, [second.slot, ...second.moves.map(m => m.rect)]),
            [25, 25, 25, 25]);
        assertTilesWorkArea(HOST, second);
    });

    test('uneven 60/40 + right keeps the ratio: 40/27/33', () => {
        const plan = planColumnInsert(HOST, columns(HOST, [3032, 2022]), 'right');
        assertTilesWorkArea(HOST, plan);
        assert.deepEqual(widthPercents(HOST, [...plan.moves.map(m => m.rect), plan.slot]),
            [40, 27, 33]);
    });

    test('three stock-tiled columns (1685/1685/1684) accept a fourth on either side', () => {
        const three = columns(HOST, [1685, 1685, 1684]);
        for (const side of ['left', 'right']) {
            const plan = planColumnInsert(HOST, three, side);
            assertTilesWorkArea(HOST, plan);
            assert.equal(plan.slot.width, 1263);
            assert.equal(plan.slot.x, side === 'left' ? 66 : 66 + 5054 - 1263);
            assert.deepEqual(plan.moves.map(m => m.id), ['c0', 'c1', 'c2']);
        }
    });

    test('allows up to 12 columns and rejects the 13th', () => {
        for (let n = 2; n <= 12; n++) {
            const width = Math.floor(HOST.width / n);
            const widths = Array(n).fill(width);
            widths[n - 1] = HOST.width - width * (n - 1);
            const plan = planColumnInsert(HOST, columns(HOST, widths), 'right');
            if (n <= 11)
                assertTilesWorkArea(HOST, plan);
            else
                assert.equal(plan, null, `n=${n} should fall back (slot ${Math.floor(HOST.width / 13)})`);
        }
    });

    test('does not mutate frozen plain inputs and returns fresh objects', () => {
        const wa = deepFreeze(r(66, 32, 5054, 1408));
        const tiles = deepFreeze(halves());
        const snapshot = JSON.stringify({ wa, tiles });
        const plan = planColumnInsert(wa, tiles, 'right');
        assert.equal(JSON.stringify({ wa, tiles }), snapshot);
        assert.notEqual(plan.slot, wa);
        for (const move of plan.moves) {
            assertPlainIntRect(move.rect);
            assert.ok(tiles.every(t => t.rect !== move.rect));
        }
    });
});

describe('planColumnInsert: 3000x800 work area at origin', () => {
    test('3 equal columns + right -> 4 equal columns', () => {
        const plan = planColumnInsert(ORIGIN_3000, columns(ORIGIN_3000, [1000, 1000, 1000]), 'right');
        assert.deepEqual(plan, {
            slot: r(2250, 0, 750, 800),
            moves: [
                { id: 'c0', rect: r(0, 0, 750, 800) },
                { id: 'c1', rect: r(750, 0, 750, 800) },
                { id: 'c2', rect: r(1500, 0, 750, 800) },
            ],
        });
        assertTilesWorkArea(ORIGIN_3000, plan);
    });

    test('3 equal columns + left -> 4 equal columns', () => {
        const plan = planColumnInsert(ORIGIN_3000, columns(ORIGIN_3000, [1000, 1000, 1000]), 'left');
        assert.deepEqual(plan, {
            slot: r(0, 0, 750, 800),
            moves: [
                { id: 'c0', rect: r(750, 0, 750, 800) },
                { id: 'c1', rect: r(1500, 0, 750, 800) },
                { id: 'c2', rect: r(2250, 0, 750, 800) },
            ],
        });
        assertTilesWorkArea(ORIGIN_3000, plan);
    });

    test('uneven 60/40 + right -> 1200/800 + slot 1000', () => {
        const plan = planColumnInsert(ORIGIN_3000, columns(ORIGIN_3000, [1800, 1200], ['A', 'B']), 'right');
        assert.deepEqual(plan, {
            slot: r(2000, 0, 1000, 800),
            moves: [
                { id: 'A', rect: r(0, 0, 1200, 800) },
                { id: 'B', rect: r(1200, 0, 800, 800) },
            ],
        });
    });

    test('uneven 60/40 + left -> slot 1000 + 1200/800', () => {
        const plan = planColumnInsert(ORIGIN_3000, columns(ORIGIN_3000, [1800, 1200], ['A', 'B']), 'left');
        assert.deepEqual(plan, {
            slot: r(0, 0, 1000, 800),
            moves: [
                { id: 'A', rect: r(1000, 0, 1200, 800) },
                { id: 'B', rect: r(2200, 0, 800, 800) },
            ],
        });
    });

    test('tiles in unsorted order produce moves sorted by x with original (object) ids', () => {
        const winA = { title: 'A' };
        const winB = { title: 'B' };
        const winC = { title: 'C' };
        const tiles = [
            tile(winC, 2000, 0, 1000, 800),
            tile(winA, 0, 0, 1000, 800),
            tile(winB, 1000, 0, 1000, 800),
        ];
        for (const side of ['left', 'right']) {
            const plan = planColumnInsert(ORIGIN_3000, tiles, side);
            assertTilesWorkArea(ORIGIN_3000, plan);
            assert.equal(plan.moves.length, 3);
            assert.equal(plan.moves[0].id, winA);
            assert.equal(plan.moves[1].id, winB);
            assert.equal(plan.moves[2].id, winC);
            assert.ok(plan.moves[0].rect.x < plan.moves[1].rect.x);
            assert.ok(plan.moves[1].rect.x < plan.moves[2].rect.x);
        }
        assert.equal(tiles[0].id, winC, 'input array order must not change');
    });
});

describe('planColumnInsert: edge tolerance', () => {
    test('a 1 px gap between columns still plans and uses the actual column x', () => {
        const tiles = [tile('A', 66, 32, 2527, 1408), tile('B', 2594, 32, 2526, 1408)];
        const plan = planColumnInsert(HOST, tiles, 'right');
        assert.deepEqual(plan, {
            slot: r(3436, 32, 1684, 1408),
            moves: [
                { id: 'A', rect: r(66, 32, 1686, 1408) },
                { id: 'B', rect: r(1752, 32, 1684, 1408) },
            ],
        });
        assertTilesWorkArea(HOST, plan);
    });

    test('a 2 px gap plans, a 3 px gap falls back', () => {
        const two = [tile('A', 0, 0, 1500, 800), tile('B', 1502, 0, 1498, 800)];
        assertTilesWorkArea(ORIGIN_3000, planColumnInsert(ORIGIN_3000, two, 'right'));
        const three = [tile('A', 0, 0, 1500, 800), tile('B', 1503, 0, 1497, 800)];
        assert.equal(planColumnInsert(ORIGIN_3000, three, 'right'), null);
        assert.equal(planColumnInsert(ORIGIN_3000, three, 'left'), null);
    });

    test('a 1 px overlap plans, a 3 px overlap falls back', () => {
        const one = [tile('A', 0, 0, 1501, 800), tile('B', 1500, 0, 1500, 800)];
        assertTilesWorkArea(ORIGIN_3000, planColumnInsert(ORIGIN_3000, one, 'left'));
        const three = [tile('A', 0, 0, 1503, 800), tile('B', 1500, 0, 1500, 800)];
        assert.equal(planColumnInsert(ORIGIN_3000, three, 'left'), null);
    });

    test('left edge offset of 2 px plans, 3 px falls back', () => {
        const two = [tile('A', 2, 0, 1498, 800), tile('B', 1500, 0, 1500, 800)];
        assertTilesWorkArea(ORIGIN_3000, planColumnInsert(ORIGIN_3000, two, 'right'));
        const three = [tile('A', 3, 0, 1497, 800), tile('B', 1500, 0, 1500, 800)];
        assert.equal(planColumnInsert(ORIGIN_3000, three, 'right'), null);
    });

    test('right edge short by 2 px plans, 3 px falls back', () => {
        const two = [tile('A', 0, 0, 1500, 800), tile('B', 1500, 0, 1498, 800)];
        assertTilesWorkArea(ORIGIN_3000, planColumnInsert(ORIGIN_3000, two, 'right'));
        const three = [tile('A', 0, 0, 1500, 800), tile('B', 1500, 0, 1497, 800)];
        assert.equal(planColumnInsert(ORIGIN_3000, three, 'right'), null);
    });

    test('top/bottom edges off by 2 px plan, 3 px fall back', () => {
        const topTwo = [tile('A', 0, 2, 1500, 798), tile('B', 1500, 0, 1500, 800)];
        assertTilesWorkArea(ORIGIN_3000, planColumnInsert(ORIGIN_3000, topTwo, 'right'));
        const topThree = [tile('A', 0, 3, 1500, 797), tile('B', 1500, 0, 1500, 800)];
        assert.equal(planColumnInsert(ORIGIN_3000, topThree, 'right'), null);
        const bottomTwo = [tile('A', 0, 0, 1500, 802), tile('B', 1500, 0, 1500, 800)];
        assertTilesWorkArea(ORIGIN_3000, planColumnInsert(ORIGIN_3000, bottomTwo, 'right'));
        const bottomThree = [tile('A', 0, 0, 1500, 797), tile('B', 1500, 0, 1500, 800)];
        assert.equal(planColumnInsert(ORIGIN_3000, bottomThree, 'right'), null);
    });
});

describe('planColumnInsert: fallbacks return null', () => {
    const both = (wa, tiles) => [
        planColumnInsert(wa, tiles, 'left'),
        planColumnInsert(wa, tiles, 'right'),
    ];

    test('0 tiles', () => {
        assert.deepEqual(both(ORIGIN_3000, []), [null, null]);
    });

    test('1 tile', () => {
        assert.deepEqual(both(ORIGIN_3000, [tile('A', 0, 0, 3000, 800)]), [null, null]);
    });

    test('a tile of half the work-area height', () => {
        const tiles = [tile('A', 0, 0, 1500, 800), tile('B', 1500, 0, 1500, 400)];
        assert.deepEqual(both(ORIGIN_3000, tiles), [null, null]);
        const lower = [tile('A', 0, 0, 1500, 800), tile('B', 1500, 400, 1500, 400)];
        assert.deepEqual(both(ORIGIN_3000, lower), [null, null]);
    });

    test('columns not reaching the right edge', () => {
        assert.deepEqual(both(ORIGIN_3000, columns(ORIGIN_3000, [1000, 1000])), [null, null]);
    });

    test('columns not reaching the left edge', () => {
        const tiles = [tile('A', 1000, 0, 1000, 800), tile('B', 2000, 0, 1000, 800)];
        assert.deepEqual(both(ORIGIN_3000, tiles), [null, null]);
    });

    test('overlapping columns', () => {
        const tiles = [tile('A', 0, 0, 1600, 800), tile('B', 1500, 0, 1500, 800)];
        assert.deepEqual(both(ORIGIN_3000, tiles), [null, null]);
    });

    test('two windows stacked in the same column', () => {
        const tiles = [tile('A', 0, 0, 3000, 800), tile('B', 0, 0, 3000, 800)];
        assert.deepEqual(both(ORIGIN_3000, tiles), [null, null]);
    });

    test('slot narrower than 400: 1920 wide with 4 columns gives 384', () => {
        const wa = r(0, 0, 1920, 1080);
        assert.deepEqual(both(wa, columns(wa, [480, 480, 480, 480])), [null, null]);
    });

    test('slot exactly 400 plans, 399 falls back', () => {
        const wa1200 = r(0, 0, 1200, 800);
        assertTilesWorkArea(wa1200, planColumnInsert(wa1200, columns(wa1200, [600, 600]), 'right'));
        const wa1199 = r(0, 0, 1199, 800);
        assert.deepEqual(both(wa1199, columns(wa1199, [600, 599])), [null, null]);
    });

    test('an existing narrow column that would drop below 400 while the slot is fine', () => {
        const plan = planColumnInsert(ORIGIN_3000, columns(ORIGIN_3000, [2500, 500]), 'right');
        assert.equal(plan, null, '500 * 2000/3000 = 333 < 400');
        assert.deepEqual(both(ORIGIN_3000, columns(ORIGIN_3000, [2500, 500])), [null, null]);
    });

    test('an existing column scaled to exactly 400 still plans', () => {
        const plan = planColumnInsert(ORIGIN_3000, columns(ORIGIN_3000, [2400, 600], ['A', 'B']), 'right');
        assert.deepEqual(plan.moves.map(m => m.rect.width), [1600, 400]);
        assertTilesWorkArea(ORIGIN_3000, plan);
    });

    test('invalid side', () => {
        const tiles = columns(ORIGIN_3000, [1500, 1500]);
        for (const side of ['top', 'bottom', 'Right', 'LEFT', '', undefined, null, 1])
            assert.equal(planColumnInsert(ORIGIN_3000, tiles, side), null, String(side));
    });

    test('a tile rect missing a field', () => {
        const tiles = [tile('A', 0, 0, 1500, 800), { id: 'B', rect: { x: 1500, y: 0, width: 1500 } }];
        assert.deepEqual(both(ORIGIN_3000, tiles), [null, null]);
    });
});

describe('planColumnInsert: getter-only rects', () => {
    test('reads x/y/width/height through getters, matches plain input, mutates nothing', () => {
        const wa = Object.freeze(new GetterRect(66, 32, 5054, 1408));
        const rectA = Object.freeze(new GetterRect(66, 32, 2527, 1408));
        const rectB = Object.freeze(new GetterRect(2593, 32, 2527, 1408));
        const tiles = Object.freeze([
            Object.freeze({ id: 'B', rect: rectB }),
            Object.freeze({ id: 'A', rect: rectA }),
        ]);

        for (const side of ['left', 'right']) {
            const plan = planColumnInsert(wa, tiles, side);
            const plain = planColumnInsert(HOST, [
                tile('A', 66, 32, 2527, 1408),
                tile('B', 2593, 32, 2527, 1408),
            ], side);
            assert.deepEqual(plan, plain);
            assertTilesWorkArea(HOST, plan);
            assertPlainIntRect(plan.slot);
            for (const move of plan.moves)
                assertPlainIntRect(move.rect);
        }

        assert.deepEqual([wa.x, wa.y, wa.width, wa.height], [66, 32, 5054, 1408]);
        assert.deepEqual([rectA.x, rectA.y, rectA.width, rectA.height], [66, 32, 2527, 1408]);
        assert.deepEqual([rectB.x, rectB.y, rectB.width, rectB.height], [2593, 32, 2527, 1408]);
        assert.equal(tiles[0].id, 'B');
    });
});

describe('planColumnInsert: randomized sweep', () => {
    const workAreas = [
        HOST,
        r(0, 0, 1920, 1080),
        r(0, 27, 2560, 1413),
        r(1920, 0, 3440, 1440),
        r(-1280, 100, 1280, 900),
        r(0, 32, 7680, 2128),
    ];

    test('every plan tiles the work area exactly and scales each column within 1 px', () => {
        const random = makeRandom(20260926);
        let planned = 0;
        for (const wa of workAreas) {
            for (let n = 2; n <= 8; n++) {
                for (let trial = 0; trial < 40; trial++) {
                    const weights = Array.from({ length: n }, () => 0.2 + random());
                    const sum = weights.reduce((a, b) => a + b, 0);
                    const widths = weights.map(w => Math.max(1, Math.floor(wa.width * w / sum)));
                    widths[n - 1] = wa.width - widths.slice(0, -1).reduce((a, b) => a + b, 0);
                    if (widths[n - 1] < 1)
                        continue;
                    const tiles = columns(wa, widths);

                    for (const side of ['left', 'right']) {
                        const plan = planColumnInsert(wa, tiles, side);
                        const slotWidth = Math.floor(wa.width / (n + 1));
                        if (slotWidth < MIN_COLUMN_WIDTH) {
                            assert.equal(plan, null);
                            continue;
                        }
                        if (plan === null) {
                            const remaining = wa.width - slotWidth;
                            assert.ok(widths.some(w => w * remaining / wa.width < MIN_COLUMN_WIDTH + 1),
                                `unexpected null for ${JSON.stringify({ wa, widths, side })}`);
                            continue;
                        }
                        planned++;
                        assertTilesWorkArea(wa, plan);
                        assert.equal(plan.slot.width, slotWidth);
                        assert.equal(plan.slot.x, side === 'left' ? wa.x : wa.x + wa.width - slotWidth);
                        assert.deepEqual(plan.moves.map(m => m.id), tiles.map(t => t.id));
                        const remaining = wa.width - slotWidth;
                        plan.moves.forEach((move, i) => {
                            const ideal = widths[i] * remaining / wa.width;
                            assert.ok(Math.abs(move.rect.width - ideal) <= 1,
                                `column ${i}: ${move.rect.width} vs ideal ${ideal}`);
                        });
                    }
                }
            }
        }
        assert.ok(planned > 500, `only ${planned} plans exercised`);
    });
});
