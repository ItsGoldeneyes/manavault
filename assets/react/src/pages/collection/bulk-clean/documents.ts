import { graphql } from "../../../gql"

export const CollectionBulkCleanDocument = graphql(`
  query CollectionBulkClean($maxPriceCents: Int, $minCopies: Int, $keepCopies: Int) {
    collectionBulkClean(
      maxPriceCents: $maxPriceCents
      minCopies: $minCopies
      keepCopies: $keepCopies
    ) {
      cardCount
      pullQuantity
      pullValueCents
      cards {
        cardId
        cardName
        totalCopies
        pullQuantity
        pulls {
          collectionItemId
          cardId
          cardName
          setCode
          collectorNumber
          imageUrl
          finish
          priceCents
          ownedQuantity
          quantity
          fromLocationId
          fromLocationName
        }
      }
    }
  }
`)
