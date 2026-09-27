import { useMutation, useQuery } from "@apollo/client/react"
import { Link } from "@tanstack/react-router"
import { Check, LoaderCircle, Minus, Plus, SendHorizontal, Sparkles } from "lucide-react"
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react"

import { Button } from "../../components/ui/button"
import type { DeckSwapChatQuery } from "../../gql/graphql"
import { cn } from "../../lib/utils"
import { DeckMarkdown } from "./deck-primer"
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

function AssistantTurn({
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
  if (turn.status === "pending") {
    return (
      <p className="flex items-center gap-2 text-sm text-base-content/60" role="status">
        <LoaderCircle
          className="h-4 w-4 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
        Thinking…
      </p>
    )
  }

  if (turn.status === "failed") {
    return (
      <p className="text-sm text-error">
        {turn.error || "The AI could not answer. Try asking again."}
      </p>
    )
  }

  const chips = answerChips(turn, deckCards, swap)
  const pendingActions = stageAllActions(chips)

  return (
    <div className="space-y-2.5">
      <DeckMarkdown cardReferences className="text-sm leading-6 [&_p]:my-1.5">
        {turn.answer}
      </DeckMarkdown>
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
  const scrollRef = useRef<HTMLDivElement>(null)
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

  useEffect(() => {
    const scroller = scrollRef.current
    if (scroller) scroller.scrollTop = scroller.scrollHeight
  }, [turns.length, pending])

  function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || asking) return

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

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    send(question)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      send(question)
    }
  }

  if (settingsQuery.data && !configured) return <SetupNotice />

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3">
        {turns.length === 0 ? (
          <div className="space-y-2 pt-2">
            <p className="text-xs text-base-content/60">
              Ask about cuts and adds. Answers see the deck and what you have staged, and every
              suggestion can be staged with a tap.
            </p>
          </div>
        ) : (
          turns.map((turn) => (
            <div key={turn.id} className="space-y-2">
              <p className="ml-auto w-fit max-w-[85%] rounded-box bg-base-content px-3 py-2 text-sm text-base-100">
                {turn.question}
              </p>
              <AssistantTurn deckCards={deckCards} dispatch={dispatch} swap={swap} turn={turn} />
            </div>
          ))
        )}
      </div>
      <div className="space-y-2 border-t border-base-300 px-3 py-3">
        {!pending ? (
          <div
            className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5 sm:flex-wrap sm:overflow-visible"
            aria-label="Suggested questions"
          >
            {starterPrompts(swap).map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={asking}
                className="h-7 shrink-0 whitespace-nowrap rounded-full border border-base-300 px-2.5 text-xs font-bold text-base-content/70 transition-colors hover:border-base-content/40 hover:text-base-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
                onClick={() => send(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>
        ) : null}
        {askError ? (
          <p role="alert" className="text-xs text-error">
            {askError}
          </p>
        ) : null}
        <form className="flex items-end gap-2" onSubmit={submit}>
          <textarea
            aria-label="Ask about this swap"
            className="textarea textarea-bordered min-h-10 flex-1 resize-none bg-base-100 py-2 text-sm leading-snug focus:border-primary focus:outline-none"
            maxLength={1000}
            placeholder="Ask about this swap…"
            rows={1}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Send question"
            disabled={!question.trim() || asking || pending}
          >
            {asking ? (
              <LoaderCircle
                className="h-4 w-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : (
              <SendHorizontal className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}
