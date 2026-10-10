# TODO migration (2026-10-09)

Source: `TODO.md` at `63545d78f453817d96127c3ac363504c6b510f4c`, 91 lines, SHA-256 `f199ed37e9b6ae5aeac9b462a0a6cfeddacd3c68eaacc70b16fc88af20e4b4b4`. `TODO-archive.md` is an exact byte-for-byte copy, with no added heading or altered historical claim. The archive is historical; current tasks explicitly supersede its stale waiting-for-load snapshot and row-use assumption.

| Section | Source lines | Heading | Preserved destination |
|---|---|---|---|
| S000 | 1–4 | # ubuntu-tiling | `TODO-archive.md:1` (verbatim) |
| S001 | 5–22 | ## Current (2026-09-26) — `4b804d5` verified headless (14:20) and installed; awaiting Sam's live try | `TODO-archive.md:5` (verbatim) |
| S002 | 23–27 | ## Repo + install state | `TODO-archive.md:23` (verbatim) |
| S003 | 28–34 | ## Next steps | `TODO-archive.md:28` (verbatim) |
| S004 | 35–42 | ## Done (2026-09-26) | `TODO-archive.md:35` (verbatim) |
| S005 | 43–54 | ## Test isolation (tests/integration/run.py) — why each piece exists | `TODO-archive.md:43` (verbatim) |
| S006 | 55–61 | ## Incidents today (all resolved; kept so nobody repeats them) | `TODO-archive.md:55` (verbatim) |
| S007 | 62–68 | ## Ideas (not doing now) | `TODO-archive.md:62` (verbatim) |
| S008 | 69–78 | ## Rejected | `TODO-archive.md:69` (verbatim) |
| S009 | 79–85 | ## Known non-blocking failures / gotchas — check here BEFORE diagnosing | `TODO-archive.md:79` (verbatim) |
| S010 | 86–91 | ## Next session FIRST | `TODO-archive.md:86` (verbatim) |

The new task files retain active scope, deferred column expansion, possible unobserved dragged-window mismatch, optional headless CI, upstream contribution and historical rejected routes. The 2026-10-09 six/eight-grid task is distinct from September's 3/4/5 full-height columns. Original open checkbox count is 0; none can be lost. All 91 original lines, including blanks and repeated text, survive in the archive.

Reproduce accounting without changing the checkout:

```sh
git show 63545d78f453817d96127c3ac363504c6b510f4c:TODO.md > /tmp/ubuntu-tiling-original-todo.md
: > /tmp/ubuntu-tiling-empty-archive.md
cmp /tmp/ubuntu-tiling-original-todo.md TODO-archive.md
sha256sum /tmp/ubuntu-tiling-original-todo.md TODO-archive.md
node scripts/todo/migrate-monolith.mjs split /tmp/ubuntu-tiling-original-todo.md /tmp/ubuntu-tiling-todo-sections
node scripts/todo/migrate-monolith.mjs verify /tmp/ubuntu-tiling-original-todo.md . /tmp/ubuntu-tiling-empty-archive.md
node --test scripts/todo/__tests__/*.test.mjs
node scripts/todo/build.mjs --check
```

There is no deploy workflow. The existing always-on test workflow includes TODO tests and drift checks; adding docs paths-ignore to that only workflow would suppress validation of docs-only changes. No script previously wrote `TODO.md`; documentation pointers now explain task-file edits. No extension/runtime, integration harness, README or install script changed in this migration.
