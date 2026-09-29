defmodule Manavault.Pricing.Vendors.TcgTracking do
  @moduledoc """
  TCGPlayer prices via openapi.tcgtracking.com (free, no auth, updated daily).

  TCGPlayer's own API is closed to new developers, so this walks every MTG
  set on tcgtracking, joining each set's card products (which carry Scryfall
  IDs) with its per-condition SKU listings and its pricing block (TCGPlayer
  NM market/low per finish subtype). Prices use the TCGPlayer market price,
  falling back to the lowest near-mint listing, then the best available
  condition, for subtypes without one.
  Individual set failures are skipped so one bad set cannot lose a whole sync;
  a set without SKU data still syncs from its pricing block.
  """

  require Logger

  alias Manavault.Pricing.Money

  @base_url "https://openapi.tcgtracking.com/v1"
  @magic_category 1
  @language "EN"
  @fallback_conditions ~w(LP MP HP DMG)

  def vendor, do: "tcgplayer"

  def sync_interval, do: :timer.hours(24)

  def fetch(req_options \\ []) do
    with {:ok, %{"sets" => sets}} when is_list(sets) <- get_json("/sets", req_options) do
      rows =
        sets
        |> Enum.map(& &1["id"])
        |> Enum.reject(&is_nil/1)
        |> Enum.flat_map(&set_rows(&1, req_options))

      {:ok, rows}
    else
      {:ok, _body} -> {:error, "tcgtracking returned an unexpected sets payload"}
      {:error, reason} -> {:error, reason}
    end
  end

  defp set_rows(set_id, req_options) do
    with {:ok, cards} <- get_json("/sets/#{set_id}/cards", req_options),
         {:ok, pricing} <- get_json("/sets/#{set_id}/pricing", req_options) do
      rows(cards, pricing, set_skus(set_id, req_options))
    else
      {:error, reason} ->
        Logger.warning("tcgtracking set #{set_id} skipped: #{inspect(reason)}")
        []
    end
  end

  # Some sets have no SKU data (tcgtracking returns 404); their pricing block
  # still carries the NM low and market prices.
  defp set_skus(set_id, req_options) do
    case get_json("/sets/#{set_id}/skus", req_options) do
      {:ok, skus} ->
        skus

      {:error, reason} ->
        Logger.debug("tcgtracking set #{set_id} has no SKU data: #{inspect(reason)}")
        %{}
    end
  end

  @doc """
  Joins a set's card products with its SKU listings and pricing block.

  Each finish subtype uses the TCGPlayer market price. Without one, it falls
  back to English listings: the lowest near-mint listing, else the lowest
  listing in the best available condition
  (#{Enum.join(@fallback_conditions, " > ")}). The pricing block's `low` is the
  near-mint low, so it covers sets without SKU data. Subtypes with none of
  these prices are skipped.
  """
  def rows(cards, pricing, skus \\ %{})

  def rows(%{"products" => products}, %{"prices" => prices}, skus)
      when is_list(products) and is_map(prices) do
    sku_products = sku_products(skus)

    Enum.flat_map(products, fn product ->
      product_id = to_string(product["id"])

      case product_scryfall_id(product) do
        nil ->
          []

        scryfall_id ->
          subtype_rows(
            scryfall_id,
            pricing_subtypes(prices[product_id]),
            listing_subtypes(sku_products[product_id])
          )
      end
    end)
  end

  def rows(_cards, _pricing, _skus), do: []

  defp sku_products(%{"products" => products}) when is_map(products), do: products
  defp sku_products(_skus), do: %{}

  defp pricing_subtypes(%{"tcg" => subtypes}) when is_map(subtypes) do
    Map.filter(subtypes, fn {_subtype, price} -> is_map(price) end)
  end

  defp pricing_subtypes(_price), do: %{}

  # Groups a product's English SKUs as %{subtype => %{condition => low_cents}}.
  defp listing_subtypes(skus) when is_map(skus) do
    for {_sku_id, %{"lng" => @language, "var" => subtype, "cnd" => condition} = sku} <- skus,
        cents = Money.to_cents(sku["low"]),
        not is_nil(cents),
        reduce: %{} do
      acc ->
        Map.update(acc, subtype, %{condition => cents}, fn lows ->
          Map.update(lows, condition, cents, &min(&1, cents))
        end)
    end
  end

  defp listing_subtypes(_skus), do: %{}

  # Some products (notably special treatments like surge foils) have no
  # top-level scryfall_id but carry one in their matched cardtrader entry.
  defp product_scryfall_id(%{"scryfall_id" => scryfall_id})
       when is_binary(scryfall_id) and scryfall_id != "" do
    scryfall_id
  end

  defp product_scryfall_id(%{"cardtrader" => [%{"scryfall_id" => scryfall_id} | _rest]})
       when is_binary(scryfall_id) and scryfall_id != "" do
    scryfall_id
  end

  defp product_scryfall_id(_product), do: nil

  defp subtype_rows(scryfall_id, pricing_subtypes, listing_subtypes) do
    subtypes = Enum.uniq(Map.keys(pricing_subtypes) ++ Map.keys(listing_subtypes))

    for subtype <- subtypes,
        cents = price_cents(pricing_subtypes[subtype] || %{}, listing_subtypes[subtype] || %{}),
        not is_nil(cents) do
      %{scryfall_id: scryfall_id, finish: subtype_finish(subtype), price_cents: cents}
    end
  end

  # Listing lows come from a daily snapshot that often undercuts what is
  # actually buyable, so they only price subtypes without a market price.
  defp price_cents(price, listings) do
    Money.to_cents(price["market"]) ||
      listings["NM"] ||
      Money.to_cents(price["low"]) ||
      Enum.find_value(@fallback_conditions, &listings[&1])
  end

  defp subtype_finish(subtype) do
    subtype = String.downcase(subtype)

    cond do
      String.contains?(subtype, "etched") -> "etched"
      String.contains?(subtype, "foil") -> "foil"
      true -> "nonfoil"
    end
  end

  defp get_json(path, req_options) do
    options =
      Keyword.merge(
        [url: @base_url <> "/#{@magic_category}" <> path, receive_timeout: :timer.minutes(2)],
        req_options
      )

    case Req.get(options) do
      {:ok, %Req.Response{status: 200, body: body}} when is_map(body) -> {:ok, body}
      {:ok, %Req.Response{status: status}} -> {:error, "HTTP #{status}"}
      {:error, exception} -> {:error, Exception.message(exception)}
    end
  end
end
