import { render, screen } from "@testing-library/react"
import { expect, test } from "vitest"

import { DeckBracketBadge } from "../src/pages/decks/deck-bracket"

test.each([
  [2, 3, "Bracket 3-"],
  [4, 3, "Bracket 3+"],
  [3, 2, "Bracket 2+"],
  [3, 4, "Bracket 4-"],
])("official %i and practical %i displays %s", (official, practical, label) => {
  render(
    <DeckBracketBadge deck={{ commanderBracket: official, commanderBracketEstimate: practical }} />,
  )
  expect(screen.getByText(label)).toBeInstanceOf(HTMLElement)
  expect(
    screen.getByTitle(`Official Bracket ${official}; estimated to play like Bracket ${practical}`),
  ).toBeInstanceOf(HTMLElement)
  expect(screen.queryByText(/Pace/)).toBeNull()
})

test("bracket label is concise when guideline and practical brackets match", () => {
  const { container, rerender } = render(
    <DeckBracketBadge deck={{ commanderBracket: 3, commanderBracketEstimate: 3 }} />,
  )
  expect(screen.getByText("Bracket 3")).toBeInstanceOf(HTMLElement)

  rerender(<DeckBracketBadge deck={{ commanderBracket: null, commanderBracketEstimate: null }} />)
  expect(container.innerHTML).toBe("")
})
