// Test-only: lets run.py drive the isolated headless shell via org.gnome.Shell.Eval.
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

export default class TestDriverExtension extends Extension {
    enable() {
        global.context.unsafe_mode = true;
    }

    disable() {
        global.context.unsafe_mode = false;
    }
}
