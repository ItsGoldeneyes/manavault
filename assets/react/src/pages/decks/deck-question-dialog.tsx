import { useMutation, useQuery } from "@apollo/client/react"
import { Plus, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import type { DeckQuestionAnswersQuery } from "../../gql/graphql"
import { Button } from "../../components/ui/button"
import { ConfirmDialog } from "../../components/ui/confirm-dialog"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SELECT_NONE_VALUE,
} from "../../components/ui/select"
import { formatDate } from "../settings/data"
import { DeckChat, DeckChatTurn } from "./deck-chat"
import { QuestionRecommendations } from "./deck-question-recommendations"
import type { DeckCardEntry } from "./deck-types"
import {
  AskDeckQuestionDocument,
  DeckQuestionAnswersDocument,
  DeleteDeckQuestionAnswerDocument,
} from "./deck-analysis-documents"

type QuestionAnswer = DeckQuestionAnswersQuery["deckQuestionAnswers"][number]

const PROMPTS = [
  "What is this deck’s game plan?",
  "What are its biggest weaknesses?",
  "How can I improve the mana base?",
]

export function DeckQuestionDialog({
  deckId,
  deckName,
  deckCards,
  onOpenChange,
  open,
}: {
  deckId: string
  deckName: string
  deckCards: DeckCardEntry[]
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const [question, setQuestion] = useState("")
  const [conversationId, setConversationId] = useState<string>()
  const [questionAnswers, setQuestionAnswers] = useState<QuestionAnswer[]>([])
  const [deletingQuestionAnswer, setDeletingQuestionAnswer] = useState<QuestionAnswer | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const questionAnswersQuery = useQuery(DeckQuestionAnswersDocument, {
    fetchPolicy: "network-only",
    variables: { deckId },
    skip: !open,
  })
  const [askDeckQuestion, questionMutation] = useMutation(AskDeckQuestionDocument)
  const [deleteDeckQuestionAnswer, deleteMutation] = useMutation(DeleteDeckQuestionAnswerDocument)
  const activeConversationId = conversationId ?? ""
  const turns = questionAnswers.filter(
    (turn) => (turn.conversationId ?? "") === activeConversationId,
  )
  const pending = turns.some(({ status }) => status === "pending")
  const hasPending = questionAnswers.some(({ status }) => status === "pending")
  const loading = questionAnswersQuery.loading && !questionAnswersQuery.data
  // The query is newest-first: preserve that order for chats, but title each
  // chat with its first question rather than its latest follow-up.
  const conversations = new Map<string, QuestionAnswer>()
  for (const turn of questionAnswers) conversations.set(turn.conversationId ?? "", turn)

  useEffect(() => {
    setQuestionAnswers([])
    setConversationId(undefined)
    setQuestion("")
    setFormError(null)
  }, [deckId])

  useEffect(() => {
    if (questionAnswersQuery.data) {
      setQuestionAnswers(questionAnswersQuery.data.deckQuestionAnswers)
      setConversationId(
        (current) =>
          current ?? questionAnswersQuery.data?.deckQuestionAnswers[0]?.conversationId ?? "",
      )
    }
  }, [questionAnswersQuery.data])

  useEffect(() => {
    if (open && hasPending) {
      questionAnswersQuery.startPolling(2_000)
    } else {
      questionAnswersQuery.stopPolling()
    }

    return () => questionAnswersQuery.stopPolling()
  }, [open, hasPending, questionAnswersQuery.startPolling, questionAnswersQuery.stopPolling])

  function selectConversation(id: string) {
    setConversationId(id)
    setQuestion("")
    setFormError(null)
  }

  function send(text: string) {
    const trimmedQuestion = text.trim()
    if (
      !trimmedQuestion ||
      questionMutation.loading ||
      pending ||
      loading ||
      questionAnswersQuery.error
    )
      return

    setFormError(null)
    void askDeckQuestion({
      variables: {
        id: deckId,
        question: trimmedQuestion,
        conversationId: activeConversationId || null,
      },
      onCompleted: (data) => {
        const savedAnswer = data.askDeckQuestion?.questionAnswer

        if (savedAnswer) {
          setQuestionAnswers((current) => [
            savedAnswer,
            ...current.filter(({ id }) => id !== savedAnswer.id),
          ])
          setQuestion("")
        } else {
          setFormError("The question could not be queued. Try asking again.")
        }
      },
      onError: (error) => setFormError(error.message),
    })
  }

  function deleteSelectedQuestionAnswer() {
    if (!deletingQuestionAnswer) return

    void deleteDeckQuestionAnswer({
      variables: { id: deletingQuestionAnswer.id },
      onCompleted: (data) => {
        const deletedId = data.deleteDeckQuestionAnswer?.questionAnswerId
        if (deletedId) {
          setQuestionAnswers((current) => current.filter(({ id }) => id !== deletedId))
        }
      },
      onError: (error) => setFormError(error.message),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl sm:h-[min(48rem,90dvh)]"
        labelledBy="deck-question-title"
        describedBy="deck-question-description"
      >
        <DialogHeader>
          <div>
            <DialogTitle id="deck-question-title">Ask about this deck</DialogTitle>
            <p id="deck-question-description" className="mt-1 text-sm text-base-content/60">
              {deckName} · Chats are saved with this deck. Each message uses the current decklist.
            </p>
          </div>
          <DialogClose onClose={() => onOpenChange(false)} />
        </DialogHeader>

        <div className="flex shrink-0 items-center gap-2 border-b border-base-300 px-3 py-3">
          <Select
            value={activeConversationId || SELECT_NONE_VALUE}
            disabled={loading || questionMutation.loading || Boolean(questionAnswersQuery.error)}
            onValueChange={(value) => selectConversation(value === SELECT_NONE_VALUE ? "" : value)}
          >
            <SelectTrigger aria-label="Saved chats" className="min-w-0 flex-1 [&>span]:truncate">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-w-[calc(100vw-2rem)]">
              {!conversations.has(activeConversationId) ? (
                <SelectItem value={activeConversationId || SELECT_NONE_VALUE}>New chat</SelectItem>
              ) : null}
              {[...conversations].map(([id, firstTurn]) => (
                <SelectItem key={id} value={id || SELECT_NONE_VALUE}>
                  {firstTurn.question} · {formatDate(firstTurn.insertedAt)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            disabled={
              loading ||
              questionMutation.loading ||
              Boolean(questionAnswersQuery.error) ||
              !turns.length
            }
            onClick={() =>
              selectConversation(
                `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
              )
            }
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New chat
          </Button>
        </div>

        <DeckChat
          key={activeConversationId}
          description="Ask about card fit, possible cuts, matchups, or the game plan. Follow up on any answer to keep the conversation going."
          disabled={loading || Boolean(questionAnswersQuery.error)}
          error={formError}
          inputLabel="Ask about this deck"
          pending={pending}
          prompts={PROMPTS}
          question={question}
          sending={questionMutation.loading}
          turnCount={turns.length}
          onQuestionChange={setQuestion}
          onSend={send}
        >
          {loading ? (
            <p role="status" className="text-sm text-base-content/60">
              Loading conversation…
            </p>
          ) : null}
          {questionAnswersQuery.error ? (
            <div role="alert" className="text-sm text-error">
              <p>{questionAnswersQuery.error.message}</p>
              <Button
                className="mt-3"
                size="sm"
                type="button"
                variant="outline"
                onClick={() => void questionAnswersQuery.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : null}
          {[...turns].reverse().map((turn) => (
            <DeckChatTurn
              key={turn.id}
              turn={turn}
              footer={
                <div className="flex items-center justify-between gap-3 text-xs text-base-content/60">
                  <p className="min-w-0 break-words">
                    {turn.model ? `${turn.model} · ` : null}
                    Asked <time dateTime={turn.insertedAt}>{formatDate(turn.insertedAt)}</time>
                  </p>
                  <Button
                    aria-label={`Delete saved question: ${turn.question}`}
                    disabled={deleteMutation.loading}
                    size="icon"
                    type="button"
                    variant="ghost"
                    onClick={() => setDeletingQuestionAnswer(turn)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              }
            >
              <QuestionRecommendations
                deckCards={deckCards}
                deckId={deckId}
                questionAnswer={turn}
              />
            </DeckChatTurn>
          ))}
        </DeckChat>
      </DialogContent>

      <ConfirmDialog
        destructive
        confirmLabel="Delete saved answer"
        open={deletingQuestionAnswer !== null}
        title="Delete saved question?"
        onConfirm={deleteSelectedQuestionAnswer}
        onOpenChange={(nextOpen) => !nextOpen && setDeletingQuestionAnswer(null)}
      >
        This permanently removes this question and its answer from {deckName}.
      </ConfirmDialog>
    </Dialog>
  )
}
