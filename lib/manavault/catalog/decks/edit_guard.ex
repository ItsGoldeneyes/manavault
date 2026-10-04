defmodule Manavault.Catalog.Decks.EditGuard do
  @moduledoc """
  Two tiers of deck write protection:

    * `ensure_deck_editable/1` — archived decks are frozen entirely.
    * `ensure_decklist_editable/1` — additionally refuses decks linked to an
      external source (Moxfield/Archidekt), whose card list is owned by the
      remote deck and only changes through sync. Allocation flows keep using
      the archived-only guard so linked decks can still reserve collection
      cards.
  """

  alias Manavault.Catalog.{Deck, DeckCard}
  alias Manavault.Repo

  def ensure_deck_editable(%Deck{status: "archived"}), do: {:error, :deck_archived}
  def ensure_deck_editable(%Deck{}), do: :ok

  def ensure_deck_card_editable(%DeckCard{} = deck_card) do
    deck_card |> deck_of() |> ensure_deck_editable()
  end

  def ensure_deck_cards_editable(deck_cards) when is_list(deck_cards) do
    each_ok(deck_cards, &ensure_deck_card_editable/1)
  end

  def ensure_decklist_editable(%Deck{} = deck) do
    with :ok <- ensure_deck_editable(deck) do
      if Deck.linked?(deck), do: {:error, :deck_linked}, else: :ok
    end
  end

  def ensure_deck_card_decklist_editable(%DeckCard{} = deck_card) do
    deck_card |> deck_of() |> ensure_decklist_editable()
  end

  def ensure_deck_cards_decklist_editable(deck_cards) when is_list(deck_cards) do
    each_ok(deck_cards, &ensure_deck_card_decklist_editable/1)
  end

  defp deck_of(%DeckCard{deck: %Deck{} = deck}), do: deck

  defp deck_of(%DeckCard{} = deck_card) do
    deck_card |> Repo.preload(:deck) |> Map.fetch!(:deck)
  end

  defp each_ok(items, check) do
    Enum.reduce_while(items, :ok, fn item, :ok ->
      case check.(item) do
        :ok -> {:cont, :ok}
        {:error, reason} -> {:halt, {:error, reason}}
      end
    end)
  end
end
