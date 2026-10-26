// Mutter 49 renamed the state getter and removed the flags argument from
// maximize()/unmaximize(). Keep the flags representation used by our saved
// layouts so both full and single-axis maximization survive Undo on 46 and 50.
export function maximizedFlags(window) {
    return window.get_maximize_flags
        ? window.get_maximize_flags()
        : window.get_maximized();
}

export function unmaximizeWindow(window) {
    const flags = maximizedFlags(window);
    if (!flags)
        return;
    if (window.get_maximize_flags)
        window.unmaximize();
    else
        window.unmaximize(flags);
}

export function maximizeWindow(window, flags) {
    if (!flags)
        return;
    if (window.set_maximize_flags)
        window.set_maximize_flags(flags);
    else
        window.maximize(flags);
}

/** Distinguish TA's full-axis tile constraints from a later native maximize. */
export function needsNativeRestore(state, workArea) {
    if (state.fullscreen)
        return true;
    if (!state.maximized)
        return false;
    if (!state.isTiled || !state.tiledRect)
        return true;
    const rect = state.tiledRect;
    // Meta.MaximizeFlags.HORIZONTAL = 1, VERTICAL = 2 on both supported APIs.
    const tileFlags = (rect.x === workArea.x && rect.width === workArea.width ? 1 : 0) |
        (rect.y === workArea.y && rect.height === workArea.height ? 2 : 0);
    return state.maximized !== tileFlags;
}
