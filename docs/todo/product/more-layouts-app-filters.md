---
title: "More layouts and program-type filters"
status: now
area: product
due: null
updated: 2026-10-18
owner: agent
brief: "Building 4/9/10/12/16 + All layouts and a Terminals/ChatGPT/app filter on branch feature/layouts-filters"
refs:
  - "docs/superpowers/plans/2026-10-18-more-layouts-and-app-filters.md"
  - "extension/grids.js"
  - "extension/gridControls.js"
test: null
---

- **What:** Sam, 2026-10-18: "set it up so that there are more layout shortcut options (more windows) and can select program types (like terminal and chatgpt) when specifying the layout option to filter to." Sam then said "skip questions, build"; every design choice below is the agent's call.
- **Decisions:** fixed layouts 4, 6, 8, 9, 10, 12, 16 with monitor-aware shapes (target cell aspect 4:3; 6 and 8 stay 3×2 and 4×2); **All** layout sizes a ragged grid to the matching windows (max 16; 11 windows on 5120×1440 → 6+5). Program types: **Terminals** (desktop category `TerminalEmulator`, plus known terminal WM classes), otherwise one group per app (`app:<desktop id>`, e.g. ChatGPT = `app:chatgpt.desktop`) or WM class. Filter chosen in the picker as multi-select chips, saved to GSettings `window-filter` on Arrange, and used by every arrange shortcut. New shortcuts: Super+Alt+A (All), 4, 9, 0 (10), Shift+2 (12), Shift+6 (16).
- **Observed live 2026-10-18:** single monitor 5120×1440, X11, 2 workspaces; workspace 1 holds 11 gnome-terminal windows (`org.gnome.Terminal`), 3 Firefox, 1 ChatGPT (`WM_CLASS Chatgpt` → `/usr/share/applications/chatgpt.desktop`), Thunderbird, Text Editor, Grok Bot, Claude Usage Widget.
- **Risk found, not changed:** existing default `<Super><Alt>8` collides with GNOME's magnifier `<Alt><Super>8` (`org.gnome.settings-daemon.plugins.media-keys magnifier`). Which binding wins on the live session is unverified. New defaults were checked against all live keybinding schemas: no conflicts.
- **Next — agent:** execute the plan with subagents in worktree `/home/sam/claude-workspace/ubuntu-tiling-layouts` (branch `feature/layouts-filters`); ledger `.superpowers/sdd/2026-10-18-more-layouts-and-app-filters/progress.md` in that worktree. Native GNOME verification (plan Task 4) needs Sam's explicit go for an isolated test shell. Done = unit + install + native suites pass, merged to main, installed, Sam reloads GNOME (Alt+F2 `r`).
