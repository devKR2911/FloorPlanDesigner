---
name: phase
description: The planning and delivery workflow for this project's phases. Use when asked to plan, start, implement, check, record or commit a phase, when asked what the open questions or the status of a phase are, and when a change does not belong to any phase and needs a note in the plan.
---

# Phase workflow

Work is organised in numbered phases. `plan/project-setup-plan.md` holds the phase table, the decisions and the working rules; each phase has its own file, `plan/phase-N-<slug>.md`.

## 1. Plan

When asked to plan a phase, write the detailed plan into the phase file and set its status in the table to **Planned**. The file has, in this order:

1. `Status:` line with the date.
2. **Goal:** one paragraph, plus what still does not change on screen.
3. **What the reference project does:** only if `blueprint3d` (a sibling folder, reference only, never copied) was read for it, and what is kept or changed.
4. **Design:** where the code lives, data model changes, each module with its responsibilities, and the cases that get a test.
5. **Steps:** numbered, with an estimated size in lines including tests. One go-ahead covers all steps.
6. **How it will be checked:** the acceptance list; every line is run before the phase is called done.
7. **Not in this phase.**
8. **Open questions:** decisions that are cheap now and costly later, each with the default that will be implemented unless the user says otherwise.

Then reply with a short summary and the open questions. Wait for a go-ahead; confirming the defaults is not one. If asked "any other questions?", ask only what blocks the work and state the assumptions you will proceed on.

## 2. Implement

- Follow the steps in order; tests go in with the code they test.
- When a test fails, decide first whether the test or the code is wrong; say which it was in the report.
- Run the full check (`dev-environment` skill) and the acceptance list, including a headless Chrome check for anything visible (`browser-check` skill).

## 3. Record

Add a **Result** section at the top of the phase file, under the status line, with:

- **What was checked:** the acceptance list as it was actually run, with numbers (test counts, sizes, timings).
- **Where the result differs from the plan:** every deviation, each with its reason.
- **Open questions, as decided.**

Update the status line to done, and the table to **Done**. Changes made outside a phase later (bug fixes, small features) get a dated bullet under a `## Later changes` heading at the end of the phase file they touch.

## 4. Commit, only when asked

- Never commit or push on your own. "Implement, don't commit" is the usual request.
- When asked, make several commits grouped by layer and in dependency order: shared schema, engine model, engine editor or view, backend, web app, then the plan files. Each subject line names what changed; bodies explain why when it is not obvious.
- End commit messages with the attribution trailer the session specifies.
- Push only when asked; report the commit hashes in a table.

## Reporting

End with: what was built (by file), how it was checked, where it differs from the plan, and what the next phase is. Report failures with their output; do not round up.
