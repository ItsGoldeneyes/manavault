import { Badge } from "../../components/ui/badge"

type BracketDeck = {
  commanderBracket?: number | null
  commanderBracketEstimate?: number | null
  commanderBracketRating?: string | null
}

export function commanderBracketLabel(deck: BracketDeck) {
  const official = deck.commanderBracket
  const practical = deck.commanderBracketEstimate

  if (!official || official < 1 || official > 5) return null
  if (deck.commanderBracketRating) return `Bracket ${deck.commanderBracketRating}`
  if (practical && practical >= 1 && practical <= 5 && practical !== official) {
    return `Bracket ${Math.max(official, practical)}-`
  }

  return `Bracket ${official}`
}

export function DeckBracketBadge({ deck }: { deck: BracketDeck }) {
  const label = commanderBracketLabel(deck)
  if (!label) return null

  return (
    <Badge
      tone="warning"
      className="h-auto min-h-5 whitespace-normal py-0.5 leading-tight"
      title="AI bracket rating: − lower end, no suffix typical, + upper end. See the analysis for pace and official WotC guidance."
    >
      {label}
    </Badge>
  )
}
