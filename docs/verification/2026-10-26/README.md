# Ubuntu upgrade recovery verification

Runtime source commit **80e3a0e56fdeec49b263c539e8907f0380de9136**, extension version 4, tested on Ubuntu 26.04.1 / GNOME Shell 50.1 / Ubuntu Tiling Assistant 54. All 11 runtime source files byte-match the private native test installation; SHA-256 values are in `runtime-sha256.json`.

The upgraded live desktop rejected v3 as OUT OF DATE because metadata declared only GNOME 46. The port adds GNOME 50, adapts changed window maximization APIs, uses stable Tiling Assistant settings/shortcut strings after the old constants were removed, distinguishes TA axis-constrained tiles from independent native maximization for Undo, and refreshes FlowLayout's width-dependent row measurement before allocating the program chips.

## Gates

- `node --test tests/*.test.mjs`: 137 passed.
- `python3 tests/integration/test_run_offline.py`: 10 passed.
- `node --test scripts/todo/__tests__/*.test.mjs`: 27 passed.
- `node scripts/todo/build.mjs --check`: passed.
- `python3 tests/integration/install.py`: isolated install/reinstall/uninstall passed; runtime bytes, schemas and unrelated settings preserved.
- Strict schema compilation, metadata JSON, Bash/JS syntax and `git diff --check`: passed.
- `tests/integration/run.py --keep`: PASS, stock `/tmp/ut-stock-zi8mi3hu`, extension `/tmp/ut-columns-688a538j`. Both use private D-Bus, XDG directories, runtime directory and dconf, software rendering and `--mode=user`. The live session was not used for native arrangement tests.
- Read-only task review: no blocking findings.

`stock-pass.json` and `gnome50-pass.json` retain the full native measurements. Both extensions are ACTIVE and the extension error list is empty. Real-pointer chip clicks hit StButton at height 28px. The visible picker is 648×649 for Terminals/All and 648×719 for the 12 layout, both unclipped on the 2560×720 test display. Screenshots are the four `picker-*.png` files. Current native verification is GNOME 50; GNOME 46 has legacy-API unit coverage plus the historical October 18 native receipt.

Three earlier native runs exposed real issues and were corrected before this PASS: removed TA constants; TA axis flags confusing native-state preparation/Undo; zero-height program chips; and native maximize/fullscreen layered over corner tiles. The last case reduced run 3 to two failures; `needsNativeRestore` and its regression matrix resolved them in run 4.

## Live installation

GitHub CI `40406347257` passed for pushed revision `8d30d29e697adf2efcf7038a4e7e98d6a699be34`. `./install.sh` installed v4; all 11 installed files match `runtime-sha256.json`, with a compiled schema. Previous files and session settings are backed up at `/home/sam/.local/state/ubuntu-tiling/gnome50-recovery-20261026/`.

Targeted activation remains pending. The session retains Shell PID 10586, cached v3 OUT OF DATE, stock Tiling Assistant ACTIVE and global extension-version validation enabled. Initial Looking Glass preflight worked, but later keyboard automation did not reliably reopen its visible controls. Sam was asked to open Alt+F2 → `lg` → Enter so the agent can finish. No reload expression was executed. The never-imported v3 copy can be reloaded with the internal extension manager through that built-in console; the deprecated D-Bus ReloadExtension method cannot do it. Do not toggle global version validation, because that reloads every extension. Live tray/picker restoration is not yet established.
