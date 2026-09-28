import { graphql } from "../../gql"
import type { ScannerPrintingsQuery } from "../../gql/graphql"
import { isFinish, type PrintingOption } from "./printing-choice"

export const ScannerPrintingsDocument = graphql(`
  query ScannerPrintings($scryfallId: ID!, $illustrationId: ID) {
    scannerPrintings(scryfallId: $scryfallId, illustrationId: $illustrationId) {
      id
      scryfallId
      setCode
      setName
      collectorNumber
      lang
      rarity
      illustrationId
      ownedCount
      finishes
      promo
      releasedAt
      imageUrl
      nonfoilCents: priceCents(finish: "nonfoil")
      foilCents: priceCents(finish: "foil")
      etchedCents: priceCents(finish: "etched")
      card {
        id
        name
      }
    }
  }
`)

type ScannerPrinting = ScannerPrintingsQuery["scannerPrintings"][number]

export function printingOption(printing: ScannerPrinting): PrintingOption {
  const finishes = (printing.finishes ?? []).filter(isFinish)
  return {
    scryfallId: printing.scryfallId,
    name: printing.card?.name ?? "",
    setCode: printing.setCode ?? "",
    setName: printing.setName,
    collectorNumber: printing.collectorNumber ?? "",
    lang: printing.lang ?? "en",
    rarity: printing.rarity,
    illustrationId: printing.illustrationId,
    ownedCount: printing.ownedCount,
    finishes: finishes.length > 0 ? finishes : ["nonfoil"],
    promo: printing.promo,
    releasedAt: printing.releasedAt,
    imageUrl: printing.imageUrl,
    // priceCents falls back across finishes; only offer a finish's price if it is printed.
    prices: {
      nonfoil: finishes.includes("nonfoil") ? printing.nonfoilCents : null,
      foil: finishes.includes("foil") ? printing.foilCents : null,
      etched: finishes.includes("etched") ? printing.etchedCents : null,
    },
  }
}
