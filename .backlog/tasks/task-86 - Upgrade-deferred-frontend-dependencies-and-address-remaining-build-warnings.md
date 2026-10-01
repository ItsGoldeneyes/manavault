---
id: TASK-86
title: Upgrade deferred frontend dependencies and address remaining build warnings
status: Done
assignee:
  - '@cfbender'
created_date: '2026-10-01 13:14'
updated_date: '2026-10-01 13:25'
labels: []
dependencies: []
references:
  - >-
    https://github.com/aubepkg/aube/blob/v2.6.1/crates/aube/src/commands/audit.rs#L168-L175
type: chore
ordinal: 103000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The compatible dependency refresh is pushed. The remaining major upgrades and warning sources need compatibility checks rather than blind version bumps; preserve current app behavior and avoid suppressing real diagnostics.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Supported major dependency upgrades pass type checks, existing tests, and production build; blocked upgrades have documented reasons.
- [x] #2 Actionable project-owned build and test warnings are fixed without blanket suppression, with remaining upstream issues documented.
- [x] #3 Dependency audits and portal smoke checks cover the final dependency graph.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Review upstream migration notes and app usage for Vite Plus, Vitest, jsdom, Motion and KaTeX.
2. Upgrade supported packages and adapt project-owned config or code where required.
3. Investigate test-environment and bundle-size warnings, then verify full checks, audits and portal behavior.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Vite Plus 1.0.0, Vitest 5.0.3, jsdom 30.1.1 and Motion 13.5.0 pass 412 existing JS tests. Vitest 5 fixes the Node localStorage getter warning. KaTeX remains 0.16.47 because rehype-katex 7.0.1 requires ^0.16.0 and the directly imported CSS must match. Separate React runtime, Markdown and KaTeX chunks reduce app.js from 530 kB to 323 kB and decks from 829 kB to 401 kB without raising the warning threshold. Vite Plus exposes a distinct plugin type identity, so the config now uses upstream Vite types plus only the Vite Plus fmt/lint extension types instead of any casts.

Final validation: mise exec -- aube run precommit passed (771 Elixir tests, 250 Node tests, 162 Vitest tests, Credo, formatting, lint, TypeScript and production build). Forced project compile with warnings-as-errors and frozen-lockfile install passed. The production-assets portal served /assets/react/app.js; navigation, new/edit deck dialogs, Markdown and KaTeX rendering passed with no browser errors. The temporary deck was deleted and a read-only database query confirmed zero matching fixtures. Hex audit is clean. aube audit still reports 16 false positives for vite@1.0.0, the alias for @voidzero-dev/vite-plus-core@1.0.0: audit keys its request by pkg.name instead of registry_name(), including in aube v2.6.1. No advisory ignore rules were added. Latest released Hex dependencies still have Elixir 1.20 warnings in Dataloader, Absinthe Plug/Relay, Phoenix Ecto, Gettext and Oban; left upstream rather than patching or globally suppressing dependencies. Native binaries were not built.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Upgraded Vite Plus/core to 1.0.0, Vitest to 5.0.3, jsdom to 30.1.1 and Motion to 13.5.0. Kept KaTeX 0.16 CSS aligned with rehype-katex. Removed project plugin type casts and test-environment scroll warnings; separated React/Markdown/math chunks so production build has no oversized-chunk warnings. Full precommit passed 1,183 tests and portal production-bundle verification passed. Remaining upstream compiler warnings and aube alias-audit bug are documented, not suppressed.
<!-- SECTION:FINAL_SUMMARY:END -->
