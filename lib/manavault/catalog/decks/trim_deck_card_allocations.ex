defmodule Manavault.Catalog.Decks.TrimDeckCardAllocations do
  @moduledoc """
  Releases reservations that no longer fit a deck card after its quantity
  drops. Proxies go first, then physical copies return to their source
  locations, so proxies plus allocations never exceed the deck card quantity.

  Must run inside a transaction; failures roll it back.
  """

  alias Manavault.Catalog.{DeckAllocation, DeckCard}
  alias Manavault.Catalog.Decks.AllocationItems
  alias Manavault.Repo

  def run!(%DeckCard{} = deck_card) do
    deck_card = Repo.preload(deck_card, [deck_allocations: [:collection_item]], force: true)
    physical = Enum.reduce(deck_card.deck_allocations, 0, &(&1.quantity + &2))

    trim_proxies!(deck_card, max(deck_card.quantity - physical, 0))
    release_physical!(deck_card.deck_allocations, physical - deck_card.quantity)

    deck_card
  end

  defp trim_proxies!(%DeckCard{proxy_quantity: proxy_quantity} = deck_card, limit)
       when proxy_quantity > limit do
    deck_card
    |> DeckCard.changeset(%{"proxy_quantity" => limit})
    |> Repo.update()
    |> ok!()
  end

  defp trim_proxies!(_deck_card, _limit), do: :ok

  defp release_physical!(_allocations, excess) when excess <= 0, do: :ok
  defp release_physical!([], _excess), do: :ok

  defp release_physical!([allocation | rest], excess) do
    released = min(allocation.quantity, excess)

    AllocationItems.restore_from_deck!(
      allocation.collection_item,
      released,
      allocation.source_location_id
    )

    if released == allocation.quantity do
      allocation |> Repo.delete() |> ok!()
    else
      allocation
      |> DeckAllocation.changeset(%{"quantity" => allocation.quantity - released})
      |> Repo.update()
      |> ok!()
    end

    release_physical!(rest, excess - released)
  end

  defp ok!({:ok, value}), do: value
  defp ok!({:error, reason}), do: Repo.rollback(reason)
end
