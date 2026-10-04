import { ApolloClient, InMemoryCache } from "@apollo/client"
import { ApolloProvider } from "@apollo/client/react"
import { MockLink } from "@apollo/client/testing"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test } from "vitest"
import { BulkCleanDialog } from "../src/pages/collection/bulk-clean-dialog"
import { CollectionBulkCleanDocument } from "../src/pages/collection/bulk-clean/documents"

afterEach(cleanup)

function pull(id: string, location: { id: string | null; name: string }, quantity: number) {
  return {
    collectionItemId: id,
    cardId: "oracle-elves",
    cardName: "Llanowar Elves",
    setCode: "m19",
    collectorNumber: "314",
    imageUrl: null,
    finish: "nonfoil",
    priceCents: 5,
    ownedQuantity: 6,
    quantity,
    fromLocationId: location.id,
    fromLocationName: location.name,
  }
}

test("shows where to pull surplus bulk and refetches when thresholds change", async () => {
  const user = userEvent.setup()
  const link = new MockLink([
    {
      request: {
        query: CollectionBulkCleanDocument,
        variables: { maxPriceCents: 20, minCopies: 10, keepCopies: 4 },
      },
      result: {
        data: {
          collectionBulkClean: {
            cardCount: 1,
            pullQuantity: 8,
            pullValueCents: 40,
            cards: [
              {
                cardId: "oracle-elves",
                cardName: "Llanowar Elves",
                totalCopies: 12,
                pullQuantity: 8,
                pulls: [
                  pull("1", { id: "7", name: "Commons box" }, 6),
                  pull("2", { id: null, name: "Unfiled" }, 2),
                ],
              },
            ],
          },
        },
      },
    },
    {
      request: {
        query: CollectionBulkCleanDocument,
        variables: { maxPriceCents: 20, minCopies: 20, keepCopies: 4 },
      },
      result: {
        data: {
          collectionBulkClean: { cardCount: 0, pullQuantity: 0, pullValueCents: 0, cards: [] },
        },
      },
    },
  ])

  render(
    <ApolloProvider client={new ApolloClient({ cache: new InMemoryCache(), link })}>
      <BulkCleanDialog open onOpenChange={() => {}} />
    </ApolloProvider>,
  )

  const box = await screen.findByRole("heading", { level: 3, name: "Commons box" })
  expect(screen.getByRole("heading", { level: 3, name: "Unfiled" })).toBeTruthy()
  const boxGroup = box.closest("details")
  if (!(boxGroup instanceof HTMLElement)) throw new Error("Missing location group")
  expect(within(boxGroup).getAllByText("Pull 6")).toHaveLength(2)
  expect(screen.getByText("Pull 2 of 6")).toBeTruthy()
  expect(screen.getByText("$0.40")).toBeTruthy()

  await user.click(screen.getByRole("radio", { name: "Card" }))
  expect(screen.getByRole("heading", { level: 3, name: "Llanowar Elves" })).toBeTruthy()
  expect(screen.getByText("12 loose copies owned")).toBeTruthy()

  const minCopies = screen.getByLabelText("Own at least")
  await user.clear(minCopies)
  await user.type(minCopies, "20")

  expect(await screen.findByText("Nothing to pull.", {}, { timeout: 2000 })).toBeTruthy()
})
