defmodule Manavault.Catalog.CardCollection.ItemQueries.ValueSummary do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.CardCollection.ItemQueries.Base
  alias Manavault.Catalog.CollectionItem
  alias Manavault.Catalog.DeckAllocation
  alias Manavault.Catalog.Printing
  alias Manavault.Repo

  import Manavault.Catalog.PriceFragments,
    only: [
      price_value_fragment: 2,
      price_cents_fragment: 2,
      current_total_cents_fragment: 2,
      purchase_total_cents_fragment: 2
    ]

  def value_summary(filters \\ [])

  def value_summary([]) do
    CollectionItem
    |> join(:inner, [item], printing in assoc(item, :printing))
    |> join(:left, [item, _printing], location in assoc(item, :location_assoc))
    |> where([_item, _printing, location], is_nil(location.id) or location.kind != "list")
    |> select([item, printing, _location], %{
      item_count: coalesce(sum(item.quantity), 0),
      total_price_cents: current_total_cents_fragment(item, printing),
      purchase_price_cents: purchase_total_cents_fragment(item, printing)
    })
    |> Repo.one()
    |> normalize_value_summary()
  end

  def value_summary(filters) when is_list(filters) do
    filters
    |> Base.base_query()
    |> select([item, printing, _card, _location], %{
      item_count: coalesce(sum(item.quantity), 0),
      total_price_cents: current_total_cents_fragment(item, printing),
      purchase_price_cents: purchase_total_cents_fragment(item, printing)
    })
    |> Repo.one()
    |> normalize_value_summary()
  end

  def value_dashboard do
    summary = value_summary()
    positions = value_positions()

    gains = Enum.filter(positions, &(&1.value_gain_cents > 0))
    losses = Enum.filter(positions, &(&1.value_gain_cents < 0))

    rankings =
      attach_ranked_printings(%{
        biggest_gains: Enum.sort_by(gains, &{-&1.value_gain_cents, &1.scryfall_id}),
        biggest_losses: Enum.sort_by(losses, &{&1.value_gain_cents, &1.scryfall_id}),
        biggest_percent_gains:
          gains
          |> Enum.filter(&(&1.purchase_price_cents > 0))
          |> Enum.sort_by(&{-gain_ratio(&1), -&1.value_gain_cents, &1.scryfall_id}),
        biggest_percent_losses:
          losses
          |> Enum.filter(&(&1.purchase_price_cents > 0))
          |> Enum.sort_by(&{gain_ratio(&1), &1.value_gain_cents, &1.scryfall_id})
      })

    Map.merge(rankings, %{
      summary: summary,
      item_count: summary.item_count,
      position_count: length(positions),
      gain_position_count: length(gains),
      loss_position_count: length(losses),
      unchanged_position_count: length(positions) - length(gains) - length(losses)
    })
  end

  defp gain_ratio(position), do: position.value_gain_cents / position.purchase_price_cents

  defp attach_ranked_printings(rankings) do
    rankings = Map.new(rankings, fn {key, positions} -> {key, Enum.take(positions, 5)} end)

    attached =
      rankings
      |> Map.values()
      |> List.flatten()
      |> Enum.uniq_by(& &1.scryfall_id)
      |> attach_printings()
      |> Map.new(&{&1.scryfall_id, &1})

    Map.new(rankings, fn {key, positions} ->
      {key, Enum.flat_map(positions, &List.wrap(attached[&1.scryfall_id]))}
    end)
  end

  def location_summaries do
    allocated_item_ids = from allocation in DeckAllocation, select: allocation.collection_item_id

    CollectionItem
    |> join(:inner, [item], printing in assoc(item, :printing))
    |> where([item], item.id not in subquery(allocated_item_ids))
    |> group_by([item], item.location_id)
    |> select([item, printing], %{
      location_id: item.location_id,
      item_count: coalesce(sum(item.quantity), 0),
      total_price_cents: current_total_cents_fragment(item, printing),
      purchase_price_cents: purchase_total_cents_fragment(item, printing)
    })
    |> Repo.all()
    |> Map.new(fn summary -> {summary.location_id, normalize_value_summary(summary)} end)
  end

  defp value_positions do
    CollectionItem
    |> join(:inner, [item], printing in assoc(item, :printing))
    |> join(:left, [item, _printing], location in assoc(item, :location_assoc))
    |> where([_item, _printing, location], is_nil(location.id) or location.kind != "list")
    |> group_by([item, _printing, _location], item.scryfall_id)
    |> select([item, printing, _location], %{
      scryfall_id: item.scryfall_id,
      quantity: coalesce(sum(item.quantity), 0),
      total_price_cents: current_total_cents_fragment(item, printing),
      purchase_price_cents: purchase_total_cents_fragment(item, printing)
    })
    |> Repo.all()
    |> Enum.map(&normalize_value_position/1)
  end

  defp attach_printings([]), do: []

  defp attach_printings(positions) do
    printing_ids = Enum.map(positions, & &1.scryfall_id)

    printings =
      Printing
      |> where([printing], printing.scryfall_id in ^printing_ids)
      |> preload(:card)
      |> Repo.all()
      |> Map.new(&{&1.scryfall_id, &1})

    items_by_printing =
      CollectionItem
      |> join(:left, [item], location in assoc(item, :location_assoc))
      |> where([item, _location], item.scryfall_id in ^printing_ids)
      |> where([_item, location], is_nil(location.id) or location.kind != "list")
      |> Repo.all()
      |> Enum.group_by(& &1.scryfall_id)

    Enum.flat_map(positions, fn position ->
      case Map.fetch(printings, position.scryfall_id) do
        {:ok, printing} ->
          [
            Map.merge(position, %{
              printing: printing,
              items: Map.get(items_by_printing, position.scryfall_id, [])
            })
          ]

        :error ->
          []
      end
    end)
  end

  defp normalize_value_position(position) do
    total = integer_or_zero(position.total_price_cents)
    purchase = integer_or_zero(position.purchase_price_cents)

    %{
      position
      | quantity: integer_or_zero(position.quantity),
        total_price_cents: total,
        purchase_price_cents: purchase
    }
    |> Map.put(:value_gain_cents, total - purchase)
  end

  defp normalize_value_summary(nil) do
    %{item_count: 0, total_price_cents: 0, purchase_price_cents: 0}
  end

  defp normalize_value_summary(summary) do
    %{
      summary
      | item_count: integer_or_zero(summary.item_count),
        total_price_cents: integer_or_zero(summary.total_price_cents),
        purchase_price_cents: integer_or_zero(summary.purchase_price_cents)
    }
  end

  defp integer_or_zero(nil), do: 0
  defp integer_or_zero(value) when is_integer(value), do: value
  defp integer_or_zero(value) when is_float(value), do: round(value)
end
