from ubuntu_tiling.overlay import EDITOR_SHORTCUTS, PICKER_SHORTCUTS, SNAP_SHORTCUTS, zone_shortcut


def test_snap_shortcuts_are_super_alt():
    keys = {key for key, _label in SNAP_SHORTCUTS}
    assert "Super+Alt+E" in keys
    assert "Super+Alt+Space" in keys
    assert "Super+Alt+1..9" in keys


def test_editor_shortcuts_include_save_and_presets():
    keys = {key for key, _label in EDITOR_SHORTCUTS}
    assert "Enter" in keys
    assert "Esc" in keys
    assert "2 3 4 5" in keys


def test_zone_shortcut_maps_ids():
    assert zone_shortcut("1") == "Super+Alt+1"
    assert zone_shortcut("9") == "Super+Alt+9"
    assert zone_shortcut("+") is None


def test_picker_lists_digit_keys():
    assert any(key == "1..9" for key, _label in PICKER_SHORTCUTS)
