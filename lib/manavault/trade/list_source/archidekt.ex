defmodule Manavault.Trade.ListSource.Archidekt do
  @moduledoc """
  Validates Archidekt deck links and fetches the deck from Archidekt's public
  API. Only `archidekt.com` is ever requested, and only with an id that
  already matched `@id_pattern`.
  """

  alias Manavault.Catalog.Util
  alias Manavault.Trade.ListSource.Http

  @hosts ~w(archidekt.com www.archidekt.com)
  @id_pattern ~r/^\d{1,12}$/
  @api_base "https://archidekt.com/api/decks/"
  @public_base "https://archidekt.com/decks/"
  @finishes %{"Normal" => "nonfoil", "Foil" => "foil", "Etched" => "etched"}
  @friendly_error "Couldn't fetch that Archidekt deck (it may be private). Paste the deck export text instead."

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

  @doc "Fetches and normalizes the deck for a validated `id` with a user-facing error."
  def fetch(id) when is_binary(id) do
    case fetch_deck(id) do
      {:ok, deck} -> {:ok, deck}
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
    case Http.get_json(@api_base <> id <> "/", req_options: req_options()) do
      {:ok, payload} -> {:ok, entries_from_payload(payload)}
      {:error, reason} -> {:error, reason}
    end
  end

  defp validate_id(id) do
    if Regex.match?(@id_pattern, id), do: {:ok, id}, else: :error
  end

  defp entries_from_payload(payload) do
    entries =
      payload
      |> Map.get("cards", [])
      |> Enum.map(&normalize_entry/1)
      |> Enum.reject(&is_nil/1)

    %{source_name: Map.get(payload, "name"), entries: entries}
  end

  defp normalize_entry(%{"card" => %{"oracleCard" => %{"name" => name}}} = entry)
       when is_binary(name) and name != "" do
    %{
      name: name,
      quantity: entry |> Map.get("quantity", 1) |> Util.positive_quantity(),
      zone: zone_from_categories(Map.get(entry, "categories", [])),
      set_code: nil,
      collector_number: nil,
      scryfall_id: get_in(entry, ["card", "uid"]),
      finish: finish(Map.get(entry, "modifier"))
    }
  end

  defp normalize_entry(_entry), do: nil

  defp zone_from_categories(categories) when is_list(categories) do
    cond do
      "Maybeboard" in categories -> "considering"
      "Sideboard" in categories -> "considering"
      "Commander" in categories -> "commander"
      true -> "mainboard"
    end
  end

  defp zone_from_categories(_categories), do: "mainboard"

  defp finish(modifier) when is_map_key(@finishes, modifier), do: Map.fetch!(@finishes, modifier)
  defp finish(_modifier), do: "nonfoil"

  defp req_options, do: Application.get_env(:manavault, :trade_archidekt_req_options, [])
end
