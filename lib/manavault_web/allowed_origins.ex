defmodule ManavaultWeb.AllowedOrigins do
  @moduledoc """
  Builds the endpoint's WebSocket `:check_origin` list from
  `MANAVAULT_ALLOWED_ORIGINS`.

  By default Phoenix only accepts socket connections whose `Origin` host matches
  `PHX_HOST`. An instance reached under more than one hostname (for example a
  public reverse proxy plus a Tailscale `ts.net` name) must list the other
  origins explicitly, or live updates break on every hostname but `PHX_HOST`.

  Called from `config/runtime.exs`, so it must stay pure and must not depend on
  any started application.
  """

  @doc """
  Returns the endpoint `:check_origin` value, or `nil` when no extra origins are
  configured so Phoenix keeps its default check.

  `PHX_HOST` is always allowed by host alone (any scheme or port), matching
  Phoenix's default, so listing extra origins never locks out the primary
  hostname.

  Raises `ArgumentError` when an entry is not an `http://` or `https://` origin.
  """
  @spec check_origin(String.t(), String.t() | nil) :: [String.t()] | nil
  def check_origin(host, value) do
    case parse(value) do
      [] -> nil
      origins -> ["//" <> host | origins]
    end
  end

  @doc """
  Parses a comma-separated origin list, trimming whitespace and trailing slashes
  and dropping blank entries.
  """
  @spec parse(String.t() | nil) :: [String.t()]
  def parse(nil), do: []

  def parse(value) do
    value
    |> String.split(",")
    |> Enum.map(&String.trim/1)
    |> Enum.reject(&(&1 == ""))
    |> Enum.map(&normalize!/1)
    |> Enum.uniq()
  end

  defp normalize!(entry) do
    origin = entry |> String.trim_trailing("/") |> String.downcase()

    case URI.new(origin) do
      {:ok, %URI{scheme: scheme, host: host, userinfo: nil, path: nil, query: nil, fragment: nil}}
      when scheme in ["http", "https"] and host not in [nil, ""] ->
        origin

      _invalid ->
        raise ArgumentError, """
        environment variable MANAVAULT_ALLOWED_ORIGINS has an invalid entry: #{inspect(entry)}.
        Each entry must be http:// or https:// followed by a hostname and an optional port,
        with no path, e.g. MANAVAULT_ALLOWED_ORIGINS=https://manavault.mytailnet.ts.net
        """
    end
  end
end
