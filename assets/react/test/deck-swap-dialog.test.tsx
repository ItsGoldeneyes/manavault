import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, expect, test, vi } from "vitest"
import type { DeckCardEntry, DeckDetail } from "../src/pages/decks/deck-types"

const apolloMocks = vi.hoisted(() => ({
  applyVariables: [] as Array<{ deckId: string; input: unknown }>,
  previewVariables: [] as Array<{ deckId: string; input: unknown }>,
  refetchQueries: vi.fn(() => Promise.resolve()),
}))

vi.mock("@apollo/client/react", () => ({
  useApolloClient: () => ({ refetchQueries: apolloMocks.refetchQueries }),
  useQuery: (
    document: { definitions: Array<{ name?: { value?: string } }> },
    options: { skip?: boolean; variables: { deckId: string; input: unknown } },
  ) => {
    if (document.definitions[0]?.name?.value !== "DeckSwapPreview" || options.skip) {
      return { data: undefined, error: undefined, loading: false, previousData: undefined }
    }

    apolloMocks.previewVariables.push(options.variables)
    return {
      data: {
        deckSwapPreview: {
          cardCount: 100,
          unresolvedNames: [],
          legality: {
            status: "illegal",
            issues: [
              {
                code: "card_legality",
                message: "Dockside Extortionist is not legal in commander (status: banned).",
                severity: "error",
                cardName: "Dockside Extortionist",
              },
            ],
          },
        },
      },
      error: undefined,
      loading: false,
      previousData: undefined,
    }
  },
  useMutation: () => [
    (options: { variables: { deckId: string; input: unknown } }) => {
      apolloMocks.applyVariables.push(options.variables)
      return Promise.resolve({ data: {} })
    },
    { loading: false },
  ],
}))

const { DeckSwapDialog } = await import("../src/pages/decks/deck-swap-dialog")

function deckCard(id: string, name: string, zone: string, tag: string | null = null) {
  return {
    id,
    quantity: 1,
    zone,
    tag,
    card: { name, typeLine: "Creature", manaCost: "{1}{R}" },
    allocationStatus: { state: "missing", allocated: 0, proxyAllocated: 0 },
    preferredPrinting: null,
    fallbackPrinting: null,
  }
}

const deckCards = [
  deckCard("c1", "Winota, Joiner of Forces", "commander"),
  deckCard("m1", "Pia Nalaar", "mainboard", "consider_cutting"),
  deckCard("m2", "Sol Ring", "mainboard"),
  deckCard("k1", "Dockside Extortionist", "considering"),
] as unknown as DeckCardEntry[]

const deck = {
  id: "deck-1",
  name: "Winota Swarm",
  format: "commander",
  legality: { status: "legal", issues: [] },
} as unknown as DeckDetail

afterEach(() => {
  cleanup()
  apolloMocks.applyVariables = []
  apolloMocks.previewVariables = []
})

test("lists Consider Cutting cards ahead of the rest of the mainboard", () => {
  render(<DeckSwapDialog deck={deck} deckCards={deckCards} onClose={() => {}} />)

  const flagged = screen.getByRole("region", { name: "Consider cutting" })
  expect(within(flagged).getByRole("button", { name: "Cut Pia Nalaar" })).toBeTruthy()
  expect(within(flagged).queryByRole("button", { name: "Cut Sol Ring" })).toBeNull()
  expect(screen.getByText("Deck is legal now")).toBeTruthy()
})

test("stages a swap, previews its legality, and applies it in one mutation", async () => {
  const user = userEvent.setup()
  const onClose = vi.fn()
  render(<DeckSwapDialog deck={deck} deckCards={deckCards} onClose={onClose} />)

  await user.click(screen.getByRole("button", { name: "Cut Pia Nalaar" }))
  await user.click(screen.getByRole("button", { name: "Bring in Dockside Extortionist" }))

  expect(screen.getByRole("button", { name: "Cut Pia Nalaar" }).getAttribute("aria-pressed")).toBe(
    "true",
  )
  await waitFor(() => expect(screen.getByText("Illegal after swap")).toBeTruthy())
  expect(
    screen.getByText("Dockside Extortionist is not legal in commander (status: banned)."),
  ).toBeTruthy()
  expect(
    screen.getByText("The deck will be illegal after this swap. You can still apply it."),
  ).toBeTruthy()

  await user.click(screen.getByRole("radio", { name: "To Considering" }))
  await user.click(screen.getByRole("button", { name: "Apply 2 changes" }))

  expect(apolloMocks.applyVariables).toEqual([
    {
      deckId: "deck-1",
      input: {
        cuts: [{ deckCardId: "m1", quantity: 1, destination: "CONSIDERING" }],
        adds: [{ deckCardId: "k1", quantity: 1 }],
      },
    },
  ])
  await waitFor(() => expect(onClose).toHaveBeenCalled())
  expect(apolloMocks.refetchQueries).toHaveBeenCalled()
})

test("asks before discarding staged changes on close", async () => {
  const user = userEvent.setup()
  const onClose = vi.fn()
  render(<DeckSwapDialog deck={deck} deckCards={deckCards} onClose={onClose} />)

  await user.click(screen.getByRole("button", { name: "Cut Sol Ring" }))
  await user.click(screen.getAllByRole("button", { name: "Close dialog" })[0])

  expect(screen.getByRole("heading", { name: "Discard staged swap?" })).toBeTruthy()
  await user.click(screen.getByRole("button", { name: "Keep editing" }))
  expect(onClose).not.toHaveBeenCalled()

  await user.click(screen.getAllByRole("button", { name: "Close dialog" })[0])
  await user.click(screen.getByRole("button", { name: "Discard and close" }))
  expect(onClose).toHaveBeenCalledTimes(1)
})
