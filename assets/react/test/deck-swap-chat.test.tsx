import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useReducer } from "react"
import { afterEach, expect, test, vi } from "vitest"
import type { DeckCardEntry } from "../src/pages/decks/deck-types"

const apolloMocks = vi.hoisted(() => ({
  askVariables: [] as Array<Record<string, unknown>>,
  configured: true,
  turns: [] as Array<Record<string, unknown>>,
}))

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}))

vi.mock("@apollo/client/react", () => ({
  useQuery: (document: { definitions: Array<{ name?: { value?: string } }> }) => {
    const name = document.definitions[0]?.name?.value
    const base = { error: undefined, loading: false, startPolling: vi.fn(), stopPolling: vi.fn() }

    if (name === "DeckSwapAiSettings") {
      return {
        ...base,
        data: {
          aiSettings: apolloMocks.configured
            ? { hasApiKey: true, model: "anthropic/claude-sonnet-4" }
            : { hasApiKey: false, model: null },
        },
      }
    }

    return {
      ...base,
      data: { deckQuestionAnswers: apolloMocks.turns },
      refetch: () => Promise.resolve(),
    }
  },
  useMutation: () => [
    (options: { variables: Record<string, unknown> }) => {
      apolloMocks.askVariables.push(options.variables)
      return Promise.resolve({ data: {} })
    },
    { loading: false },
  ],
}))

const { DeckSwapChat } = await import("../src/pages/decks/deck-swap-chat")
const { deckSwapReducer, EMPTY_DECK_SWAP } = await import("../src/pages/decks/deck-swap-model")

const deckCards = [
  { id: "m1", zone: "mainboard", quantity: 1, card: { name: "Pia Nalaar" } },
  { id: "k1", zone: "considering", quantity: 1, card: { name: "Grand Abolisher" } },
] as unknown as DeckCardEntry[]

function Harness({ onSwap }: { onSwap: (swap: unknown) => void }) {
  const [swap, dispatch] = useReducer(deckSwapReducer, EMPTY_DECK_SWAP)
  onSwap(swap)

  return (
    <DeckSwapChat
      deckCards={deckCards}
      deckCardsById={new Map(deckCards.map((deckCard) => [deckCard.id, deckCard]))}
      deckId="deck-1"
      dispatch={dispatch}
      swap={swap}
    />
  )
}

afterEach(() => {
  cleanup()
  apolloMocks.askVariables = []
  apolloMocks.configured = true
  apolloMocks.turns = []
})

test("sends starter prompts with the thread id and staged swap", async () => {
  const user = userEvent.setup()
  render(<Harness onSwap={() => {}} />)

  await user.click(screen.getByRole("button", { name: "What are the weakest cards in this deck?" }))

  await waitFor(() => expect(apolloMocks.askVariables).toHaveLength(1))
  expect(apolloMocks.askVariables[0]).toMatchObject({
    id: "deck-1",
    question: "What are the weakest cards in this deck?",
    swapContext: { cuts: [], adds: [] },
  })
  expect(String(apolloMocks.askVariables[0].threadId)).toMatch(/^swap-/)
})

test("answer chips stage cuts and adds, and Stage all stages the rest", async () => {
  apolloMocks.turns = [
    {
      id: "t1",
      question: "What should change?",
      answer: "Cut Pia for Abolisher and add Mother of Runes.",
      status: "completed",
      error: null,
      recommendedCuts: ["Pia Nalaar"],
      recommendedAdditions: ["Grand Abolisher", "Mother of Runes"],
    },
  ]
  const user = userEvent.setup()
  let latestSwap: { cuts: unknown[]; adds: unknown[] } = EMPTY_DECK_SWAP
  render(<Harness onSwap={(swap) => (latestSwap = swap as typeof latestSwap)} />)

  await user.click(screen.getByRole("button", { name: "Stage cut: Pia Nalaar" }))
  expect(latestSwap.cuts).toEqual([{ deckCardId: "m1", destination: "remove", quantity: 1 }])
  expect(
    screen.getByRole("button", { name: "Stage cut: Pia Nalaar" }).getAttribute("aria-pressed"),
  ).toBe("true")

  await user.click(screen.getByRole("button", { name: "Stage all" }))
  expect(latestSwap.adds).toEqual([
    { source: "considering", deckCardId: "k1", quantity: 1 },
    { source: "search", name: "Mother of Runes", quantity: 1 },
  ])
  expect(latestSwap.cuts).toHaveLength(1)
})

test("points to Settings when no AI provider is configured", () => {
  apolloMocks.configured = false
  render(<Harness onSwap={() => {}} />)

  expect(screen.getByText("Connect an AI provider to chat about swaps")).toBeTruthy()
  expect(screen.getByRole("link", { name: "Open Settings" }).getAttribute("href")).toBe("/settings")
})
