defmodule ManavaultWeb.Plugs.ScannerExportAuth do
  @moduledoc """
  Read access to the scanner training corrections: the owner's session, or the read-only
  `SCANNER_CORRECTIONS_TOKEN` (at least 32 characters) that Oracle's importer sends as a
  bearer token.
  """

  import Phoenix.Controller, only: [json: 2]
  import Plug.Conn

  alias ManavaultWeb.Plugs.Authentication

  def init(opts), do: opts

  def call(conn, _opts) do
    case authorize(conn) do
      :ok ->
        put_resp_header(conn, "cache-control", "private, no-store")

      {:error, message} ->
        conn
        |> put_status(:unauthorized)
        |> json(%{errors: [%{message: message}]})
        |> halt()
    end
  end

  # The messages name the cause (token export disabled vs a wrong token) so a failing Oracle
  # pull is fixable; neither reveals the token.
  defp authorize(conn) do
    case get_req_header(conn, "authorization") do
      [] ->
        if Authentication.authenticated?(conn), do: :ok, else: {:error, "Authentication required"}

      ["Bearer " <> token] ->
        check_token(token, Application.get_env(:manavault, :scanner_corrections_token))

      _other ->
        {:error, "Expected an Authorization: Bearer token"}
    end
  end

  defp check_token(token, expected) when is_binary(expected) and byte_size(expected) >= 32 do
    if Plug.Crypto.secure_compare(String.trim(token), expected),
      do: :ok,
      else: {:error, "Invalid scanner corrections token"}
  end

  defp check_token(_token, _expected),
    do:
      {:error,
       "Token export is disabled: set SCANNER_CORRECTIONS_TOKEN (32+ characters) on the server and restart it"}
end
