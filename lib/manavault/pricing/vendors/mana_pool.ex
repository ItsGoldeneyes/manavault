defmodule Manavault.Pricing.Vendors.ManaPool do
  @moduledoc """
  ManaPool's public singles price feed. Each printing and finish uses the
  lowest near-mint listing, falling back to the lowest lightly-played-or-better
  listing and then the lowest listing of any condition. Listing prices are
  keyed per finish, so nonfoil, foil, and etched never share a price.
  """

  @prices_url "https://manapool.com/api/v1/prices/singles"

  @listing_prices [
    {"nonfoil", ["price_cents_nm", "price_cents_lp_plus", "price_cents"]},
    {"foil", ["price_cents_nm_foil", "price_cents_lp_plus_foil", "price_cents_foil"]},
    {"etched", ["price_cents_nm_etched", "price_cents_lp_plus_etched", "price_cents_etched"]}
  ]

  def vendor, do: "manapool"

  def sync_interval, do: :timer.hours(6)

  def fetch(req_options \\ []) do
    options =
      Keyword.merge(
        [url: @prices_url, receive_timeout: :timer.minutes(5)],
        req_options
      )

    case Req.get(options) do
      {:ok, %Req.Response{status: 200, body: body}} ->
        {:ok, rows(body)}

      {:ok, %Req.Response{status: status}} ->
        {:error, "ManaPool returned HTTP #{status}"}

      {:error, exception} ->
        {:error, Exception.message(exception)}
    end
  end

  def rows(%{"data" => variants}) when is_list(variants) do
    Enum.flat_map(variants, fn variant ->
      with %{"scryfall_id" => scryfall_id} when is_binary(scryfall_id) and scryfall_id != "" <-
             variant do
        for {finish, fields} <- @listing_prices,
            price_cents = first_price(variant, fields),
            not is_nil(price_cents) do
          %{scryfall_id: scryfall_id, finish: finish, price_cents: price_cents}
        end
      else
        _invalid_variant -> []
      end
    end)
  end

  def rows(_body), do: []

  defp first_price(variant, fields) do
    Enum.find_value(fields, fn field ->
      case variant[field] do
        price_cents when is_integer(price_cents) and price_cents > 0 -> price_cents
        _missing_or_invalid -> nil
      end
    end)
  end
end
