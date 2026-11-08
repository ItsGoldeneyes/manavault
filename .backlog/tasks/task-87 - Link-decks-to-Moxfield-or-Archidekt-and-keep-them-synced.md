---
id: TASK-87
title: Link decks to Moxfield or Archidekt and keep them synced
status: Review
assignee:
  - '@cfbender'
created_date: '2026-10-04 21:11'
updated_date: '2026-10-04 21:52'
labels: []
dependencies: []
ordinal: 104000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Some players build decks in Moxfield or Archidekt and only want ManaVault for collection tracking. Today the only path is pasting a decklist export, which goes stale as the external deck changes and lets the two copies drift. Attaching the external deck URL makes the external builder the source of truth: ManaVault imports the list, re-syncs it on a schedule and on demand, and stops offering its own decklist editing while the link exists. Collection allocation (pull list, allocate/deallocate, proxies, bulk allocation, disassembly) must keep working because that is the reason to have the deck in ManaVault at all. Moxfield API access is Cloudflare-gated to allow-listed User-Agents, so the UA must be operator-configurable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A deck can be linked to a Moxfield or Archidekt deck URL; linking imports the decklist and records source, URL, and sync time, and invalid or unsupported URLs are rejected with a clear error
- [x] #2 Linked decks re-sync hourly via Oban and can be re-synced manually; sync applies quantity, zone, finish, and printing changes while preserving existing deck card rows, allocations, and tags where the card remains in the deck
- [x] #3 Decklist-changing operations (add, edit, move, delete, swap, import, commander/partner, optimize printings, add from collection) are rejected server-side for linked decks with a deck_linked error, while allocation operations still succeed
- [x] #4 Deck detail UI hides decklist editing controls for linked decks, shows a linked-deck notice with last sync status plus Open, Sync now, and Unlink actions, and keeps allocation controls available
- [x] #5 The Share dialog for a linked deck shows and copies the external deck URL instead of generating a ManaVault share token
- [x] #6 Moxfield is fetched with the default Req User-Agent (no MOXFIELD_USER_AGENT setting); a blocked or failed fetch is recorded on the deck as external_sync_error and shown in the UI
- [x] #7 ExUnit tests cover URL parsing, payload normalization, diff sync preserving allocations, the linked-deck guard, and the GraphQL link/sync/unlink mutations; README and docs/features.md document the feature and hourly sync
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Migration + Deck schema fields and changesets. 2. Extend Trade.ListSource Moxfield/Archidekt entries with scryfall_id/finish; configurable Moxfield UA. 3. Decks.ExternalSource action (link/unlink/sync/sync_all) with diff-based apply keyed on {oracle_id, zone}. 4. EditGuard.ensure_decklist_editable and swap decklist-changing call sites. 5. Oban ExternalDeckSyncWorker + hourly cron. 6. GraphQL fields, mutations, errors. 7. Frontend: canEditDecklist vs canAllocate split, linked notice, link/unlink/sync dialog, share dialog external URL, codegen. 8. Tests, precommit checks, portal verification, docs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Frontend finished: canAllocate vs canEditDecklist split through deck-detail-screen, header (DeckExternalSourceNotice with Open/Sync now/Manage), stack cards, zone table, readiness dialog, dialog launcher; DeckExternalSourceDialog (link form / manage view with Unlink confirm); ShareDeckDialog shows externalUrl and skips ensureShareToken when linked. Decisions: quick tags and custom tag assignment are also blocked while linked (they go through update_deck_card); printing/finish follow the remote only for deck cards with no physical allocations; Moxfield uses the default UA per user decision (orb IP is Cloudflare-blocked so Moxfield was not live-tested, Archidekt was). Bugs found by tests: mutation payload returned the pre-sync deck struct with stale preloaded deck_cards (cardCount 0) -> resolver now re-reads the deck; frontend DeckDocument is also run against /share/graphql, so the four external fields were added to the public share Deck type. Validation: mix test 813 passed; mix format/credo --strict clean; aube typecheck/lint/test:react (252 node + 170 vitest) pass. Portal verification on Archidekt deck 14035633: link import (1 commander + 99 mainboard), notice + Sync now (timestamp advanced), action menu reduced, card menu reduced to View, Pull list open with Optimize printings hidden and tag selects disabled, Share dialog shows external URL without rotate/disable, Unlink restores Add card/Swap/Select, invalid URL error shown, public share page still renders.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Decks can be linked to a Moxfield or Archidekt URL (linkDeckExternalSource / syncDeckExternalSource / unlinkDeckExternalSource); linking imports the list and ExternalDeckSyncWorker re-syncs hourly with a manual Sync now. Diff-based sync keyed on {oracle_id, zone} preserves rows, tags, and allocations. EditGuard.ensure_decklist_editable rejects every decklist edit with :deck_linked while allocation keeps working; the UI hides edit controls, shows a linked notice, and the Share dialog offers the external URL. Verified with ExUnit (813 passed incl. new catalog + GraphQL tests), aube typecheck/lint/test:react, and portal walkthrough against a live Archidekt deck.
<!-- SECTION:FINAL_SUMMARY:END -->
