#!/usr/bin/env bash
# Install (default) or uninstall the Tiling Assistant Columns extension for the current user.
#   ./install.sh            copy extension/ into ~/.local/share/gnome-shell/extensions and enable it
#   ./install.sh uninstall  disable it and remove the files
set -euo pipefail

UUID=tiling-columns@samuelfrench.github.io
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/extension"
DEST="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"

# Add or remove $UUID in a strv key of org.gnome.shell without touching other entries.
edit_list() {
    local key=$1 action=$2
    /usr/bin/python3 - "$key" "$action" "$UUID" <<'PY'
import ast, subprocess, sys
key, action, uuid = sys.argv[1:]
raw = subprocess.run(['gsettings', 'get', 'org.gnome.shell', key],
                     check=True, capture_output=True, text=True).stdout.strip()
items = [] if raw.startswith('@as') else list(ast.literal_eval(raw))
new = [i for i in items if i != uuid] + ([uuid] if action == 'add' else [])
if new != items:
    subprocess.run(['gsettings', 'set', 'org.gnome.shell', key, str(new)], check=True)
PY
}

case "${1:-install}" in
install)
    found=
    for dir in "${XDG_DATA_HOME:-$HOME/.local/share}" /usr/local/share /usr/share; do
        for ta in tiling-assistant@ubuntu.com tiling-assistant@leleat-on-github; do
            [ -f "$dir/gnome-shell/extensions/$ta/metadata.json" ] && found=$ta
        done
    done
    if [ -z "$found" ]; then
        echo "Tiling Assistant not found. On Ubuntu: sudo apt install gnome-shell-extension-ubuntu-tiling-assistant" >&2
        exit 1
    fi
    rm -rf "$DEST"
    mkdir -p "$DEST"
    cp "$SRC/metadata.json" "$SRC/extension.js" "$SRC/hooks.js" "$SRC/columns.js" "$DEST/"
    edit_list disabled-extensions remove
    edit_list enabled-extensions add
    echo "installed $DEST"
    if gnome-extensions info "$UUID" 2>/dev/null | grep -q 'State: ACTIVE'; then
        echo "GNOME Shell already runs an older copy; restart the shell to load this one."
    fi
    echo "Restart GNOME Shell to load it: X11 = Alt+F2, type r, Enter. Wayland = log out and back in."
    ;;
uninstall)
    gnome-extensions disable "$UUID" >/dev/null 2>&1 || true
    edit_list enabled-extensions remove
    rm -rf "$DEST"
    echo "removed $DEST"
    ;;
*)
    echo "usage: $0 [install|uninstall]" >&2
    exit 2
    ;;
esac
