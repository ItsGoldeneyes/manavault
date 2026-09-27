defmodule Manavault.Catalog.CardCollection.SearchFilter.ScalarPredicates do
  @moduledoc false

  import Ecto.Query

  alias Manavault.Catalog.CardCollection.SearchFilter.{ColorPredicates, TextPredicates, Values}
  alias Manavault.Catalog.DeckAllocation
  alias Manavault.Catalog.Search.ScalarPredicates, as: Shared

  import Manavault.Catalog.PriceFragments, only: [price_value_fragment: 2]

  # Card/printing predicates are identical to the catalog card search; they live
  # in Search.ScalarPredicates and resolve via the :card / :printing bindings.
  defdelegate mana_value(op, value), to: Shared
  defdelegate rarity(op, value), to: Shared
  defdelegate set(op, value), to: Shared
  defdelegate collector_number(op, value), to: Shared
  defdelegate date(op, value), to: Shared
  defdelegate year(op, value), to: Shared

  def language(op, value) when op in [:colon, :eq, :neq] do
    value = Values.downcase(value)

    condition =
      dynamic([item, _printing, _card, _location], fragment("lower(?)", item.language) == ^value)

    if op == :neq,
      do: dynamic([item, printing, card, location], not (^condition)),
      else: condition
  end

  def language(_op, _value), do: dynamic(false)

  def price(op, value) do
    case Float.parse(value) do
      {number, ""} ->
        case Values.comparison_op(op) do
          :eq ->
            dynamic(
              [item, printing, _card, _location],
              price_value_fragment(item, printing) == ^number
            )

          :neq ->
            dynamic(
              [item, printing, _card, _location],
              price_value_fragment(item, printing) != ^number
            )

          :gt ->
            dynamic(
              [item, printing, _card, _location],
              price_value_fragment(item, printing) > ^number
            )

          :gte ->
            dynamic(
              [item, printing, _card, _location],
              price_value_fragment(item, printing) >= ^number
            )

          :lt ->
            dynamic(
              [item, printing, _card, _location],
              price_value_fragment(item, printing) < ^number
            )

          :lte ->
            dynamic(
              [item, printing, _card, _location],
              price_value_fragment(item, printing) <= ^number
            )
        end

      _invalid ->
        dynamic(false)
    end
  end

  # Purchase price is stored per copy in cents; the query value is in dollars.
  # Copies without a recorded purchase price never satisfy a comparison.
  def purchase_price(op, value) do
    case value |> String.trim_leading("$") |> Float.parse() do
      {dollars, ""} ->
        cents = round(dollars * 100)

        case Values.comparison_op(op) do
          :eq ->
            dynamic([item, _printing, _card, _location], item.purchase_price_cents == ^cents)

          :neq ->
            dynamic([item, _printing, _card, _location], item.purchase_price_cents != ^cents)

          :gt ->
            dynamic([item, _printing, _card, _location], item.purchase_price_cents > ^cents)

          :gte ->
            dynamic([item, _printing, _card, _location], item.purchase_price_cents >= ^cents)

          :lt ->
            dynamic([item, _printing, _card, _location], item.purchase_price_cents < ^cents)

          :lte ->
            dynamic([item, _printing, _card, _location], item.purchase_price_cents <= ^cents)
        end

      _invalid ->
        dynamic(false)
    end
  end

  # Compares the date a copy was added (inserted_at) at UTC-day granularity, so
  # `added<=2026-09-01` includes everything added during that day.
  def added(op, value) do
    case Date.from_iso8601(value) do
      {:ok, date} ->
        day_start = DateTime.new!(date, ~T[00:00:00], "Etc/UTC")
        next_day_start = DateTime.add(day_start, 1, :day)

        case Values.comparison_op(op) do
          :eq ->
            dynamic(
              [item, _printing, _card, _location],
              item.inserted_at >= ^day_start and item.inserted_at < ^next_day_start
            )

          :neq ->
            dynamic(
              [item, _printing, _card, _location],
              item.inserted_at < ^day_start or item.inserted_at >= ^next_day_start
            )

          :gt ->
            dynamic([item, _printing, _card, _location], item.inserted_at >= ^next_day_start)

          :gte ->
            dynamic([item, _printing, _card, _location], item.inserted_at >= ^day_start)

          :lt ->
            dynamic([item, _printing, _card, _location], item.inserted_at < ^day_start)

          :lte ->
            dynamic([item, _printing, _card, _location], item.inserted_at < ^next_day_start)
        end

      _invalid ->
        dynamic(false)
    end
  end

  def is_predicate(op, value) when op in [:colon, :eq, :neq] do
    value = Values.downcase(value)

    condition =
      case value do
        "foil" ->
          dynamic([item, _printing, _card, _location], item.finish == "foil")

        "nonfoil" ->
          dynamic([item, _printing, _card, _location], item.finish == "nonfoil")

        "etched" ->
          dynamic([item, _printing, _card, _location], item.finish == "etched")

        "allocated" ->
          allocated_to_deck()

        "unallocated" ->
          dynamic([item, printing, card, location], not (^allocated_to_deck()))

        "paid" ->
          dynamic([item, _printing, _card, _location], not is_nil(item.purchase_price_cents))

        "unpaid" ->
          dynamic([item, _printing, _card, _location], is_nil(item.purchase_price_cents))

        "colorless" ->
          ColorPredicates.count(:colors, :eq, 0, :eq)

        "multicolor" ->
          ColorPredicates.count(:colors, :gte, 2, :gte)

        "land" ->
          TextPredicates.field(:type, :colon, "land")

        "creature" ->
          TextPredicates.field(:type, :colon, "creature")

        "artifact" ->
          TextPredicates.field(:type, :colon, "artifact")

        "enchantment" ->
          TextPredicates.field(:type, :colon, "enchantment")

        "planeswalker" ->
          TextPredicates.field(:type, :colon, "planeswalker")

        "instant" ->
          TextPredicates.field(:type, :colon, "instant")

        "sorcery" ->
          TextPredicates.field(:type, :colon, "sorcery")

        "permanent" ->
          permanent()

        "spell" ->
          dynamic(
            [_item, _printing, card, _location],
            not fragment("lower(coalesce(?, '')) LIKE '%land%'", card.type_line)
          )

        _unsupported ->
          dynamic(false)
      end

    if op == :neq,
      do: dynamic([item, printing, card, location], not (^condition)),
      else: condition
  end

  def is_predicate(_op, _value), do: dynamic(false)

  def quantity(op, value) do
    case Integer.parse(value) do
      {number, ""} ->
        case Values.comparison_op(op) do
          :eq -> dynamic([item, _printing, _card, _location], item.quantity == ^number)
          :neq -> dynamic([item, _printing, _card, _location], item.quantity != ^number)
          :gt -> dynamic([item, _printing, _card, _location], item.quantity > ^number)
          :gte -> dynamic([item, _printing, _card, _location], item.quantity >= ^number)
          :lt -> dynamic([item, _printing, _card, _location], item.quantity < ^number)
          :lte -> dynamic([item, _printing, _card, _location], item.quantity <= ^number)
        end

      _invalid ->
        dynamic(false)
    end
  end

  defp allocated_to_deck do
    allocated_item_ids = from allocation in DeckAllocation, select: allocation.collection_item_id

    dynamic(
      [item, _printing, _card, _location],
      item.id in subquery(allocated_item_ids)
    )
  end

  defp permanent do
    Enum.reduce(
      ~w(artifact creature enchantment land planeswalker battle),
      dynamic(false),
      fn type, acc ->
        dynamic(
          [item, printing, card, location],
          ^acc or ^TextPredicates.field(:type, :colon, type)
        )
      end
    )
  end
end
