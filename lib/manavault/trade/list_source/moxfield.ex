defmodule Manavault.Trade.ListSource.Moxfield do
  @moduledoc """
  Validates Moxfield deck links and fetches the deck from Moxfield's public
  (unofficial) v3 API. Only `api2.moxfield.com` is ever requested, and only
  with an id that already matched `@id_pattern`.
  """

  alias Manavault.Catalog.Util
  alias Manavault.Trade.ListSource.Http

  @hosts ~w(moxfield.com www.moxfield.com)
  @id_pattern ~r/^[A-Za-z0-9_-]{5,64}$/
  @api_base "https://api2.moxfield.com/v3/decks/all/"
  @public_base "https://moxfield.com/decks/"
  @boards %{
    "mainboard" => "mainboard",
    "sideboard" => "considering",
    "maybeboard" => "considering",
    "commanders" => "commander"
  }
  @finishes %{"nonFoil" => "nonfoil", "foil" => "foil", "etched" => "etched"}
  @friendly_error "Couldn't fetch that Moxfield deck (it may be private). Paste the deck export text instead."
  @forbidden_error "Moxfield blocked the request — their API only serves approved apps. " <>
                     "Use Moxfield's Export > Copy and paste the list instead."

  def host?(host) when is_binary(host), do: String.downcase(host) in @hosts
  def host?(_host), do: false

  @doc "Extracts and validates a deck id from a `/decks/<id>[...]` path."
  def deck_id(path) when is_binary(path) do
    case String.split(path, "/", trim: true) do
      ["decks", id | _rest] -> validate_id(id)
      _other -> :error
    end
  end

  def deck_id(_path), do: :error

  @doc "Canonical public URL for a validated deck id."
  def public_url(id) when is_binary(id), do: @public_base <> id

  @doc """
  Fetches and normalizes the deck for a validated `id`, translating failures
  into a user-facing paste-suggesting message.
  """
  def fetch(id) when is_binary(id) do
    case fetch_deck(id) do
      {:ok, deck} -> {:ok, deck}
      {:error, :forbidden} -> {:error, @forbidden_error}
      {:error, _reason} -> {:error, @friendly_error}
    end
  end

  @doc """
  Fetches and normalizes the deck for a validated `id`, returning the raw
  `Manavault.Trade.ListSource.Http` error reason on failure. Each entry
  carries `name`, `quantity`, `zone`, `set_code`, `collector_number`,
  `scryfall_id`, and `finish`.
  """
  def fetch_deck(id) when is_binary(id) do
    case Http.get_json(@api_base <> id, req_options: req_options()) do
      {:ok, payload} -> {:ok, entries_from_payload(payload)}
      {:error, reason} -> {:error, reason}
    end
  end

  defp validate_id(id) do
    if Regex.match?(@id_pattern, id), do: {:ok, id}, else: :error
  end

  defp entries_from_payload(payload) do
    entries =
      Enum.flat_map(@boards, fn {board_key, zone} -> board_entries(payload, board_key, zone) end)

    %{source_name: Map.get(payload, "name"), entries: entries}
  end

  defp board_entries(payload, board_key, zone) do
    case get_in(payload, ["boards", board_key, "cards"]) do
      %{} = cards ->
        cards |> Map.values() |> Enum.map(&normalize_entry(&1, zone)) |> Enum.reject(&is_nil/1)

      _other ->
        []
    end
  end

  defp normalize_entry(%{"card" => %{"name" => name}} = entry, zone)
       when is_binary(name) and name != "" do
    %{
      name: name,
      quantity: entry |> Map.get("quantity", 1) |> Util.positive_quantity(),
      zone: zone,
      set_code: get_in(entry, ["card", "set"]),
      collector_number: get_in(entry, ["card", "cn"]),
      scryfall_id: get_in(entry, ["card", "scryfall_id"]),
      finish: finish(entry)
    }
  end

  defp normalize_entry(_entry, _zone), do: nil

  defp finish(%{"finish" => finish}) when is_map_key(@finishes, finish),
    do: Map.fetch!(@finishes, finish)

  defp finish(%{"isFoil" => true}), do: "foil"
  defp finish(_entry), do: "nonfoil"

  defp req_options, do: Application.get_env(:manavault, :trade_moxfield_req_options, [])
end
