import { CombinedGraphQLErrors } from "@apollo/client/errors"
import { useMutation, useQuery } from "@apollo/client/react"
import { useEffect, useRef } from "react"

import { useToast } from "../../components/ui/toast"
import { AnalyzeDeckDocument, DeckAnalysisJobDocument } from "./deck-analysis-documents"

export function useDeckAnalysis(deck: { id: string; name: string }, enabled: boolean) {
  const { showToast } = useToast()
  const observedJob = useRef<{ deckId: string; jobId: string } | null>(null)
  const { data, previousData, error, loading, startPolling, stopPolling, refetch } = useQuery(
    DeckAnalysisJobDocument,
    {
      variables: { deckId: deck.id },
      skip: !enabled,
      fetchPolicy: "network-only",
      errorPolicy: "all",
      notifyOnNetworkStatusChange: false,
    },
  )
  const [enqueue, mutation] = useMutation(AnalyzeDeckDocument)
  const candidate = (data ?? previousData)?.deckAnalysisJob
  const job = enabled && candidate?.deck.id === deck.id ? candidate : undefined
  const pending = job?.status === "pending"

  useEffect(() => {
    if (pending) startPolling(2_000)
    else stopPolling()
    return () => stopPolling()
  }, [pending, startPolling, stopPolling])

  useEffect(() => {
    if (!job) return

    if (job.status === "pending") {
      observedJob.current = { deckId: deck.id, jobId: job.id }
      return
    }

    if (observedJob.current?.deckId !== deck.id || observedJob.current.jobId !== job.id) return
    observedJob.current = null

    showToast(
      job.status === "completed"
        ? "Deck analysis complete."
        : "Deck analysis could not be completed. Try again.",
      { id: `deck-analysis-${deck.id}`, tone: job.status === "completed" ? "success" : "error" },
    )
  }, [deck.id, job, showToast])

  function checkStatus() {
    // A failed status request is not a failed analysis. Keep polling pending work.
    void refetch().catch(() => undefined)
  }

  function analyze() {
    if (!enabled || pending || mutation.loading) return

    void enqueue({
      variables: { id: deck.id },
      update(cache, { data: result }) {
        if (!result?.analyzeDeck?.job) return
        cache.writeQuery({
          query: DeckAnalysisJobDocument,
          variables: { deckId: deck.id },
          data: { deckAnalysisJob: result.analyzeDeck.job },
        })
      },
      onCompleted: () =>
        showToast(`Analysis queued for ${deck.name}. You can leave this page.`, {
          id: `deck-analysis-${deck.id}`,
          tone: "info",
        }),
      onError: (requestError) => {
        showToast(
          CombinedGraphQLErrors.is(requestError)
            ? requestError.message
            : "Could not confirm the analysis request. Checking its status…",
          { id: `deck-analysis-${deck.id}`, tone: "error" },
        )
        checkStatus()
      },
    })
  }

  return {
    analyze,
    checkStatus,
    pending: pending || mutation.loading,
    checking: enabled && loading,
    failed: job?.status === "failed",
    connectionError: enabled && Boolean(error),
  }
}
