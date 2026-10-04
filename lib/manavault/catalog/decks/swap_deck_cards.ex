defmodule Manavault.Catalog.Decks.SwapDeckCards do
  @moduledoc """
  Stages mainboard cuts and adds against a deck as one swap.

  `preview/2` applies the swap to the preloaded decklist in memory and runs
  `DeckLegality.evaluate/1` on the result, so the Swap cards workbench shows
  the same legality rules the deck detail page uses. `apply/2` commits every
  cut and add inside a single transaction; any failure rolls the whole swap
  back.

  A swap is a map with:

    * `:cuts` - `%{deck_card_id, quantity, destination}` where `destination`
      is `:remove` (delete copies) or `:considering` (move copies to the
      Considering board).
    * `:adds` - `%{deck_card_id, quantity}` to move copies of a Considering
      card into the mainboard, or `%{name, quantity}` to add a new card.
  """

  import Ecto.Query

  alias Manavault.Catalog.{Card, Deck, DeckCard, DeckLegality}

  alias Manavault.Catalog.Decks.{
    AddCardToDeck,
    DeleteDeckCard,
    EditGuard,
    Preloads,
    TrimDeckCardAllocations,
    UpdateDeckCard
  }

  alias Manavault.Catalog.Search.CardsByName
  alias Manavault.Repo

  @considering "considering"
  @mainboard "mainboard"

  def preview(%Deck{} = deck, swap) do
    deck = Repo.preload(deck, Preloads.deck_preloads())

    with {:ok, swap} <- normalize(swap),
         :ok <- validate_references(deck.deck_cards, swap) do
      {added_cards, unresolved_names} = resolve_added_cards(deck.deck_cards, swap.adds)
      deck_cards = apply_cuts_in_memory(deck.deck_cards, swap.cuts) ++ added_cards

      {:ok,
       %{
         legality: DeckLegality.evaluate(%{deck | deck_cards: deck_cards}),
         card_count: DeckCard.counted_quantity(deck_cards),
         unresolved_names: unresolved_names
       }}
    end
  end

  def apply(%Deck{} = deck, swap) do
    with :ok <- EditGuard.ensure_decklist_editable(deck),
         {:ok, swap} <- normalize(swap) do
      Repo.transact(fn ->
        deck_cards = Repo.all(from deck_card in DeckCard, where: deck_card.deck_id == ^deck.id)

        with :ok <- validate_references(deck_cards, swap) do
          Enum.each(swap.cuts, &apply_cut!(deck, &1))
          Enum.each(swap.adds, &apply_add!(deck, &1))
          {:ok, Repo.get!(Deck, deck.id)}
        end
      end)
    end
  end

  ## Normalization and validation

  defp normalize(swap) when is_map(swap) do
    cuts = Enum.map(Map.get(swap, :cuts) || [], &normalize_cut/1)
    adds = Enum.map(Map.get(swap, :adds) || [], &normalize_add/1)
    entries = cuts ++ adds

    cond do
      entries == [] -> {:error, :empty_swap}
      Enum.any?(entries, &(&1 == :invalid)) -> {:error, :invalid_swap}
      duplicate_references?(cuts, adds) -> {:error, :duplicate_swap_entry}
      true -> {:ok, %{cuts: cuts, adds: adds}}
    end
  end

  defp normalize(_swap), do: {:error, :invalid_swap}

  defp normalize_cut(%{deck_card_id: id, quantity: quantity} = cut)
       when not is_nil(id) and is_integer(quantity) and quantity > 0 do
    case Map.get(cut, :destination) || :remove do
      destination when destination in [:remove, :considering] ->
        %{deck_card_id: id, quantity: quantity, destination: destination}

      _destination ->
        :invalid
    end
  end

  defp normalize_cut(_cut), do: :invalid

  defp normalize_add(%{deck_card_id: id, quantity: quantity})
       when not is_nil(id) and is_integer(quantity) and quantity > 0,
       do: %{deck_card_id: id, name: nil, quantity: quantity}

  defp normalize_add(%{name: name, quantity: quantity})
       when is_binary(name) and is_integer(quantity) and quantity > 0 do
    case String.trim(name) do
      "" -> :invalid
      name -> %{deck_card_id: nil, name: name, quantity: quantity}
    end
  end

  defp normalize_add(_add), do: :invalid

  defp duplicate_references?(cuts, adds) do
    ids = Enum.map(cuts, & &1.deck_card_id) ++ Enum.flat_map(adds, &List.wrap(&1.deck_card_id))
    names = adds |> Enum.flat_map(&List.wrap(&1.name)) |> Enum.map(&CardsByName.key/1)

    length(Enum.uniq(ids)) != length(ids) or length(Enum.uniq(names)) != length(names)
  end

  defp validate_references(deck_cards, swap) do
    by_id = Map.new(deck_cards, &{&1.id, &1})

    swap.cuts
    |> Enum.map(&{&1, :cut})
    |> Enum.concat(swap.adds |> Enum.filter(& &1.deck_card_id) |> Enum.map(&{&1, :add}))
    |> Enum.reduce_while(:ok, fn {entry, kind}, :ok ->
      case validate_reference(Map.get(by_id, entry.deck_card_id), entry, kind) do
        :ok -> {:cont, :ok}
        error -> {:halt, error}
      end
    end)
  end

  defp validate_reference(nil, _entry, _kind), do: {:error, :not_found}

  defp validate_reference(%DeckCard{zone: @considering}, _entry, :cut),
    do: {:error, :swap_cut_not_in_deck}

  defp validate_reference(%DeckCard{zone: zone}, _entry, :add) when zone != @considering,
    do: {:error, :swap_add_not_considering}

  defp validate_reference(%DeckCard{quantity: available}, %{quantity: quantity}, _kind)
       when quantity > available,
       do: {:error, :swap_quantity_exceeds_deck_card}

  defp validate_reference(%DeckCard{}, _entry, _kind), do: :ok

  ## Preview

  defp apply_cuts_in_memory(deck_cards, cuts) do
    cut_quantities = Map.new(cuts, &{&1.deck_card_id, &1.quantity})

    # Cut copies leave the counted deck whether they are removed or moved to
    # Considering, so both destinations evaluate the same way.
    Enum.flat_map(deck_cards, fn deck_card ->
      remaining = deck_card.quantity - Map.get(cut_quantities, deck_card.id, 0)
      if remaining > 0, do: [%{deck_card | quantity: remaining}], else: []
    end)
  end

  defp resolve_added_cards(deck_cards, adds) do
    by_id = Map.new(deck_cards, &{&1.id, &1})

    Enum.reduce(adds, {[], []}, fn add, {cards, unresolved} ->
      case added_card(add, by_id) do
        %Card{} = card ->
          deck_card = %DeckCard{
            card: card,
            oracle_id: card.oracle_id,
            quantity: add.quantity,
            zone: @mainboard
          }

          {cards ++ [deck_card], unresolved}

        nil ->
          {cards, unresolved ++ [add.name]}
      end
    end)
  end

  defp added_card(%{deck_card_id: nil, name: name}, _by_id), do: CardsByName.find(name)
  defp added_card(%{deck_card_id: id}, by_id), do: by_id |> Map.fetch!(id) |> Map.get(:card)

  ## Apply

  defp apply_cut!(deck, %{deck_card_id: id, quantity: quantity, destination: destination}) do
    deck_card = Repo.get!(DeckCard, id)

    if destination == :considering and quantity == deck_card.quantity and
         not zone_row_exists?(deck_card, @considering) do
      deck_card
      |> UpdateDeckCard.run(%{"zone" => @considering, "tag" => cleared_cut_tag(deck_card.tag)})
      |> ok!()
    else
      reduce_or_delete!(deck_card, quantity)

      if destination == :considering do
        add_copies!(deck, deck_card, quantity, @considering)
      end
    end
  end

  defp apply_add!(deck, %{deck_card_id: nil, name: name, quantity: quantity}) do
    deck
    |> AddCardToDeck.run(%{"name" => name, "quantity" => quantity, "zone" => @mainboard})
    |> ok!()
  end

  defp apply_add!(deck, %{deck_card_id: id, quantity: quantity}) do
    deck_card = Repo.get!(DeckCard, id)

    if quantity == deck_card.quantity and not zone_row_exists?(deck_card, @mainboard) do
      deck_card |> UpdateDeckCard.run(%{"zone" => @mainboard}) |> ok!()
    else
      reduce_or_delete!(deck_card, quantity)
      add_copies!(deck, deck_card, quantity, @mainboard)
    end
  end

  defp reduce_or_delete!(%DeckCard{quantity: quantity} = deck_card, cut) when cut >= quantity do
    deck_card |> DeleteDeckCard.run() |> ok!()
  end

  defp reduce_or_delete!(%DeckCard{} = deck_card, cut) do
    deck_card
    |> UpdateDeckCard.run(%{"quantity" => deck_card.quantity - cut})
    |> ok!()
    |> TrimDeckCardAllocations.run!()
  end

  defp add_copies!(deck, %DeckCard{} = source, quantity, zone) do
    deck
    |> AddCardToDeck.run(%{
      "oracle_id" => source.oracle_id,
      "quantity" => quantity,
      "zone" => zone,
      "finish" => source.finish,
      "preferred_printing_id" => source.preferred_printing_id
    })
    |> ok!()
  end

  defp zone_row_exists?(%DeckCard{deck_id: deck_id, oracle_id: oracle_id}, zone) do
    Repo.exists?(
      from deck_card in DeckCard,
        where:
          deck_card.deck_id == ^deck_id and deck_card.oracle_id == ^oracle_id and
            deck_card.zone == ^zone
    )
  end

  defp cleared_cut_tag("consider_cutting"), do: nil
  defp cleared_cut_tag(tag), do: tag

  defp ok!({:ok, value}), do: value
  defp ok!({:error, reason}), do: Repo.rollback(reason)
end
