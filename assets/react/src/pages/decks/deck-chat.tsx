import { LoaderCircle, SendHorizontal } from "lucide-react"
import { useEffect, useRef, type ReactNode } from "react"

import { Button } from "../../components/ui/button"
import { DeckMarkdown } from "./deck-primer"

export function DeckChat({
  children,
  description,
  disabled = false,
  error,
  inputLabel,
  pending,
  prompts,
  question,
  sending,
  turnCount,
  onQuestionChange,
  onSend,
}: {
  children: ReactNode
  description: string
  disabled?: boolean
  error?: string | null
  inputLabel: string
  pending: boolean
  prompts: string[]
  question: string
  sending: boolean
  turnCount: number
  onQuestionChange: (question: string) => void
  onSend: (question: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const busy = disabled || sending || pending

  useEffect(() => {
    const scroller = scrollRef.current
    if (scroller) scroller.scrollTop = scroller.scrollHeight
  }, [turnCount, pending])

  function send(text: string) {
    if (text.trim() && !busy) onSend(text)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        role="log"
        aria-label="Conversation"
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3"
      >
        {turnCount === 0 ? (
          <p className="pt-2 text-xs text-base-content/60">{description}</p>
        ) : null}
        {children}
      </div>
      <div className="shrink-0 space-y-2 border-t border-base-300 px-3 py-3">
        {!pending ? (
          <div
            className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5 sm:flex-wrap sm:overflow-visible"
            aria-label="Suggested questions"
          >
            {prompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={busy}
                className="h-7 shrink-0 whitespace-nowrap rounded-full border border-base-300 px-2.5 text-xs font-bold text-base-content/70 transition-colors hover:border-base-content/40 hover:text-base-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
                onClick={() => send(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-xs text-error">
            {error}
          </p>
        ) : null}
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            send(question)
          }}
        >
          <textarea
            aria-label={inputLabel}
            className="textarea textarea-bordered min-h-10 min-w-0 flex-1 resize-none bg-base-100 py-2 text-sm leading-snug focus:border-primary focus:outline-none"
            disabled={sending || disabled}
            maxLength={1000}
            placeholder={`${inputLabel}…`}
            rows={1}
            value={question}
            onChange={(event) => onQuestionChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                send(question)
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Send question"
            disabled={!question.trim() || busy}
          >
            {sending ? (
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

export function DeckChatTurn({
  turn,
  children,
  footer,
}: {
  turn: { question: string; answer: string; status: string; error?: string | null }
  children?: ReactNode
  footer?: ReactNode
}) {
  return (
    <article className="min-w-0 space-y-2" aria-label={turn.question}>
      <p className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap break-words rounded-box bg-base-content px-3 py-2 text-sm text-base-100">
        {turn.question}
      </p>
      {turn.status === "pending" ? (
        <p className="flex items-center gap-2 text-sm text-base-content/60" role="status">
          <LoaderCircle
            className="h-4 w-4 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          Thinking…
        </p>
      ) : turn.status === "failed" ? (
        <p className="text-sm text-error" role="alert">
          {turn.error || "The AI could not answer. Try asking again."}
        </p>
      ) : (
        <div className="space-y-2.5">
          <DeckMarkdown cardReferences className="text-sm leading-6 [&_p]:my-1.5">
            {turn.answer}
          </DeckMarkdown>
          {children}
        </div>
      )}
      {footer}
    </article>
  )
}
