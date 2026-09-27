---
id: TASK-79
title: Add Swap cards workbench to deck detail
status: Done
assignee:
  - '@cfbender'
created_date: '2026-09-27 00:26'
updated_date: '2026-09-27 00:58'
labels: []
dependencies: []
ordinal: 89000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Tuning a deck today means cutting and adding cards one at a time through separate dialogs, with no way to see whether the resulting list is legal until after the edits land. Users flag cuts with the Consider Cutting tag and park candidates on the Considering board, but nothing brings those two lists together. A single Swap cards workbench lets users stage cuts and adds together, see live legality for the proposed list, and apply all changes at once.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Deck detail toolbar shows a Swap cards action (and E shortcut) for editable, non-shared decks
- [x] #2 Cut column lists Consider Cutting cards first, then the filterable mainboard; add column lists the Considering board first, then card name search
- [x] #3 Staged list shows cuts and adds with quantities, the resulting counted card total, and released allocation counts for cuts
- [x] #4 Live server-side legality preview shows issues introduced and resolved by the staged swap
- [x] #5 Each cut can remove the card or move it to Considering; default is remove
- [x] #6 Applying commits all cuts and adds atomically; any failure leaves the deck unchanged
- [x] #7 Applying an edit that leaves the deck illegal is allowed with a warning
- [x] #8 Mobile layout uses Cut / Add / Review tabs with a sticky summary footer
- [x] #9 Backend and frontend tests cover preview legality, atomic apply, and staging model
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Backend: Manavault.Catalog.Decks.SwapDeckCards with preview/2 (applies staged cuts/adds to the preloaded deck in memory and runs DeckLegality.evaluate) and apply/2 (one Repo.transact reusing DeleteDeckCard/UpdateDeckCard/AddCardToDeck; rollback on any error). Delegate through Decks and Catalog; invalidate deck cache on success.
2. GraphQL: deck_swap_input (cuts: deckCardId/quantity/destination REMOVE|CONSIDERING; adds: deckCardId or name + quantity), deckSwapPreview query returning legality, cardCount, unresolvedNames; applyDeckSwap payload mutation returning deck. Update schema contract test.
3. Frontend: deck-swap-model.ts (pure staging reducer, counts, issue diff), deck-swap-documents.ts, deck-swap-dialog.tsx (three-column desktop, Cut/Add/Review tabs on mobile), wire overlay kind swap-cards, header button, E shortcut.
4. Tests: ExUnit for preview + atomic apply + schema; vitest for model and dialog.
5. Verify in browser via portal (desktop + mobile), run narrow test suites.

6. Extracted partial-cut allocation release into Decks.TrimDeckCardAllocations; GraphQL resolvers live in DeckSwapResolvers.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions: named the feature Swap cards (existing Edit menu item unchanged); preview is a read-only deckSwapPreview query reusing DeckLegality.evaluate on an in-memory deck; legality issues are diffed client-side by code+cardName so deck-size issues persist instead of flipping; full cut to Considering updates the zone in place (keeps printing and custom tags) and clears consider_cutting; partial cuts or merges into an existing target-zone row delete/reduce and upsert; partial cuts release proxies first, then physical copies; released-copy hint excludes basic lands (virtual allocation) and proxies; page shortcuts pause while the workbench is open so a stray key cannot replace the overlay and drop staged changes.

Validation: mix test (723 passed), mix credo --strict clean, mix compile --warnings-as-errors, aube run typecheck, lint, vp fmt --check, test:react (node 209 passed, vitest 130 passed). Browser-verified via portal at 1440px and 390px Chromium viewport (not a touch device): staging, filter, card search, legality diff (new/resolved/still open), To Considering, Discard confirm, apply updated deck to Legal 100 cards.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a Swap cards workbench to deck detail (toolbar button and E shortcut). Users stage cuts from a Consider Cutting-first mainboard list and adds from the Considering board or card search, see live server-side legality for the proposed list with issues introduced/resolved, and apply all changes atomically via a new applyDeckSwap mutation (SwapDeckCards + TrimDeckCardAllocations). Verified with new ExUnit, schema, node, and vitest tests plus full suites and browser checks on desktop and narrow layouts.
<!-- SECTION:FINAL_SUMMARY:END -->
