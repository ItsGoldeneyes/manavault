import { useMutation, useQuery } from "@apollo/client/react"
import { Link } from "@tanstack/react-router"
import { Check, Minus, Plus, Sparkles } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "../../components/ui/button"
import type { DeckSwapChatQuery } from "../../gql/graphql"
import { cn } from "../../lib/utils"
import { DeckChat, DeckChatTurn } from "./deck-chat"
import type { DeckCardEntry } from "./deck-types"
import {
  AskDeckSwapQuestionDocument,
  DeckSwapAiSettingsDocument,
  DeckSwapChatDocument,
} from "./deck-swap-chat-documents"
import {
  answerChips,
  stageAllActions,
  starterPrompts,
  newSwapThreadId,
  swapContextNames,
  type SwapChip,
} from "./deck-swap-chat-model"
import type { DeckSwap, DeckSwapAction } from "./deck-swap-model"

type ChatTurn = DeckSwapChatQuery["deckQuestionAnswers"][number]
type Dispatch = (action: DeckSwapAction) => void

const POLL_INTERVAL_MS = 2_000

function ChipButton({ chip, dispatch }: { chip: SwapChip; dispatch: Dispatch }) {
  const Icon = chip.staged ? Check : chip.kind === "cut" ? Minus : Plus
  const unavailableLabel = chip.kind === "cut" ? "not in mainboard" : "already in deck"

  return (
    <button
      type="button"
      aria-pressed={chip.staged}
      aria-label={
        chip.toggle
          ? `${chip.kind === "cut" ? "Stage cut" : "Stage add"}: ${chip.name}`
          : `${chip.name} (${unavailableLabel})`
      }
      disabled={!chip.toggle}
      title={chip.toggle ? undefined : unavailableLabel}
      className={cn(
        "inline-flex h-7 max-w-full items-center gap-1 rounded-full border px-2.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-45",
        chip.kind === "cut"
          ? chip.staged
            ? "border-error bg-error text-error-content"
            : "border-error/40 text-error hover:bg-error/10"
          : chip.staged
            ? "border-success bg-success text-success-content"
            : "border-success/45 text-success hover:bg-success/10",
      )}
      onClick={() => chip.toggle && dispatch(chip.toggle)}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{chip.name}</span>
    </button>
  )
}

function SwapRecommendations({
  deckCards,
  dispatch,
  swap,
  turn,
}: {
  deckCards: DeckCardEntry[]
  dispatch: Dispatch
  swap: DeckSwap
  turn: ChatTurn
}) {
  const chips = answerChips(turn, deckCards, swap)
  const pendingActions = stageAllActions(chips)

  return (
    <div className="space-y-2.5">
      {chips.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <ChipButton key={`${chip.kind}:${chip.name}`} chip={chip} dispatch={dispatch} />
          ))}
          {pendingActions.length > 1 ? (
            <button
              type="button"
              className="h-7 rounded-full px-2 text-xs font-bold text-base-content/70 underline decoration-base-content/30 underline-offset-4 hover:text-base-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              onClick={() => pendingActions.forEach(dispatch)}
            >
              Stage all
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function SetupNotice() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <Sparkles className="h-6 w-6 text-base-content/30" aria-hidden="true" />
      <p className="text-sm font-bold">Connect an AI provider to chat about swaps</p>
      <p className="max-w-64 text-xs text-base-content/60">
        Add an API key and model in Settings. Deck data is only sent when you ask.
      </p>
      <Button asChild size="sm" variant="outline">
        <Link to="/settings">Open Settings</Link>
      </Button>
    </div>
  )
}

export function DeckSwapChat({
  deckCards,
  deckCardsById,
  deckId,
  dispatch,
  swap,
}: {
  deckCards: DeckCardEntry[]
  deckCardsById: Map<string, DeckCardEntry>
  deckId: string
  dispatch: Dispatch
  swap: DeckSwap
}) {
  // One thread per workbench session; closing the workbench ends it.
  const [threadId] = useState(newSwapThreadId)
  const [question, setQuestion] = useState("")
  const [askError, setAskError] = useState<string | null>(null)
  const [hasAsked, setHasAsked] = useState(false)
  const settingsQuery = useQuery(DeckSwapAiSettingsDocument)
  const threadQuery = useQuery(DeckSwapChatDocument, {
    variables: { deckId, threadId },
    skip: !hasAsked,
    fetchPolicy: "cache-and-network",
  })
  const [ask, { loading: asking }] = useMutation(AskDeckSwapQuestionDocument)
  const turns = threadQuery.data?.deckQuestionAnswers ?? []
  const pending = turns.some((turn) => turn.status === "pending")
  const { startPolling, stopPolling } = threadQuery
  const aiSettings = settingsQuery.data?.aiSettings
  const configured = Boolean(aiSettings?.hasApiKey && aiSettings.model)

  useEffect(() => {
    if (pending) startPolling(POLL_INTERVAL_MS)
    else stopPolling()
    return () => stopPolling()
  }, [pending, startPolling, stopPolling])

  function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || asking || pending) return

    setAskError(null)
    void ask({
      variables: {
        id: deckId,
        question: trimmed,
        threadId,
        swapContext: swapContextNames(swap, deckCardsById),
      },
    })
      .then(() => {
        setQuestion("")
        setHasAsked(true)
        return threadQuery.refetch()
      })
      .catch((error: unknown) =>
        setAskError(error instanceof Error ? error.message : "Could not send the question"),
      )
  }

  if (settingsQuery.data && !configured) return <SetupNotice />

  return (
    <DeckChat
      description="Ask about cuts and adds. Answers see the deck and what you have staged, and every suggestion can be staged with a tap."
      error={askError}
      inputLabel="Ask about this swap"
      pending={pending}
      prompts={starterPrompts(swap)}
      question={question}
      sending={asking}
      turnCount={turns.length}
      onQuestionChange={setQuestion}
      onSend={send}
    >
      {turns.map((turn) => (
        <DeckChatTurn key={turn.id} turn={turn}>
          <SwapRecommendations deckCards={deckCards} dispatch={dispatch} swap={swap} turn={turn} />
        </DeckChatTurn>
      ))}
    </DeckChat>
  )
}
