import { graphql } from "../../gql"

export const DeckSwapChatDocument = graphql(`
  query DeckSwapChat($deckId: ID!, $threadId: String!) {
    deckQuestionAnswers(deckId: $deckId, threadId: $threadId) {
      id
      question
      answer
      status
      error
      recommendedCuts
      recommendedAdditions
    }
  }
`)

export const AskDeckSwapQuestionDocument = graphql(`
  mutation AskDeckSwapQuestion(
    $id: ID!
    $question: String!
    $threadId: String!
    $swapContext: DeckSwapContextInput
  ) {
    askDeckQuestion(id: $id, question: $question, threadId: $threadId, swapContext: $swapContext) {
      questionAnswer {
        id
        question
        answer
        status
        error
        recommendedCuts
        recommendedAdditions
      }
    }
  }
`)

export const DeckSwapAiSettingsDocument = graphql(`
  query DeckSwapAiSettings {
    aiSettings {
      hasApiKey
      model
    }
  }
`)
