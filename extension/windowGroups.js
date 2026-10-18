/**
 * Pure program-type classification for the window filter. A GNOME adapter
 * builds the plain app description; groups are Terminals, one per app, one
 * per WM class for windows without a desktop file, and Other. An empty
 * selection means all windows.
 */
export const TERMINALS = 'terminals';
const OTHER = 'other';
const OTHER_LABEL = 'Other windows';

// Lowercase WM classes of terminals that may lack a desktop file.
const TERMINAL_CLASSES = Object.freeze([
    'gnome-terminal', 'gnome-terminal-server', 'org.gnome.terminal', 'org.gnome.console', 'kgx',
    'org.gnome.ptyxis', 'ptyxis', 'xfce4-terminal', 'mate-terminal', 'lxterminal', 'qterminal',
    'urxvt', 'rxvt', 'st-256color', 'org.wezfurlong.wezterm', 'wezterm', 'com.mitchellh.ghostty',
    'ghostty', 'terminator', 'tilix', 'konsole', 'kitty', 'alacritty', 'foot', 'footclient',
    'xterm', 'guake', 'tilda', 'sakura', 'blackbox', 'com.raggesilver.blackbox',
]);

function hasTerminalCategory(categories) {
    const list = Array.isArray(categories) ? categories : String(categories ?? '').split(';');
    return list.includes('TerminalEmulator');
}

/** Group `{id, label}` for a plain `{appId, appName, hasAppInfo, categories, wmClass}`. */
export function classifyWindow({appId, appName, hasAppInfo, categories, wmClass} = {}) {
    const cls = typeof wmClass === 'string' ? wmClass.trim() : '';
    if (hasAppInfo && hasTerminalCategory(categories) || TERMINAL_CLASSES.includes(cls.toLowerCase()))
        return {id: TERMINALS, label: 'Terminals'};
    if (hasAppInfo && appId)
        return {id: `app:${appId}`, label: appName || appId};
    if (cls)
        return {id: `class:${cls.toLowerCase()}`, label: appName || cls};
    return {id: OTHER, label: OTHER_LABEL};
}

export function defaultLabel(id) {
    if (id === TERMINALS)
        return 'Terminals';
    if (id.startsWith('app:'))
        return id.slice(4).replace(/\.desktop$/, '');
    if (id.startsWith('class:'))
        return id.slice(6);
    return OTHER_LABEL;
}

function safeGroup(window, groupFor) {
    try {
        return groupFor(window);
    } catch (_e) {
        return {id: OTHER, label: OTHER_LABEL};
    }
}

/**
 * Rows `{id, label, count, selected}`: Terminals first, then count
 * descending, then label. Selected groups with no windows follow, count 0.
 */
export function summarizeGroups(windows, groupFor, selected = [], labelFor = defaultLabel) {
    const rows = new Map();
    for (const window of windows) {
        const {id, label} = safeGroup(window, groupFor);
        const row = rows.get(id);
        if (row)
            row.count++;
        else
            rows.set(id, {id, label, count: 1, selected: selected.includes(id)});
    }
    const present = [...rows.values()].sort((a, b) =>
        (b.id === TERMINALS) - (a.id === TERMINALS) || b.count - a.count || a.label.localeCompare(b.label));
    const absent = [...new Set(selected)].filter(id => !rows.has(id))
        .map(id => ({id, label: labelFor(id), count: 0, selected: true}))
        .sort((a, b) => a.label.localeCompare(b.label));
    return [...present, ...absent];
}

/** Predicate for windows in the selected groups; a throwing `groupFor` means no match. */
export function windowMatcher(selected, groupFor) {
    if (!selected.length)
        return () => true;
    const ids = new Set(selected);
    return window => {
        try {
            return ids.has(groupFor(window).id);
        } catch (_e) {
            return false;
        }
    };
}

export function toggleGroup(selected, id) {
    return selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id];
}

/** Labels joined with ` + `, or null when everything is shown. */
export function describeFilter(selected, labelFor = defaultLabel) {
    return selected.length ? selected.map(labelFor).join(' + ') : null;
}
