import { LoaderCircle, ShieldAlert, ShieldCheck } from "lucide-react"

import { cn, pluralize } from "../../lib/utils"
import type { SwapIssue } from "./deck-swap-model"

export type SwapLegalityState =
  | { kind: "current"; status: "legal" | "illegal"; issueCount: number }
  | { kind: "checking" }
  | { kind: "error"; message: string }
  | {
      kind: "preview"
      introduced: SwapIssue[]
      persisting: SwapIssue[]
      resolved: SwapIssue[]
      stale: boolean
      status: "legal" | "illegal"
      unresolvedNames: string[]
    }

function IssueList({ issues, tone }: { issues: SwapIssue[]; tone: "new" | "resolved" | "open" }) {
  if (!issues.length) return null

  const label = { new: "New", resolved: "Resolved", open: "Still open" }[tone]

  return (
    <div>
      <h4
        className={cn(
          "text-[0.6875rem] font-black uppercase tracking-[0.16em]",
          tone === "new" && "text-error",
          tone === "resolved" && "text-success",
          tone === "open" && "text-base-content/50",
        )}
      >
        {label}
      </h4>
      <ul className="mt-1 space-y-1">
        {issues.map((issue) => (
          <li
            key={`${issue.code}:${issue.cardName ?? ""}`}
            className={cn(
              "text-xs leading-snug",
              tone === "resolved"
                ? "text-base-content/55 line-through decoration-success/60"
                : "text-base-content/80",
            )}
          >
            {issue.message}
          </li>
        ))}
      </ul>
    </div>
  )
}

function StatusLine({
  detail,
  pending,
  status,
}: {
  detail: string
  pending?: boolean
  status: "legal" | "illegal"
}) {
  const Icon = status === "legal" ? ShieldCheck : ShieldAlert

  return (
    <div className="flex items-center gap-2">
      <Icon
        className={cn("h-4 w-4 shrink-0", status === "legal" ? "text-success" : "text-error")}
        aria-hidden="true"
      />
      <span className="text-sm font-bold">{detail}</span>
      {pending ? (
        <LoaderCircle
          className="ml-auto h-3.5 w-3.5 animate-spin text-base-content/40 motion-reduce:animate-none"
          aria-label="Checking legality"
        />
      ) : null}
    </div>
  )
}

export function SwapLegalityPanel({ legality }: { legality: SwapLegalityState }) {
  return (
    <div
      aria-live="polite"
      className="space-y-3 border-b border-base-300 bg-base-200/40 px-3 py-3"
      data-testid="swap-legality"
    >
      {legality.kind === "current" ? (
        <StatusLine
          status={legality.status}
          detail={
            legality.status === "legal"
              ? "Deck is legal now"
              : `Deck is illegal now · ${pluralize(legality.issueCount, "issue")}`
          }
        />
      ) : null}
      {legality.kind === "checking" ? (
        <div className="flex items-center gap-2 text-sm font-bold text-base-content/60">
          <LoaderCircle
            className="h-4 w-4 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          Checking legality…
        </div>
      ) : null}
      {legality.kind === "error" ? (
        <p role="alert" className="text-sm text-error">
          {legality.message}
        </p>
      ) : null}
      {legality.kind === "preview" ? (
        <div className={cn("space-y-3 transition-opacity", legality.stale && "opacity-60")}>
          <StatusLine
            pending={legality.stale}
            status={legality.status}
            detail={legality.status === "legal" ? "Legal after swap" : "Illegal after swap"}
          />
          {legality.unresolvedNames.length ? (
            <p className="text-xs text-error">
              Not found in the catalog: {legality.unresolvedNames.join(", ")}
            </p>
          ) : null}
          <div className="max-h-44 space-y-3 overflow-y-auto">
            <IssueList issues={legality.introduced} tone="new" />
            <IssueList issues={legality.resolved} tone="resolved" />
            <IssueList issues={legality.persisting} tone="open" />
          </div>
        </div>
      ) : null}
    </div>
  )
}
