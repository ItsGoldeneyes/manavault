import { graphql } from "../../gql"

export const DeckSwapPreviewDocument = graphql(`
  query DeckSwapPreview($deckId: ID!, $input: DeckSwapInput!) {
    deckSwapPreview(deckId: $deckId, input: $input) {
      cardCount
      unresolvedNames
      legality {
        status
        issues {
          code
          message
          severity
          cardName
        }
      }
    }
  }
`)

export const ApplyDeckSwapDocument = graphql(`
  mutation ApplyDeckSwap($deckId: ID!, $input: DeckSwapInput!) {
    applyDeckSwap(deckId: $deckId, input: $input) {
      deck {
        id
        cardCount
        legality {
          status
        }
      }
    }
  }
`)
