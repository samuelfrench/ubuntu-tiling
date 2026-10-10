# Task files

`TODO.md` and `docs/todo/index.json` are generated. Edit `docs/todo/<area>/<slug>.md`, run `node scripts/todo/build.mjs`, and commit the task file and both generated outputs together. Update status and evidence in the same working beat as the work. Finished tasks move to `docs/todo/done/<area>/` when `status: done`; original historical evidence is in `TODO-archive.md`.

Every task begins with frontmatter containing `title`, `status`, `area`, `due` (date or `null`), `updated` (date), `owner` (`agent` or `sam`), `brief` (one line), `refs` (list) and `test` (`null` or exact failing command). Body: What, Why with observed evidence, Next with a reproducible command/file and done criterion. Keep paragraphs on one logical line.

- Status: `now`, `waiting-sam`, `scheduled`, `next`, `idea`, `known-failure`, `done`. Scheduled tasks require a due date; known failures require the failing command in `test` and the observed failure plus scope in the body. A possible unobserved defect is an idea, not a known failure.
- Area: `ci`, `infra`, `process`, `product`.
- Query: `node scripts/todo/query.mjs --status now,waiting-sam`, `--area ci`, `--due-before 2026-10-15`, `--test <name>` or `--grep <text> --all`.
- Validate: `node --test scripts/todo/__tests__/*.test.mjs` and `node scripts/todo/build.mjs --check`. CI runs both, including on docs-only pushes.
- Migration map and exact accounting commands: [migration-2026-10-09.md](migration-2026-10-09.md).

Capture deferred defects, rejected ideas with their reason/number, interrupted work and follow-ups when they arise. Verify current repository, installed extension, CI and live session evidence before reporting a snapshot as current. Never infer six/eight-grid proof from the archived September column proof.
