import { ApolloClient, InMemoryCache } from "@apollo/client"
import { ApolloProvider } from "@apollo/client/react"
import { MockLink } from "@apollo/client/testing"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"

import { DeckDiffDocument } from "../src/pages/decks/deck-compare-documents"
import {
  ScanCompareDecksDocument,
  ScanDeckCompareDialog,
  scanCompareList,
  summarizeScanDiff,
} from "../src/pages/scan/scan-deck-compare-dialog"
import type { ScanEntry } from "../src/pages/scan/scan-list"

afterEach(cleanup)

function scanned(name: string, quantity: number, collectorNumber: string): ScanEntry {
  return {
    id: name,
    cardKey: name,
    illustrationId: null,
    name,
    scryfallId: name,
    setCode: "m10",
    setName: null,
    collectorNumber,
    rarity: "common",
    finish: "nonfoil",
    finishes: ["nonfoil"],
    language: "en",
    quantity,
    prices: { nonfoil: null, foil: null, etched: null },
    imageUrl: null,
    resolved: true,
    scannedAt: 0,
  }
}

const diff = {
  __typename: "DeckDiffResult" as const,
  sourceName: null,
  unrecognized: ["Notacard"],
  adds: [
    {
      __typename: "DeckDiffEntry" as const,
      cardName: "Giant Growth",
      quantity: 1,
      oracleId: "gg",
      imageUrl: null,
    },
    {
      __typename: "DeckDiffEntry" as const,
      cardName: "Notacard",
      quantity: 2,
      oracleId: null,
      imageUrl: null,
    },
  ],
  cuts: [
    {
      __typename: "DeckDiffEntry" as const,
      cardName: "Counterspell",
      quantity: 2,
      oracleId: "cs",
      imageUrl: null,
      deckCardIds: ["d1"],
    },
  ],
  changes: [
    {
      __typename: "DeckDiffChange" as const,
      cardName: "Lightning Bolt",
      fromQuantity: 4,
      toQuantity: 3,
      oracleId: "lb",
      deckCardIds: ["d2"],
    },
  ],
}

test("sums copies per card name and leaves tokens out", () => {
  // Newest first, as the scan list stores them; the same printing scanned twice is two entries.
  const entries = [
    scanned("Lightning Bolt", 1, "146"),
    { ...scanned("Goblin", 2, "5"), id: "token", layout: "token" },
    scanned("Counterspell", 1, "50"),
    { ...scanned("Lightning Bolt", 2, "146"), id: "bolt-again" },
  ]
  expect(scanCompareList(entries)).toEqual({
    text: "3 Lightning Bolt\n1 Counterspell",
    total: 4,
    tokens: 2,
  })
})

test("summarizes a diff from the scan's side", () => {
  // Scanned: 3 Lightning Bolt, 1 Giant Growth, 2 of an unknown name; deck: 4 Bolt + 2 Counterspell.
  // The unknown name is an add, so it counts once, as extra, not again as unrecognized.
  expect(summarizeScanDiff(diff, 6)).toEqual({
    matched: 3,
    deckTotal: 6,
    missing: [
      { cardName: "Counterspell", quantity: 2 },
      { cardName: "Lightning Bolt", quantity: 1 },
    ],
    extra: [
      { cardName: "Giant Growth", quantity: 1 },
      { cardName: "Notacard", quantity: 2, unrecognized: true },
    ],
  })
})

test("picking a deck diffs the scan list against it", async () => {
  const entries = [
    scanned("Lightning Bolt", 3, "146"),
    scanned("Giant Growth", 1, "180"),
    scanned("Notacard", 2, "1"),
  ]
  const link = new MockLink([
    {
      request: { query: ScanCompareDecksDocument },
      result: {
        data: {
          decks: {
            __typename: "DeckConnection",
            pageInfo: { __typename: "PageInfo", endCursor: null, hasNextPage: false },
            edges: [
              {
                __typename: "DeckEdge",
                node: {
                  __typename: "Deck",
                  id: "deck-1",
                  name: "Izzet Burn",
                  format: "modern",
                  cardCount: 60,
                },
              },
            ],
          },
        },
      },
    },
    {
      request: {
        query: DeckDiffDocument,
        // Oldest scan first, one line per card name.
        variables: { deckId: "deck-1", text: "2 Notacard\n1 Giant Growth\n3 Lightning Bolt" },
      },
      result: { data: { deckDiff: diff } },
    },
  ])
  const client = new ApolloClient({ cache: new InMemoryCache(), link })
  render(
    <ApolloProvider client={client}>
      <ScanDeckCompareDialog open entries={entries} onClose={vi.fn()} />
    </ApolloProvider>,
  )

  await userEvent.click(await screen.findByRole("button", { name: /Izzet Burn.*60 cards/ }))

  expect(await screen.findByText("3/6")).toBeTruthy()
  const missing = screen.getByRole("region", { name: "Missing from scan" })
  expect(within(missing).getByText("Counterspell")).toBeTruthy()
  expect(within(missing).getByText("Lightning Bolt")).toBeTruthy()
  const extra = screen.getByRole("region", { name: "Not in deck" })
  expect(within(extra).getByText("Giant Growth")).toBeTruthy()
  expect(within(extra).getByText("Unrecognized")).toBeTruthy()
})

function deckPage(id: string, name: string, endCursor: string | null, hasNextPage: boolean) {
  return {
    data: {
      decks: {
        __typename: "DeckConnection",
        pageInfo: { __typename: "PageInfo", endCursor, hasNextPage },
        edges: [
          {
            __typename: "DeckEdge",
            node: { __typename: "Deck", id, name, format: "modern", cardCount: 60 },
          },
        ],
      },
    },
  }
}

test("the deck picker loads decks past the first page", async () => {
  const link = new MockLink([
    {
      request: { query: ScanCompareDecksDocument },
      result: deckPage("deck-1", "First Page Deck", "cursor-1", true),
    },
    {
      request: { query: ScanCompareDecksDocument, variables: { after: "cursor-1" } },
      result: deckPage("deck-2", "Second Page Deck", null, false),
    },
  ])
  const client = new ApolloClient({ cache: new InMemoryCache(), link })
  render(
    <ApolloProvider client={client}>
      <ScanDeckCompareDialog
        open
        entries={[scanned("Lightning Bolt", 1, "146")]}
        onClose={vi.fn()}
      />
    </ApolloProvider>,
  )

  expect(await screen.findByRole("button", { name: /Second Page Deck/ })).toBeTruthy()
  expect(screen.getByRole("button", { name: /First Page Deck/ })).toBeTruthy()
})

test("a list of only tokens has nothing to compare", () => {
  const client = new ApolloClient({ cache: new InMemoryCache(), link: new MockLink([]) })
  render(
    <ApolloProvider client={client}>
      <ScanDeckCompareDialog
        open
        entries={[{ ...scanned("Goblin", 2, "5"), layout: "token" }]}
        onClose={vi.fn()}
      />
    </ApolloProvider>,
  )

  expect(screen.getByText(/Only tokens are scanned/)).toBeTruthy()
  expect(screen.queryByRole("textbox", { name: "Search decks" })).toBeNull()
})
