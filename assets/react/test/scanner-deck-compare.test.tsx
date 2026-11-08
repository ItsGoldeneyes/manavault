import { ApolloClient, InMemoryCache } from "@apollo/client"
import { ApolloProvider } from "@apollo/client/react"
import { MockLink } from "@apollo/client/testing"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"

import { CardDeckOptionsDocument } from "../src/pages/cards/data"
import { DeckDiffDocument } from "../src/pages/decks/deck-compare-documents"
import {
  ScanDeckCompareDialog,
  summarizeScanDiff,
} from "../src/pages/scan/scan-deck-compare-dialog"
import { scanListText, type ScanEntry } from "../src/pages/scan/scan-list"

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
  unrecognized: [],
  adds: [
    {
      __typename: "DeckDiffEntry" as const,
      cardName: "Giant Growth",
      quantity: 1,
      oracleId: "gg",
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

test("summarizes a diff from the scan's side", () => {
  // Scanned: 3 Lightning Bolt + 1 Giant Growth; deck: 4 Bolt + 2 Counterspell.
  expect(summarizeScanDiff(diff, 4)).toEqual({
    matched: 3,
    deckTotal: 6,
    missing: [
      { cardName: "Counterspell", quantity: 2 },
      { cardName: "Lightning Bolt", quantity: 1 },
    ],
    extra: [{ cardName: "Giant Growth", quantity: 1 }],
  })
})

test("picking a deck diffs the scan list against it", async () => {
  const entries = [scanned("Lightning Bolt", 3, "146"), scanned("Giant Growth", 1, "180")]
  const link = new MockLink([
    {
      request: { query: CardDeckOptionsDocument },
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
                  status: "active",
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
        variables: { deckId: "deck-1", text: scanListText(entries) },
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

  await userEvent.click(await screen.findByRole("button", { name: /Izzet Burn/ }))

  expect(await screen.findByText("3/6")).toBeTruthy()
  const missing = screen.getByRole("region", { name: "Missing from scan" })
  expect(within(missing).getByText("Counterspell")).toBeTruthy()
  expect(within(missing).getByText("Lightning Bolt")).toBeTruthy()
  const extra = screen.getByRole("region", { name: "Not in deck" })
  expect(within(extra).getByText("Giant Growth")).toBeTruthy()
})
