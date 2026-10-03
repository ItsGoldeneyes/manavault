import { graphql } from "../../../gql"

export const CollectionValuePositionFragment = graphql(`
  fragment CollectionValuePositionFields on CollectionValuePosition {
    items {
      id
    }
    quantity
    totalPriceCents
    totalPriceText
    purchasePriceCents
    purchasePriceText
    valueGainCents
    valueGainText
    valueGainPercent
    valueGainPercentText
    printing {
      id
      scryfallId
      setCode
      setName
      collectorNumber
      imageUrl
      card {
        id
        name
      }
    }
  }
`)

export const CollectionValueDashboardDocument = graphql(`
  query CollectionValueDashboard {
    pricingSettings {
      source
    }
    collectionValueDashboard {
      summary {
        totalPriceCents
        totalPriceText
        purchasePriceCents
        purchasePriceText
        valueGainCents
        valueGainText
        valueGainPercent
        valueGainPercentText
      }
      itemCount
      positionCount
      gainPositionCount
      lossPositionCount
      unchangedPositionCount
      biggestGains {
        ...CollectionValuePositionFields
      }
      biggestLosses {
        ...CollectionValuePositionFields
      }
      biggestPercentGains {
        ...CollectionValuePositionFields
      }
      biggestPercentLosses {
        ...CollectionValuePositionFields
      }
    }
  }
`)
