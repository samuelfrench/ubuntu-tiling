import test from 'node:test';
import assert from 'node:assert/strict';
import {
    TERMINALS, classifyWindow, defaultLabel, summarizeGroups, windowMatcher,
    toggleGroup, describeFilter,
} from '../extension/windowGroups.js';

const terminal = {id: 'terminals', label: 'Terminals'};
const chatgpt = {id: 'app:chatgpt.desktop', label: 'ChatGPT'};
const grok = {id: 'class:grok-bot', label: 'Grok Bot'};
const other = {id: 'other', label: 'Other windows'};

test('TERMINALS is the terminals group id', () => {
    assert.equal(TERMINALS, 'terminals');
});

test('TerminalEmulator category is a terminal (array and desktop-file string)', () => {
    const base = {appId: 'org.gnome.Terminal.desktop', appName: 'Terminal', hasAppInfo: true, wmClass: 'Gnome-terminal'};
    assert.deepEqual(classifyWindow({...base, categories: ['GNOME', 'GTK', 'System', 'TerminalEmulator']}), terminal);
    assert.deepEqual(classifyWindow({...base, categories: 'GNOME;GTK;System;TerminalEmulator;'}), terminal);
});

test('known terminal WM classes without app info are terminals, case-insensitively', () => {
    for (const wmClass of ['kitty', 'Alacritty', 'org.wezfurlong.wezterm', 'foot', 'xterm',
        'com.mitchellh.ghostty', 'org.gnome.Ptyxis', 'konsole', 'tilix', 'terminator',
        'xfce4-terminal', 'XTERM', 'Gnome-terminal-server'])
        assert.deepEqual(classifyWindow({appId: 'window:1', appName: 'x', hasAppInfo: false, categories: [], wmClass}),
            terminal, wmClass);
});

test('an app with a desktop file gets its own group', () => {
    assert.deepEqual(classifyWindow({
        appId: 'chatgpt.desktop', appName: 'ChatGPT', hasAppInfo: true,
        categories: ['Utility', 'Development'], wmClass: 'Chatgpt',
    }), chatgpt);
});

test('app with a desktop file but no name labels with the desktop id', () => {
    assert.deepEqual(classifyWindow({appId: 'x.desktop', hasAppInfo: true, wmClass: 'X'}),
        {id: 'app:x.desktop', label: 'x.desktop'});
});

test('window-backed app groups by lowercase WM class', () => {
    assert.deepEqual(classifyWindow({
        appId: 'window:42', appName: 'Grok Bot', hasAppInfo: false, categories: [], wmClass: 'grok-bot',
    }), grok);
    assert.deepEqual(classifyWindow({hasAppInfo: false, wmClass: 'Foo'}), {id: 'class:foo', label: 'Foo'});
});

test('nothing usable falls back to other', () => {
    assert.deepEqual(classifyWindow({hasAppInfo: false, wmClass: ''}), other);
    assert.deepEqual(classifyWindow({}), other);
    assert.deepEqual(classifyWindow({hasAppInfo: true, appId: '', wmClass: null}), other);
});

test('defaultLabel', () => {
    assert.equal(defaultLabel('terminals'), 'Terminals');
    assert.equal(defaultLabel('app:chatgpt.desktop'), 'chatgpt');
    assert.equal(defaultLabel('class:grok-bot'), 'grok-bot');
    assert.equal(defaultLabel('other'), 'Other windows');
});

const wins = [
    {n: 1, g: terminal}, {n: 2, g: chatgpt}, {n: 3, g: chatgpt}, {n: 4, g: grok},
    {n: 5, g: chatgpt}, {n: 6, g: terminal}, {n: 7, g: {id: 'class:aaa', label: 'Aaa'}},
];
const groupFor = w => w.g;

test('summarizeGroups orders Terminals first, then count, then label', () => {
    const rows = summarizeGroups(wins, groupFor);
    assert.deepEqual(rows.map(r => [r.id, r.label, r.count, r.selected]), [
        ['terminals', 'Terminals', 2, false],
        ['app:chatgpt.desktop', 'ChatGPT', 3, false],
        ['class:aaa', 'Aaa', 1, false],
        ['class:grok-bot', 'Grok Bot', 1, false],
    ]);
});

test('Terminals stays first even with fewer windows', () => {
    const rows = summarizeGroups([wins[0], wins[1], wins[2]], groupFor);
    assert.deepEqual(rows.map(r => r.id), ['terminals', 'app:chatgpt.desktop']);
});

test('summarizeGroups flags selected groups and lists absent selected groups last', () => {
    const rows = summarizeGroups(wins, groupFor, ['class:grok-bot', 'app:gone.desktop', 'terminals'],
        id => id === 'app:gone.desktop' ? 'Gone' : defaultLabel(id));
    assert.deepEqual(rows.map(r => [r.id, r.count, r.selected]), [
        ['terminals', 2, true],
        ['app:chatgpt.desktop', 3, false],
        ['class:aaa', 1, false],
        ['class:grok-bot', 1, true],
        ['app:gone.desktop', 0, true],
    ]);
    assert.equal(rows.at(-1).label, 'Gone');
});

test('groupFor errors are not fatal', () => {
    const throwing = w => {
        if (w.n === 4) throw new Error('window closed');
        return w.g;
    };
    const rows = summarizeGroups(wins, throwing);
    assert.deepEqual(rows.find(r => r.id === 'other'), {id: 'other', label: 'Other windows', count: 1, selected: false});
    assert.equal(windowMatcher(['class:grok-bot'], throwing)(wins[3]), false);
    assert.equal(windowMatcher(['terminals'], throwing)(wins[0]), true);
});

test('windowMatcher: empty selection matches everything', () => {
    const match = windowMatcher([], groupFor);
    assert.ok(wins.every(match));
    const throwing = () => { throw new Error('closed'); };
    assert.equal(windowMatcher([], throwing)(wins[0]), true);
});

test('windowMatcher matches only selected groups', () => {
    const match = windowMatcher(['terminals', 'app:chatgpt.desktop'], groupFor);
    assert.deepEqual(wins.filter(match).map(w => w.n), [1, 2, 3, 5, 6]);
});

test('toggleGroup returns a new array', () => {
    const a = ['a'];
    assert.deepEqual(toggleGroup(a, 'b'), ['a', 'b']);
    assert.deepEqual(a, ['a']);
    const ab = ['a', 'b'];
    assert.deepEqual(toggleGroup(ab, 'a'), ['b']);
    assert.deepEqual(ab, ['a', 'b']);
});

test('describeFilter', () => {
    assert.equal(describeFilter([]), null);
    const labels = {terminals: 'Terminals', 'app:chatgpt.desktop': 'ChatGPT'};
    assert.equal(describeFilter(['terminals', 'app:chatgpt.desktop'], id => labels[id]), 'Terminals + ChatGPT');
    assert.equal(describeFilter(['terminals']), 'Terminals');
});
