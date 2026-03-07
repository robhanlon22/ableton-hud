# Execution Plans

Execution plans are repository artifacts for work that is multi-step, spans
subsystems, or needs explicit acceptance criteria before editing.

Directory layout:

- `docs/exec-plans/active/`: plans for work in progress
- `docs/exec-plans/completed/`: plans that have shipped
- `docs/exec-plans/tech-debt-tracker.md`: follow-up items that should not be
  lost

Filename convention:

- `YYYY-MM-DD-short-slug.md`

Each plan should include:

- Context and scope
- Non-goals
- Constraints or invariants
- Ordered implementation steps
- Validation commands
- Exit criteria
