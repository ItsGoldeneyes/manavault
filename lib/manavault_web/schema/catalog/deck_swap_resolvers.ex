defmodule ManavaultWeb.Schema.Catalog.DeckSwapResolvers do
  @moduledoc false

  alias Manavault.Catalog
  alias ManavaultWeb.Schema.Catalog.Errors
  alias ManavaultWeb.Schema.RelayHelpers

  def preview(_parent, %{deck_id: deck_id, input: input}, resolution) do
    with {:ok, deck_id} <- RelayHelpers.node_id(deck_id, :deck, resolution),
         {:ok, swap} <- parse_swap(input, resolution) do
      deck_id
      |> Catalog.get_deck!()
      |> Catalog.preview_deck_swap(swap)
      |> case do
        {:ok, preview} -> {:ok, preview}
        {:error, reason} -> {:error, Errors.deck_swap_error(reason)}
      end
    end
  end

  def apply(_parent, %{deck_id: deck_id, input: input}, resolution) do
    with {:ok, deck_id} <- RelayHelpers.node_id(deck_id, :deck, resolution),
         {:ok, swap} <- parse_swap(input, resolution) do
      deck_id
      |> Catalog.get_deck!(preload?: false)
      |> Catalog.apply_deck_swap(swap)
      |> case do
        {:ok, deck} -> {:ok, deck}
        {:error, reason} -> {:error, Errors.deck_swap_error(reason)}
      end
    end
  end

  defp parse_swap(input, resolution) do
    with {:ok, cuts} <- parse_entries(input.cuts, resolution),
         {:ok, adds} <- parse_entries(input.adds, resolution) do
      {:ok, %{cuts: cuts, adds: adds}}
    end
  end

  defp parse_entries(entries, resolution) do
    entries
    |> Enum.reduce_while({:ok, []}, fn entry, {:ok, parsed} ->
      case RelayHelpers.put_optional_node_id(entry, :deck_card_id, :deck_card, resolution) do
        {:ok, entry} -> {:cont, {:ok, [entry | parsed]}}
        {:error, message} -> {:halt, {:error, message}}
      end
    end)
    |> case do
      {:ok, parsed} -> {:ok, Enum.reverse(parsed)}
      error -> error
    end
  end
end
