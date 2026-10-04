defmodule Manavault.Catalog.Decks.ExternalSource do
  @moduledoc """
  Links a deck to a Moxfield or Archidekt deck and keeps its card list in
  step with the remote one.

  While linked, the remote deck owns the decklist: local decklist edits are
  refused by `EditGuard.ensure_decklist_editable/1`, and `sync/1` reconciles
  the local `deck_cards` against the fetched entries. Allocations are local
  state and survive syncs — a card's reservations are only trimmed when its
  quantity drops, cleared when it moves to Considering, and released when it
  leaves the remote deck entirely. Printing and finish follow the remote
  deck only until a physical copy is allocated, because allocation pins the
  deck card to the owned printing.
  """

  import Ecto.Query

  alias Ecto.Changeset
  alias Manavault.Catalog.{Deck, DeckCard, Printing}

  alias Manavault.Catalog.Decks.{
    ClearDeckCardAllocations,
    DeleteDeckCard,
    EditGuard,
    TrimDeckCardAllocations
  }

  alias Manavault.Catalog.Search.CardsByName
  alias Manavault.Repo
  alias Manavault.Trade.ListSource.{Archidekt, Moxfield}

  @sources %{"moxfield" => Moxfield, "archidekt" => Archidekt}

  @doc """
  Parses a Moxfield or Archidekt deck URL into
  `%{external_source, external_id, external_url}` (the canonical public URL).
  """
  def parse_url(url) when is_binary(url) do
    with {:ok, %URI{host: host, path: path}} when is_binary(host) and is_binary(path) <-
           URI.new(String.trim(url)),
         {:ok, source, module} <- source_for_host(host),
         {:ok, id} <- module.deck_id(path) do
      {:ok, %{external_source: source, external_id: id, external_url: module.public_url(id)}}
    else
      _other -> {:error, :invalid_external_url}
    end
  end

  def parse_url(_url), do: {:error, :invalid_external_url}

  @doc "Links `deck` to `url` and runs an initial sync."
  def link(%Deck{} = deck, url) do
    with :ok <- EditGuard.ensure_deck_editable(deck),
         {:ok, attrs} <- parse_url(url),
         {:ok, deck} <- deck |> Deck.external_source_changeset(attrs) |> Repo.update() do
      sync(deck)
    end
  end

  @doc "Detaches the deck from its external source. The decklist is kept as-is."
  def unlink(%Deck{} = deck) do
    if Deck.linked?(deck) do
      deck |> Deck.unlink_external_source_changeset() |> Repo.update()
    else
      {:error, :deck_not_linked}
    end
  end

  @doc """
  Fetches the remote deck and reconciles the local decklist against it.
  Returns `{:ok, %{deck: deck, unresolved: [name]}}`; the outcome (timestamp
  or error message) is recorded on the deck either way.
  """
  def sync(%Deck{external_source: source, external_id: id} = deck)
      when is_binary(source) and is_binary(id) do
    module = Map.fetch!(@sources, source)

    case module.fetch_deck(id) do
      {:ok, %{entries: entries}} -> apply_entries(deck, entries)
      {:error, reason} -> record_failure(deck, reason)
    end
  end

  def sync(%Deck{}), do: {:error, :deck_not_linked}

  @doc "Syncs every linked, non-archived deck; returns `[{deck_id, result}]`."
  def sync_all do
    Deck
    |> where([deck], not is_nil(deck.external_source) and deck.status != "archived")
    |> order_by([deck], asc: deck.id)
    |> Repo.all()
    |> Enum.map(fn deck -> {deck.id, sync(deck)} end)
  end

  defp source_for_host(host) do
    Enum.find_value(@sources, {:error, :invalid_external_url}, fn {source, module} ->
      if module.host?(host), do: {:ok, source, module}
    end)
  end

  defp apply_entries(%Deck{} = deck, entries) do
    {desired, unresolved} = resolve_entries(entries)

    result =
      Repo.transact(fn ->
        existing = existing_deck_cards_by_key(deck)
        {kept, removed} = Map.split(existing, Map.keys(desired))
        moved = reuse_removed_for_zone_moves(desired, kept, removed)

        Enum.each(desired, fn {key, attrs} ->
          cond do
            Map.has_key?(kept, key) -> update_deck_card!(Map.fetch!(kept, key), attrs)
            Map.has_key?(moved, key) -> move_deck_card!(Map.fetch!(moved, key), attrs)
            true -> insert_deck_card!(deck, attrs)
          end
        end)

        removed
        |> Map.drop(Enum.map(Map.values(moved), &deck_card_key/1))
        |> Map.values()
        |> Enum.each(&delete_deck_card!/1)

        deck
        |> Deck.external_sync_changeset(%{
          external_synced_at: DateTime.truncate(DateTime.utc_now(), :second),
          external_sync_error: nil
        })
        |> Repo.update()
      end)

    case result do
      {:ok, deck} -> {:ok, %{deck: deck, unresolved: unresolved}}
      {:error, reason} -> record_failure(deck, reason)
    end
  end

  # When a card left one zone and appeared in another (e.g. mainboard →
  # considering), carry the existing row over so its tags survive rather
  # than deleting and re-inserting.
  defp reuse_removed_for_zone_moves(desired, kept, removed) do
    removed_by_oracle =
      removed
      |> Map.values()
      |> Enum.group_by(& &1.oracle_id)

    desired
    |> Map.keys()
    |> Enum.reject(&Map.has_key?(kept, &1))
    |> Enum.reduce({%{}, removed_by_oracle}, fn {oracle_id, _zone} = key, {moved, pool} ->
      case Map.get(pool, oracle_id) do
        [deck_card | rest] -> {Map.put(moved, key, deck_card), Map.put(pool, oracle_id, rest)}
        _none -> {moved, pool}
      end
    end)
    |> elem(0)
  end

  defp resolve_entries(entries) do
    printings = printings_by_scryfall_id(entries)
    cards = entries |> Enum.map(& &1.name) |> CardsByName.by_names()

    {resolved, unresolved} =
      Enum.reduce(entries, {[], []}, fn entry, {resolved, unresolved} ->
        case resolve_entry(entry, printings, cards) do
          {:ok, attrs} -> {[attrs | resolved], unresolved}
          :error -> {resolved, [entry.name | unresolved]}
        end
      end)

    desired =
      resolved
      |> Enum.reverse()
      |> Enum.group_by(&{&1.oracle_id, &1.zone})
      |> Map.new(fn {key, group} -> {key, merge_group(group)} end)

    {desired, unresolved |> Enum.reverse() |> Enum.uniq()}
  end

  defp resolve_entry(entry, printings, cards) do
    case Map.get(printings, Map.get(entry, :scryfall_id)) do
      %Printing{} = printing ->
        {:ok,
         %{
           oracle_id: printing.oracle_id,
           zone: entry.zone,
           quantity: entry.quantity,
           finish: entry.finish,
           preferred_printing_id: printing.scryfall_id
         }}

      nil ->
        case Map.get(cards, CardsByName.key(entry.name)) do
          nil ->
            :error

          card ->
            {:ok,
             %{
               oracle_id: card.oracle_id,
               zone: entry.zone,
               quantity: entry.quantity,
               finish: entry.finish,
               preferred_printing_id: nil
             }}
        end
    end
  end

  defp merge_group([first | _rest] = group) do
    %{
      first
      | quantity: Enum.reduce(group, 0, &(&1.quantity + &2)),
        preferred_printing_id: Enum.find_value(group, & &1.preferred_printing_id)
    }
  end

  defp printings_by_scryfall_id(entries) do
    ids =
      entries
      |> Enum.map(&Map.get(&1, :scryfall_id))
      |> Enum.filter(&is_binary/1)
      |> Enum.uniq()

    case ids do
      [] ->
        %{}

      ids ->
        Printing
        |> where([printing], printing.scryfall_id in ^ids)
        |> Repo.all()
        |> Map.new(&{&1.scryfall_id, &1})
    end
  end

  defp existing_deck_cards_by_key(%Deck{id: deck_id}) do
    DeckCard
    |> where([deck_card], deck_card.deck_id == ^deck_id)
    |> preload(:deck_allocations)
    |> Repo.all()
    |> Map.new(&{deck_card_key(&1), &1})
  end

  defp update_deck_card!(%DeckCard{} = deck_card, attrs) do
    changes =
      %{"quantity" => attrs.quantity}
      |> Map.merge(printing_changes(deck_card, attrs))

    updated = deck_card |> DeckCard.changeset(changes) |> Repo.update() |> ok!()

    if updated.quantity < deck_card.quantity, do: TrimDeckCardAllocations.run!(updated)
    updated
  end

  defp move_deck_card!(%DeckCard{} = deck_card, attrs) do
    changes =
      %{"quantity" => attrs.quantity, "zone" => attrs.zone}
      |> Map.merge(printing_changes(deck_card, attrs))

    changes =
      if attrs.zone == "considering", do: Map.put(changes, "proxy_quantity", 0), else: changes

    updated = deck_card |> DeckCard.changeset(changes) |> Repo.update() |> ok!()

    cond do
      attrs.zone == "considering" -> ClearDeckCardAllocations.run!(updated)
      updated.quantity < deck_card.quantity -> TrimDeckCardAllocations.run!(updated)
      true -> :ok
    end

    updated
  end

  defp insert_deck_card!(%Deck{id: deck_id}, attrs) do
    %DeckCard{}
    |> DeckCard.changeset(%{
      "deck_id" => deck_id,
      "oracle_id" => attrs.oracle_id,
      "zone" => attrs.zone,
      "quantity" => attrs.quantity,
      "finish" => attrs.finish,
      "preferred_printing_id" => attrs.preferred_printing_id
    })
    |> Repo.insert()
    |> ok!()
  end

  defp delete_deck_card!(%DeckCard{} = deck_card) do
    deck_card |> DeleteDeckCard.for_deck_deletion() |> ok!()
  end

  # Allocation pins the deck card to the owned printing, so only unallocated
  # cards keep following the remote deck's printing and finish.
  defp printing_changes(%DeckCard{deck_allocations: []}, attrs) do
    %{"finish" => attrs.finish}
    |> maybe_put_printing(attrs.preferred_printing_id)
  end

  defp printing_changes(%DeckCard{}, _attrs), do: %{}

  defp maybe_put_printing(changes, nil), do: changes
  defp maybe_put_printing(changes, id), do: Map.put(changes, "preferred_printing_id", id)

  defp record_failure(%Deck{} = deck, reason) do
    deck
    |> Deck.external_sync_changeset(%{external_sync_error: failure_message(reason)})
    |> Repo.update()

    {:error, reason}
  end

  defp failure_message(%Changeset{} = changeset) do
    changeset
    |> Changeset.traverse_errors(fn {message, _opts} -> message end)
    |> Enum.map_join(", ", fn {field, messages} -> "#{field} #{Enum.join(messages, ", ")}" end)
  end

  defp failure_message(:forbidden), do: "The deck site refused the request (HTTP 403)."
  defp failure_message(:timeout), do: "Timed out reaching the deck site."
  defp failure_message(:request_failed), do: "Could not reach the deck site."
  defp failure_message(:invalid_json), do: "The deck site returned an unreadable response."
  defp failure_message(:body_too_large), do: "The deck site's response was too large."

  defp failure_message({:http_error, 404}),
    do: "The deck was not found; it may be private or deleted."

  defp failure_message({:http_error, status}), do: "The deck site returned HTTP #{status}."
  defp failure_message(reason) when is_binary(reason), do: reason
  defp failure_message(reason), do: "Could not sync: #{inspect(reason)}"

  defp ok!({:ok, value}), do: value
  defp ok!({:error, reason}), do: Repo.rollback(reason)

  defp deck_card_key(%DeckCard{oracle_id: oracle_id, zone: zone}), do: {oracle_id, zone}
end
